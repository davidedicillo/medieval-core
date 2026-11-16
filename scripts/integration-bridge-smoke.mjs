#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import { randomBytes } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { createPlatform } from '../services/platform/server.mjs';
import { createMailer } from '../services/platform/auth.mjs';
import { startLocalPostgres } from './local-postgres.mjs';

const root = await fs.mkdtemp('/tmp/medieval-platform-');
let postgres, pool, platform;
const integration={id:'test-bridge',tokenHash:(await import('node:crypto')).createHash('sha256').update('test-service-secret').digest('hex'),ownerId:'pending',projectId:'pending',reviewerIds:['pending']};
try {
  postgres = await startLocalPostgres(path.join(root,'postgres'));
  pool = new Pool(postgres.config);
  const reservation = net.createServer();
  await new Promise((resolve) => reservation.listen(0,'127.0.0.1',resolve));
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
  const baseURL = `http://127.0.0.1:${port}`;
  const mailer = createMailer({ local: true });
  const secret = randomBytes(48).toString('base64url');
  platform = await createPlatform({ pool, baseURL, secret, mailer, dataDir: path.join(root,'labels'), appId: 'TEST.com.medieval.app',integrations:[integration] });
  await new Promise((resolve) => platform.server.listen(port,'127.0.0.1',resolve));
  async function request(route,{ token, body, status = 200, origin = baseURL, cookie } = {}) {
    const response = await fetch(baseURL+route,{ method: body === undefined ? 'GET':'POST', headers: {
      ...(token ? { authorization: 'Bearer '+token }:{}), ...(body === undefined ? {} : { 'content-type':'application/json', origin }), ...(cookie ? { cookie }:{}),
    }, body: body === undefined ? undefined : JSON.stringify(body) });
    const content = await response.text();
    assert.equal(response.status,status,`${route}: ${response.status} ${content.slice(0,300)}`);
    return { response, body: response.headers.get('content-type')?.includes('application/json') ? JSON.parse(content):content };
  }
  async function signIn(email,name) {
    await request('/api/auth/email-otp/send-verification-otp',{ body:{email,type:'sign-in'} });
    const otp=mailer.messages.find((m)=>m.to===email&&m.subject.includes('code')).text.match(/code is (\d{6})/)[1];
    const result=await request('/api/auth/sign-in/email-otp',{body:{email,otp,name}});
    assert(result.response.headers.get('set-auth-token'));
    return { token:result.response.headers.get('set-auth-token'),user:result.body.user,cookie:result.response.headers.getSetCookie().map((s)=>s.split(';')[0]).join('; ') };
  }

  const owner=await signIn('owner@example.test','Owner'),reviewer=await signIn('reviewer@example.test','Reviewer');
  const workspace=await platform.access.createWorkspace(owner.user.id,'Integration workspace');
  const project=await platform.access.createProject(owner.user.id,workspace.id,'Exceptions');
  integration.ownerId=owner.user.id;integration.projectId=project.id;integration.reviewerIds=[reviewer.user.id];
  const route='/api/integrations/test-bridge/batches/run-1';
  const card={schemaVersion:'eval-card.v1',cardId:'case-1',sourceKey:'case-1',question:'Is this a separate tray?',claim:{template:'component',path:'tray',value:'Independent tray'},media:[]};
  const input={name:'Listing exceptions',rubricVersion:'catalog-v1',rubric:'Review every gallery photo. Unseen is not absent.',cards:[card]};
  async function service(path,{method='GET',body,token='test-service-secret',status=200}={}){
    const r=await fetch(baseURL+path,{method,headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:body?JSON.stringify(body):undefined});
    const d=await r.json();assert.equal(r.status,status,JSON.stringify(d));return d;
  }
  await service(route,{token:'wrong',status:401});
  await service('/api/me',{status:401});
  const preview=await service(route+'/preview',{method:'POST',body:input});assert.equal(preview.newCardCount,1);
  assert.equal((await pool.query('SELECT count(*)::int n FROM medieval_batch')).rows[0].n,0);
  const created=await service(route,{method:'PUT',body:input});assert.equal(created.imported,1);
  const replay=await service(route,{method:'PUT',body:input});assert.equal(replay.imported,0);assert.equal(replay.batchId,created.batchId);
  await service(route,{method:'PUT',body:{...input,cards:[{...card,question:'Changed meaning'}]},status:409});
  await service(route,{method:'PUT',body:{...input,rubric:'A different policy'},status:409});
  const available=await request('/api/me/batches',{token:reviewer.token});assert.equal(available.body.batches[0].id,created.batchId);
  const reviewRoute='/api/mobile/eval/results?batchId='+created.batchId+'&projectId='+project.id;
  const result=await request(reviewRoute,{token:reviewer.token,body:{eventId:'real-human-event',cardId:'case-1',answer:'yes',reviewer:'spoofed',rubricVersion:'catalog-v1'}});
  assert.equal(result.body.result.userId,reviewer.user.id);
  const labels=await service(route+'/results');assert.equal(labels.labels[0].resolvedAnswer,'yes');assert.equal(labels.labels[0].status,'expert_reviewed');
  assert.equal(labels.labels[0].judgments[0].userId,reviewer.user.id);
  await service(route+'/retire',{method:'POST',body:{cardIds:['case-1']}});
  const deck=await request('/api/mobile/eval/cards?batchId='+created.batchId+'&projectId='+project.id,{token:reviewer.token});assert.equal(deck.body.cards.length,0);
  await request(reviewRoute,{token:reviewer.token,status:409,body:{eventId:'late-event',cardId:'case-1',answer:'no',rubricVersion:'catalog-v1'}});
  // A crash after the metadata transaction is recoverable, with no duplicate batch.
  const store=platform.storeFor(workspace.id),original=store.importCards.bind(store);let failed=false;
  store.importCards=async args=>{if(!failed){failed=true;throw Error('Simulated interruption');}return original(args);};
  await service(route.replace('run-1','run-2'),{method:'PUT',body:input,status:500});
  const recovered=await service(route.replace('run-1','run-2'),{method:'PUT',body:input});assert.equal(recovered.imported,1);
  assert.equal((await pool.query('SELECT count(*)::int n FROM medieval_batch')).rows[0].n,2);
  await platform.access.updateBatch(owner.user.id,recovered.batchId,{status:'paused'});
  await service(route.replace('run-1','run-2'),{method:'PUT',body:input});
  assert.equal((await service(route.replace('run-1','run-2'))).status,'paused');
  console.log('Integration bridge: scope, preview, immutable retries, reviewer access, authentic decisions, retirement, crash recovery and pause preservation passed.');
} finally {
  if(platform)await platform.close();
  if(pool)await pool.end();
  if(postgres)await postgres.stop();
  await fs.rm(root,{recursive:true,force:true});
}
