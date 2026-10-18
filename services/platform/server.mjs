import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { toNodeHandler, fromNodeHeaders } from 'better-auth/node';
import { createPlatformAuth, createMailer } from './auth.mjs';
import { PlatformAccess, fail, requiredName } from './access.mjs';
import { renderPlatformPage, renderInboxPage } from './web.mjs';
import { renderDemoReviewer } from '../eval-api/demo-reviewer.mjs';
import { EvalFileStore } from '../eval-api/store.mjs';
import { previewCardsFromText, generateCardsFromRecords } from '../../packages/schema/card-generator.mjs';
import { resultsToCsv } from '../eval-api/store.mjs';

function send(res, status, value, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' });
  res.end(type.startsWith('application/json') ? JSON.stringify(value) : value);
}

async function readBody(req) {
  const parts = [];
  let size = 0;
  for await (const part of req) {
    size += part.length;
    if (size > 2 * 1024 * 1024) fail(413, 'Uploads must be smaller than 2 MB.');
    parts.push(part);
  }
  try { return JSON.parse(Buffer.concat(parts).toString() || '{}'); }
  catch { fail(400, 'The request must contain valid JSON.'); }
}

function preview(body) {
  return Array.isArray(body.records)
    ? generateCardsFromRecords(body.records, { adapter: body.adapter, projectId: body.projectId, batchId: body.batchId })
    : previewCardsFromText(body.raw ?? '', { adapter: body.adapter, format: body.format });
}

export async function createPlatform({ pool, databaseUrl, baseURL, secret, dataDir, mailer, appId = '' }) {
  const ownedPool = !pool;
  pool ??= new Pool({ connectionString: databaseUrl });
  const origin = new URL(baseURL).origin;
  if (mailer.local && !['127.0.0.1', 'localhost', '[::1]'].includes(new URL(origin).hostname)) fail(500, 'The development inbox requires a loopback platform URL.');
  let auth;
  try {
    auth = await createPlatformAuth({ pool, baseURL: origin, secret, mailer });
    const access = new PlatformAccess(pool);
    await access.migrate();
    const stores = new Map();
    const storeFor = (workspaceId) => {
      if (!stores.has(workspaceId)) stores.set(workspaceId, new EvalFileStore({ dataDir: path.join(dataDir, 'workspaces', workspaceId) }));
      return stores.get(workspaceId);
    };
    const nodeAuthHandler = toNodeHandler(auth);
    async function batchSummary(batch, userId) {
      const store = storeFor(batch.workspace_id);
      const ctx = { projectId: batch.project_id, batchId: batch.id, reviewer: userId };
      const [deck, summary] = await Promise.all([store.mobileDeck({ ...ctx, limit: 1 }), store.summary(ctx)]);
      return {
        id: batch.id, batchId: batch.id, projectId: batch.project_id, workspaceId: batch.workspace_id,
        name: batch.name, description: batch.description, projectName: batch.project_name,
        workspaceName: batch.workspace_name, status: batch.status, audience: batch.audience,
        role: batch.role, totalCards: summary.summary.totalCards, pendingCards: deck.total,
        reviewedCards: summary.summary.totalCards - deck.total,
      };
    }
    const server = http.createServer(async (req, res) => {
      try {
        const url = new URL(req.url, origin);
        req.headers['x-medieval-client-ip'] = req.socket.remoteAddress || '127.0.0.1';
        if (url.pathname.startsWith('/api/auth/')) return await nodeAuthHandler(req, res);
        if (req.method === 'GET' && url.pathname === '/healthz') return send(res, 200, { ok: true, service: 'medieval-platform' });
        const assets = { '/assets/platform.js': ['./platform.js', 'text/javascript'], '/assets/platform.css': ['./platform.css', 'text/css'], '/assets/lucide.js': ['../../node_modules/lucide/dist/umd/lucide.min.js', 'text/javascript'] };
        if (req.method === 'GET' && assets[url.pathname]) {
          const [file, type] = assets[url.pathname];
          return send(res, 200, await fs.readFile(new URL(file, import.meta.url)), type);
        }
        if (req.method === 'GET' && url.pathname === '/.well-known/apple-app-site-association') {
          if (!appId) return send(res, 404, { error: 'App association is not configured.' });
          return send(res, 200, { applinks: { apps: [], details: [{ appID: appId, paths: ['/invite/*', '/batches/*'] }] } });
        }
        if (req.method === 'GET' && url.pathname === '/demo/logo.png') {
          return send(res, 200, await fs.readFile(new URL('../../ios/Art/Generated/Logo/medieval-logo-transparent-v1.png', import.meta.url)), 'image/png');
        }
        if (req.method === 'GET' && url.pathname === '/demo/myfire-rating.csv') {
          return send(res, 200, await fs.readFile(new URL('../../examples/myfire-rating.csv', import.meta.url)), 'text/csv');
        }
        if (mailer.local && ['/dev/inbox', '/api/dev/mail'].includes(url.pathname)) {
          const host = String(req.headers.host ?? '');
          if (new URL('http://' + host).origin !== new URL(origin).origin.replace('https:', 'http:') || !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress)) fail(403, 'The development inbox is local only.');
          if (req.method !== 'GET') fail(405, 'Method not allowed.');
          return url.pathname === '/dev/inbox'
            ? send(res, 200, renderInboxPage(), 'text/html; charset=utf-8')
            : send(res, 200, { messages: mailer.messages.filter((m) => Date.now() - Date.parse(m.createdAt) < 15 * 60000) });
        }
        if (req.method === 'GET' && (url.pathname === '/' || url.pathname.startsWith('/invite/') || url.pathname.startsWith('/batches/'))) {
          return send(res, 200, renderPlatformPage({ localMail: mailer.local }), 'text/html; charset=utf-8');
        }
        if (req.method === 'GET' && url.pathname === '/review') return send(res, 200, renderDemoReviewer({ accountMode: true }), 'text/html; charset=utf-8');
        if (!url.pathname.startsWith('/api/')) return send(res, 404, { error: 'Not found.' });
        const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
        if (!session?.user?.emailVerified) fail(401, 'Sign in to continue.');
        const user = session.user;
        if (!['GET', 'HEAD'].includes(req.method)) {
          if (req.headers.origin && req.headers.origin !== origin) fail(403, 'Invalid request origin.');
          if (!req.headers.authorization && req.headers.origin !== origin) fail(403, 'Browser requests require the platform origin.');
        }
        if (req.method === 'GET' && url.pathname === '/api/me') {
          return send(res, 200, { ok: true, user: { id: user.id, email: user.email, name: user.name }, workspaces: await access.workspaces(user.id), invitations: await access.pendingInvitations(user.email) });
        }
        if (req.method === 'GET' && url.pathname === '/api/me/batches') {
          return send(res, 200, { ok: true, batches: await Promise.all((await access.batches(user.id)).map((batch) => batchSummary(batch, user.id))) });
        }
        if (req.method === 'GET' && url.pathname === '/api/platform/state') {
          return send(res, 200, { ok: true, user: { id: user.id, email: user.email, name: user.name }, workspaces: await access.workspaces(user.id), projects: await access.projects(user.id), invitations: await access.pendingInvitations(user.email), batches: await Promise.all((await access.batches(user.id, { manage: true })).map((batch) => batchSummary(batch,user.id))) });
        }
        if (req.method === 'POST' && url.pathname === '/api/platform/workspaces') {
          const body = await readBody(req);
          return send(res, 200, { ok: true, workspace: await access.createWorkspace(user.id, body.name) });
        }
        const membersRoute = url.pathname.match(/^\/api\/platform\/workspaces\/([^/]+)\/members(?:\/([^/]+))?$/);
        if (membersRoute) {
          if (req.method === 'GET' && !membersRoute[2]) return send(res,200,{ok:true,members:await access.members(user.id,membersRoute[1])});
          if (req.method === 'POST' && membersRoute[2]) { await access.removeMember(user.id,membersRoute[1],membersRoute[2]); return send(res,200,{ok:true}); }
        }
        if (req.method === 'POST' && url.pathname === '/api/platform/projects') {
          const body = await readBody(req);
          return send(res, 200, { ok: true, project: await access.createProject(user.id, body.workspaceId, body.name) });
        }
        if (req.method === 'POST' && url.pathname === '/api/platform/preview') {
          const body = await readBody(req);
          await access.projectForManager(user.id, body.projectId);
          const result = preview(body);
          return send(res, 200, { ok: true, cards: result.cards, warnings: result.warnings, cardCount: result.cards.length });
        }
        if (req.method === 'POST' && url.pathname === '/api/platform/batches') {
          const body = await readBody(req);
          const project = await access.projectForManager(user.id, body.projectId);
          const generated = preview(body);
          if (!generated.cards.length) fail(400, 'Upload data that generates at least one review card.');
          const batch = await access.createBatch(user.id, body);
          const store = storeFor(project.workspace_id);
          const ctx = { projectId: project.id, batchId: batch.id };
          await store.createBatch({ ...ctx, name: requiredName(body.name), description: body.description, projectName: project.name });
          await store.importCards({ ...ctx, cards: generated.cards });
          return send(res, 200, { ok: true, batch, cardCount: generated.cards.length });
        }
        const batchAction = url.pathname.match(/^\/api\/platform\/batches\/([^/]+)(?:\/(members|access))?$/);
        if (batchAction) {
          const [, batchId, action] = batchAction;
          const batch = await access.batch(user.id, batchId, { manage: true });
          if (req.method === 'POST' && action === 'access') {
            const body = await readBody(req);
            await access.removeAccess(user.id, batchId, String(body.userId));
            return send(res, 200, { ok: true });
          }
          if (req.method === 'POST' && !action) return send(res, 200, { ok: true, batch: await access.updateBatch(user.id,batchId,await readBody(req)) });
          if (req.method === 'GET' && action === 'members') {
            const members = (await pool.query(`SELECT u.id,u.name,u.email FROM medieval_assignment a JOIN "user" u ON u.id=a.user_id WHERE a.batch_id=$1`, [batchId])).rows;
            const invitations = (await pool.query(`SELECT id,email,accepted_at,revoked_at,expires_at FROM medieval_invitation WHERE batch_id=$1 ORDER BY created_at DESC`, [batchId])).rows;
            return send(res, 200, { ok: true, members, invitations });
          }
          if (req.method === 'GET' && !action) {
            const detail = await storeFor(batch.workspace_id).batchDetail({ projectId: batch.project_id, batchId, reviewer: user.id });
            return send(res, 200, { ok: true, batch, detail });
          }
        }
        if (req.method === 'POST' && url.pathname === '/api/platform/invitations') {
          const invitation = await access.invite(user.id,await readBody(req));
          const inviteUrl = origin + '/invite/' + invitation.token;
          try { await mailer.send({ to: invitation.email, subject: 'You are invited to review on MediEval', text: `${user.name || user.email} invited you to MediEval.\n\nAccept your invitation: ${inviteUrl}\n\nSign in with ${invitation.email}. This invitation expires in 7 days.` }); }
          catch (error) { await access.revokeInvitation(user.id,invitation.id); throw error; }
          const { token, ...safeInvitation } = invitation;
          return send(res, 200, { ok: true, invitation: safeInvitation, inviteUrl });
        }
        const revoke = url.pathname.match(/^\/api\/platform\/invitations\/([^/]+)\/revoke$/);
        if (req.method === 'POST' && revoke) { await access.revokeInvitation(user.id,revoke[1]); return send(res, 200, { ok: true }); }
        if (req.method === 'POST' && url.pathname === '/api/invitations/accept') return send(res, 200, { ok: true, ...await access.accept(user,await readBody(req)) });
        if (url.pathname.startsWith('/api/mobile/eval/') || url.pathname === '/api/eval/results/export') {
          const batchId = url.searchParams.get('batchId') || url.searchParams.get('runId');
          const batch = await access.batch(user.id,batchId,{ includeManaged: url.pathname === '/api/eval/results/export' });
          if (url.searchParams.has('projectId') && url.searchParams.get('projectId') !== batch.project_id) fail(403, 'Project and batch do not match.');
          if (url.searchParams.has('workspaceId') && url.searchParams.get('workspaceId') !== batch.workspace_id) fail(403, 'Workspace and batch do not match.');
          const store = storeFor(batch.workspace_id);
          const ctx = { projectId: batch.project_id, batchId: batch.id, reviewer: user.id };
          if (req.method === 'GET' && url.pathname.endsWith('/cards')) return send(res, 200, await store.mobileDeck({ ...ctx, limit: url.searchParams.get('limit') || 20, page: url.searchParams.get('page') || 1 }));
          if (req.method === 'GET' && url.pathname.endsWith('/summary')) return send(res, 200, await store.summary(ctx));
          if (req.method === 'POST' && url.pathname.endsWith('/results')) {
            const body = await readBody(req);
            if (!body.eventId || String(body.eventId).length > 200) fail(400, 'A stable eventId is required.');
            const result = await store.storeResult({ ...ctx, payload: {
              cardId: body.cardId, answer: body.answer, correction: body.correction, notes: body.notes,
              durationMs: body.durationMs, clientGeneratedAt: body.clientGeneratedAt,
              ...ctx, eventId: `${user.id}:${body.eventId}`, userId: user.id, reviewerName: user.name, workspaceId: batch.workspace_id,
            } });
            return send(res, 200, result);
          }
          if (req.method === 'GET' && url.pathname === '/api/eval/results/export') {
            const rows = await store.listResults(ctx);
            const visible = ['owner','admin'].includes(batch.role) ? rows : rows.filter((row) => row.userId === user.id);
            const csv = url.searchParams.get('format') === 'csv';
            res.setHeader('content-disposition', `attachment; filename="medieval-${batch.id}-results.${csv ? 'csv' : 'jsonl'}"`);
            return send(res, 200, csv ? resultsToCsv(visible) : visible.map((row) => JSON.stringify(row)).join('\n') + (visible.length ? '\n' : ''), csv ? 'text/csv; charset=utf-8' : 'application/x-ndjson');
          }
        }
        return send(res, 404, { ok: false, error: 'Not found.' });
      } catch (error) {
        const status = Number(error.status) || 500;
        if (status >= 500) console.error('Platform request failed:', error.code || error.name);
        return send(res, status, { ok: false, error: status >= 500 ? 'The request could not be completed. Please retry.' : error.message });
      }
    });
    return { server, auth, access, storeFor, pool, async close() {
      if (server.listening) await new Promise((resolve) => { server.close(resolve); server.closeIdleConnections(); });
      mailer.close();
      if (ownedPool) await pool.end();
    } };
  } catch (error) { if (ownedPool) await pool.end(); throw error; }
}

export async function startPlatform(options = {}) {
  const port = Number(options.port ?? process.env.PORT ?? 5183);
  const host = options.host ?? process.env.HOST ?? '127.0.0.1';
  const baseURL = options.baseURL ?? process.env.MEDIEVAL_PLATFORM_URL ?? `http://127.0.0.1:${port}`;
  const localMail = options.localMail ?? process.env.MEDIEVAL_MAIL_MODE === 'local';
  if (localMail && !['127.0.0.1','localhost','::1'].includes(host)) throw new Error('Development email delivery can only bind to loopback.');
  if (!options.pool && !options.databaseUrl && !process.env.DATABASE_URL) throw new Error('Set DATABASE_URL to a PostgreSQL database.');
  const platform = await createPlatform({
    ...options, databaseUrl: options.databaseUrl ?? process.env.DATABASE_URL, baseURL,
    secret: options.secret ?? process.env.BETTER_AUTH_SECRET,
    dataDir: options.dataDir ?? process.env.MEDIEVAL_EVAL_DATA_DIR ?? path.resolve('.runtime','platform'),
    mailer: options.mailer ?? createMailer({ local: localMail, smtpUrl: process.env.SMTP_URL, from: process.env.MAIL_FROM }),
    appId: process.env.MEDIEVAL_APP_ID ?? '',
  });
  try { await new Promise((resolve,reject) => { platform.server.once('error',reject); platform.server.listen(port,host,resolve); }); }
  catch (error) { await platform.close(); throw error; }
  return platform;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const platform = await startPlatform();
    console.log(`MediEval platform: ${process.env.MEDIEVAL_PLATFORM_URL || 'http://127.0.0.1:' + platform.server.address().port}`);
    for (const signal of ['SIGINT','SIGTERM']) process.once(signal, async () => { await platform.close(); process.exit(0); });
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
