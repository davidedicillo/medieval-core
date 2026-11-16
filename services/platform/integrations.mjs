import {createHash, timingSafeEqual} from 'node:crypto';
import {normalizeEvalCard, validateEvalCard} from '../../packages/schema/index.mjs';
import {fail, requiredName} from './access.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const stable = value => JSON.stringify(value, function(key, item) {
  return item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map(k => [k,item[k]])) : item;
});

// Operator-provisioned, project-scoped service credentials. They cannot sign in,
// submit human judgments, invite people, or access another project's batches.
export function createIntegrationBridge({pool, access, storeFor, integrations = []}) {
  const configured = new Map();
  for (const entry of integrations) {
    if (!/^[a-z0-9-]{1,80}$/.test(entry.id) || !/^[a-f0-9]{64}$/.test(entry.tokenHash)
      || !entry.projectId || !entry.ownerId || !Array.isArray(entry.reviewerIds)
      || !entry.reviewerIds.length || entry.reviewerIds.some(id=>typeof id!=='string'||!id)
      || configured.has(entry.id)) throw Error('Invalid integration configuration');
    configured.set(entry.id, entry);
  }
  const locks = new Map();
  async function locked(key, fn) {
    const previous=locks.get(key)||Promise.resolve();
    const next=previous.catch(()=>{}).then(fn); locks.set(key,next);
    try{return await next;}finally{if(locks.get(key)===next)locks.delete(key);}
  }
  return async function integrationRequest({req,url,readBody}) {
    const match=url.pathname.match(/^\/api\/integrations\/([a-z0-9-]+)\/batches\/([a-zA-Z0-9_-]{1,120})(?:\/(results|preview|retire))?$/);
    if (!match) return null;
    const [,id,externalKey,action]=match, config=configured.get(id);
    const token=String(req.headers.authorization||'').match(/^Bearer (\S+)$/)?.[1];
    const actual=Buffer.from(hash(token||''),'hex');
    if (!config || !token || !timingSafeEqual(actual,Buffer.from(config.tokenHash,'hex'))) fail(401,'Invalid integration credential.');
    if(req.headers.origin)fail(403,'Integration credentials are for server requests only.');
    const project=await access.projectForManager(config.ownerId,config.projectId);
    const batchId='integration-'+hash(`${id}:${project.id}:${externalKey}`).slice(0,40);
    const ctx={projectId:project.id,batchId}, store=storeFor(project.workspace_id);
    return locked(batchId,async()=>{
      const batch=(await pool.query('SELECT * FROM medieval_batch WHERE id=$1 AND project_id=$2',[batchId,project.id])).rows[0];
      if(req.method==='GET'&&action==='results') {
        if(!batch)fail(404,'Integration batch not found.');
        const labels=await store.quality.labels(ctx);
        return {batchId,projectId:project.id,status:batch.status,labels};
      }
      if(req.method==='GET'&&!action) {
        if(!batch)fail(404,'Integration batch not found.');
        return {batchId,projectId:project.id,status:batch.status,cards:await store.listCards(ctx)};
      }
      if(req.method==='POST'&&action==='retire') {
        if(!batch)fail(404,'Integration batch not found.');
        const body=await readBody(req), cards=await store.listCards(ctx);
        if(!Array.isArray(body.cardIds)||body.cardIds.length>200||body.cardIds.some(id=>!cards.some(c=>c.cardId===id)))fail(400,'Select existing integration cards.');
        const retired=new Set(body.cardIds);
        await store.importCards({...ctx,cards:cards.filter(c=>retired.has(c.cardId)).map(c=>({...c,integrationRetiredAt:c.integrationRetiredAt||new Date().toISOString()}))});
        return {batchId,retired:retired.size};
      }
      if(!((req.method==='PUT'&&!action)||(req.method==='POST'&&action==='preview')))fail(405,'Method not allowed.');
      const body=await readBody(req);
      if(!Array.isArray(body.cards)||!body.cards.length||body.cards.length>200)fail(400,'Supply 1 to 200 review cards.');
      const cards=body.cards.map(c=>{
        const card=normalizeEvalCard(c,ctx);
        if(validateEvalCard(card).length||card.cardId.startsWith('quality:')||card.integrationRetiredAt)fail(400,'Invalid integration review card.');
        delete card.quality;delete card.reviewRubric;
        return card;
      });
      if(new Set(cards.map(c=>c.cardId)).size!==cards.length)fail(400,'Duplicate card IDs.');
      const existing=batch?await store.listCards(ctx):[];
      for(const card of cards){const old=existing.find(c=>c.cardId===card.cardId);if(old&&stable(old)!==stable(card))fail(409,'A card revision is immutable. Use a new card ID.');}
      if(action==='preview')return {cardCount:cards.length,newCardCount:cards.filter(c=>!existing.some(o=>o.cardId===c.cardId)).length,cards:cards.slice(0,3)};
      const name=requiredName(body.name),rubric=String(body.rubric||'');
      if(!rubric.trim()||rubric.length>20000||!/^[-a-zA-Z0-9_.]{1,100}$/.test(body.rubricVersion||''))fail(400,'A versioned review rubric is required.');
      const reviewers=(await pool.query('SELECT id FROM "user" WHERE id=ANY($1::text[]) AND "emailVerified"=true',[config.reviewerIds])).rows;
      if(reviewers.length!==new Set(config.reviewerIds).size)fail(409,'An assigned reviewer is unavailable.');
      const policyDigest=hash(stable({rubric,rubricVersion:body.rubricVersion,reviewers:config.reviewerIds}));
      const journal=(await pool.query('SELECT * FROM medieval_integration_batch WHERE batch_id=$1',[batchId])).rows[0];
      if(batch&&!journal)fail(409,'Batch is not owned by this integration.');
      if(journal&&(journal.integration_id!==id||journal.policy_digest!==policyDigest))fail(409,'Use a new batch for a different review policy.');
      if(journal?.ready) {
        const quality=await store.quality.read(ctx);
        if(quality.settings.rubricVersion!==body.rubricVersion||quality.settings.rubric!==rubric)fail(409,'Use a new batch for a different rubric.');
      }
      // A deterministic ID makes recovery after interrupted creation idempotent.
      if(!batch){
        const client=await pool.connect();
        try{
          await client.query('BEGIN');
          await client.query("INSERT INTO medieval_batch(id,project_id,name,description,audience) VALUES($1,$2,$3,$4,'invited')",[batchId,project.id,name,String(body.description||'').slice(0,4000)]);
          await client.query('INSERT INTO medieval_integration_batch(batch_id,integration_id,policy_digest) VALUES($1,$2,$3)',[batchId,id,policyDigest]);
          await client.query('COMMIT');
        }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
      }
      await store.createBatch({...ctx,name,description:body.description,projectName:project.name});
      const imported=await store.importCards({...ctx,cards:cards.filter(c=>!existing.some(o=>o.cardId===c.cardId))});
      if(!journal?.ready) {
        const current=await store.quality.read(ctx);
        if(current.settings.rubricVersion!==body.rubricVersion||current.settings.rubric!==rubric)
          await store.quality.configure(ctx,{mode:'solo',rubricVersion:body.rubricVersion,rubric,expertReviewers:config.reviewerIds,calibration:'off'},'integration:'+id);
        for(const reviewer of config.reviewerIds) {
          await pool.query("INSERT INTO medieval_membership(workspace_id,user_id,role) VALUES($1,$2,'guest') ON CONFLICT DO NOTHING",[project.workspace_id,reviewer]);
          await pool.query('INSERT INTO medieval_assignment(batch_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[batchId,reviewer]);
        }
        await pool.query("UPDATE medieval_batch SET status='active' WHERE id=$1",[batchId]);
        await pool.query('UPDATE medieval_integration_batch SET ready=true WHERE batch_id=$1',[batchId]);
      }
      return {batchId,projectId:project.id,imported:imported.imported,totalCards:imported.totalCards,reviewPath:`/review?batchId=${batchId}&projectId=${project.id}`};
    });
  };
}
