#!/usr/bin/env node
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EvalFileStore } from './store.mjs';
import { renderDashboardPage } from './dashboard.mjs';
import { generateCardsFromRecords, previewCardsFromText } from '../../packages/schema/card-generator.mjs';
import { batchIdFrom, normalizeProjectId, normalizeReviewer, text } from '../../packages/schema/index.mjs';

const __filename = fileURLToPath(import.meta.url);

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'authorization,content-type,x-eval-mobile-token',
    ...headers,
  });
  res.end(body);
}

function json(res, status, payload) {
  return send(res, status, JSON.stringify(payload, null, 2), { 'content-type': 'application/json; charset=utf-8' });
}

function html(res, body) {
  return send(res, 200, body, { 'content-type': 'text/html; charset=utf-8' });
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

function authError(req, token) {
  if (!token) return null;
  const bearer = String(req.headers.authorization ?? '').replace(/^Bearer\s+/i, '').trim();
  const headerToken = String(req.headers['x-eval-mobile-token'] ?? '').trim();
  if (bearer === token || headerToken === token) return null;
  return 'Invalid MediEval eval token.';
}

function dashboardPage({ defaultProjectId, defaultBatchId, defaultReviewer, tokenConfigured }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>MediEval Dashboard</title>
  <style>
    :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #1c1f24; background: #f6f7f9; }
    body { margin: 0; }
    header { background: #243145; color: white; padding: 22px clamp(16px, 4vw, 42px); }
    h1 { margin: 0 0 4px; font-size: clamp(24px, 3vw, 36px); letter-spacing: 0; }
    main { padding: 24px clamp(16px, 4vw, 42px) 42px; max-width: 1180px; margin: 0 auto; }
    section { margin-top: 22px; }
    .grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
    .metric, .panel, .result { background: white; border: 1px solid #dde2ea; border-radius: 8px; }
    .metric { padding: 16px; }
    .metric b { display: block; font-size: 28px; }
    .panel { padding: 18px; }
    label { display: block; font-size: 13px; font-weight: 650; margin: 10px 0 5px; color: #3a4352; }
    input, textarea, select, button { font: inherit; }
    input, textarea, select { width: 100%; box-sizing: border-box; border: 1px solid #c7cfda; border-radius: 6px; padding: 9px 10px; background: #fff; }
    textarea { min-height: 160px; resize: vertical; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 13px; }
    button { border: 0; border-radius: 6px; background: #2f6fbd; color: white; padding: 10px 14px; cursor: pointer; }
    button.secondary { background: #475569; }
    .toolbar { display: flex; gap: 10px; flex-wrap: wrap; align-items: end; }
    .toolbar > label { flex: 1 1 170px; margin-top: 0; }
    .row { display: flex; gap: 12px; flex-wrap: wrap; }
    .row > * { flex: 1 1 260px; }
    table { width: 100%; border-collapse: collapse; background: white; border: 1px solid #dde2ea; border-radius: 8px; overflow: hidden; }
    th, td { padding: 10px 12px; border-bottom: 1px solid #edf0f5; text-align: left; vertical-align: top; font-size: 14px; }
    th { background: #edf2f7; font-size: 12px; text-transform: uppercase; letter-spacing: .04em; }
    code { background: #edf2f7; border-radius: 5px; padding: 2px 5px; }
    .muted { color: #687386; }
    .status { min-height: 22px; color: #365f36; }
    .error { color: #a33a35; }
    @media (max-width: 760px) { .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } th, td { font-size: 12px; } }
  </style>
</head>
<body>
  <header>
    <h1>MediEval</h1>
    <div class="muted" style="color:#d8dee9">Self-hosted eval labels, reviewer queue, and export.</div>
  </header>
  <main>
    <section class="panel">
      <div class="toolbar">
        <label>Project <input id="projectId" value="${defaultProjectId}"></label>
        <label>Batch <input id="batchId" value="${defaultBatchId}"></label>
        <label>Reviewer <input id="reviewer" value="${defaultReviewer}"></label>
        <label>Token <input id="token" type="password" placeholder="${tokenConfigured ? 'configured' : 'optional'}"></label>
        <button id="refresh">Refresh</button>
      </div>
    </section>
    <section class="grid">
      <div class="metric"><span>Total</span><b id="totalCards">0</b></div>
      <div class="metric"><span>Reviewed</span><b id="reviewedCards">0</b></div>
      <div class="metric"><span>Pending</span><b id="pendingCards">0</b></div>
      <div class="metric"><span>Rows</span><b id="totalResultRows">0</b></div>
    </section>
    <section class="row">
      <div class="panel">
        <h2>Import Cards</h2>
        <p class="muted">Paste eval-card JSONL. Use <code>replace</code> to reset this batch's card deck.</p>
        <textarea id="cardsInput" spellcheck="false"></textarea>
        <label><input id="replace" type="checkbox" style="width:auto"> Replace existing cards in this batch</label>
        <button id="importCards">Import</button>
        <p id="importStatus" class="status"></p>
      </div>
      <div class="panel">
        <h2>Exports</h2>
        <p class="muted">Download the durable human labels for this batch.</p>
        <button class="secondary" data-export="jsonl">Download JSONL</button>
        <button class="secondary" data-export="csv">Download CSV</button>
        <p id="exportStatus" class="status"></p>
      </div>
    </section>
    <section>
      <h2>Recent Results</h2>
      <table>
        <thead><tr><th>Time</th><th>Reviewer</th><th>Card</th><th>Answer</th><th>Correction</th></tr></thead>
        <tbody id="resultsBody"><tr><td colspan="5" class="muted">No results yet.</td></tr></tbody>
      </table>
    </section>
  </main>
  <script>
    const sample = ${JSON.stringify(sampleCardText())};
    cardsInput.value = sample;
    function params() {
      return new URLSearchParams({ projectId: projectId.value, batchId: batchId.value, reviewer: reviewer.value });
    }
    function headers() {
      const out = { 'content-type': 'application/json' };
      if (token.value.trim()) out.authorization = 'Bearer ' + token.value.trim();
      return out;
    }
    async function api(path, options = {}) {
      const response = await fetch(path, { ...options, headers: { ...headers(), ...(options.headers || {}) } });
      const text = await response.text();
      const body = text ? JSON.parse(text) : {};
      if (!response.ok || body.ok === false) throw new Error(body.error || text || response.statusText);
      return body;
    }
    async function refreshDashboard() {
      try {
        const state = await api('/api/eval/dashboard/state?' + params());
        totalCards.textContent = state.summary.totalCards;
        reviewedCards.textContent = state.summary.reviewedCards;
        pendingCards.textContent = state.summary.pendingCards;
        totalResultRows.textContent = state.summary.totalResultRows;
        resultsBody.innerHTML = state.recentResults.length ? state.recentResults.map((row) => '<tr><td>' + (row.serverReceivedAt || '') + '</td><td>' + row.reviewer + '</td><td>' + row.cardId + '</td><td>' + row.answer + '</td><td>' + (row.correction ? JSON.stringify(row.correction) : '') + '</td></tr>').join('') : '<tr><td colspan="5" class="muted">No results yet.</td></tr>';
      } catch (error) {
        resultsBody.innerHTML = '<tr><td colspan="5" class="error">' + error.message + '</td></tr>';
      }
    }
    refresh.onclick = refreshDashboard;
    importCards.onclick = async () => {
      importStatus.textContent = '';
      importStatus.className = 'status';
      try {
        const body = { projectId: projectId.value, batchId: batchId.value, replace: replace.checked, cards: cardsInput.value.split(/\\n/).filter(Boolean).map((line) => JSON.parse(line)) };
        const result = await api('/api/eval/cards/import', { method: 'POST', body: JSON.stringify(body) });
        importStatus.textContent = 'Imported ' + result.imported + ', replaced ' + result.replaced + ', total ' + result.totalCards + '.';
        await refreshDashboard();
      } catch (error) {
        importStatus.className = 'status error';
        importStatus.textContent = error.message;
      }
    };
    document.querySelectorAll('[data-export]').forEach((button) => {
      button.onclick = () => {
        const format = button.dataset.export;
        const url = '/api/eval/results/export?' + params() + '&format=' + format;
        window.location.href = url;
      };
    });
    refreshDashboard();
  </script>
</body>
</html>`;
}

function sampleCardText() {
  return JSON.stringify({
    schemaVersion: 'eval-card.v1',
    cardId: 'sample:color',
    cardType: 'binary_claim',
    question: 'Is the extracted color correct?',
    claim: { template: 'attribute_color', path: 'attributes.color', value: 'blue' },
    sourceKey: 'sample:item-1',
    priority: 'medium',
    confidence: 0.62,
    subject: { title: 'Sample catalog item', subtitle: 'Attribute extraction', source: 'demo' },
    media: [],
    analysisContext: { summary: 'The model extracted blue from the source record.' },
    evidence: [{ source: 'record', detail: 'The source value says blue.', confidence: 0.62 }],
  }, null, 0);
}

function requestContext(url) {
  return {
    projectId: normalizeProjectId(url.searchParams.get('projectId')),
    batchId: batchIdFrom({
      batchId: url.searchParams.get('batchId'),
      runId: url.searchParams.get('runId'),
    }),
    reviewer: normalizeReviewer(url.searchParams.get('reviewer')),
  };
}

export function createEvalApiServer({
  store,
  token = '',
  defaultProjectId = 'default',
  defaultBatchId = 'default',
  defaultRunId = undefined,
  defaultReviewer = 'MediEval Reviewer',
} = {}) {
  if (!store) throw new Error('createEvalApiServer requires a store.');
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (req.method === 'OPTIONS') return send(res, 204, '');
      if (url.pathname === '/' && req.method === 'GET') {
        return html(res, renderDashboardPage({
          defaultProjectId: normalizeProjectId(defaultProjectId),
          defaultBatchId: batchIdFrom({ batchId: defaultBatchId, runId: defaultRunId }),
          defaultReviewer,
          tokenConfigured: Boolean(token),
        }));
      }
      if (url.pathname === '/healthz' && req.method === 'GET') {
        return json(res, 200, { ok: true, service: 'medieval-eval-api' });
      }
      if (url.pathname.startsWith('/api/')) {
        const error = authError(req, token);
        if (error) return json(res, 401, { ok: false, error });
      }

      if (url.pathname === '/api/mobile/eval/cards' && req.method === 'GET') {
        const context = requestContext(url);
        return json(res, 200, await store.mobileDeck({
          ...context,
          limit: url.searchParams.get('limit') ?? 20,
          page: url.searchParams.get('page') ?? 1,
          reviewState: text(url.searchParams.get('reviewState'), 'unreviewed'),
        }));
      }

      if (url.pathname === '/api/mobile/eval/summary' && req.method === 'GET') {
        return json(res, 200, await store.summary(requestContext(url)));
      }

      if (url.pathname === '/api/mobile/eval/results' && req.method === 'POST') {
        const body = JSON.parse(await readBody(req) || '{}');
        const context = requestContext(url);
        return json(res, 200, await store.storeResult({
          ...context,
          batchId: batchIdFrom(body, context.batchId),
          payload: body,
        }));
      }

      if (url.pathname === '/api/eval/projects' && req.method === 'GET') {
        return json(res, 200, { ok: true, projects: await store.listProjects() });
      }

      if (url.pathname === '/api/eval/projects' && req.method === 'POST') {
        const body = JSON.parse(await readBody(req) || '{}');
        return json(res, 200, { ok: true, project: await store.createProject(body) });
      }

      if (url.pathname === '/api/eval/batches' && req.method === 'GET') {
        return json(res, 200, {
          ok: true,
          batches: await store.listBatchSummaries({
            projectId: url.searchParams.get('projectId') || undefined,
            reviewer: url.searchParams.get('reviewer') || undefined,
          }),
        });
      }

      if (url.pathname === '/api/eval/batches/detail' && req.method === 'GET') {
        return json(res, 200, await store.batchDetail(requestContext(url)));
      }

      if ((url.pathname === '/api/eval/batches' || url.pathname === '/api/eval/runs') && req.method === 'POST') {
        const body = JSON.parse(await readBody(req) || '{}');
        const batch = await store.createBatch(body);
        return json(res, 200, { ok: true, batch, run: batch });
      }

      if (url.pathname === '/api/eval/cards/preview' && req.method === 'POST') {
        const body = JSON.parse(await readBody(req) || '{}');
        const projectId = normalizeProjectId(body.projectId ?? url.searchParams.get('projectId'));
        const batchId = batchIdFrom({
          batchId: body.batchId ?? url.searchParams.get('batchId'),
          runId: body.runId ?? url.searchParams.get('runId'),
        });
        const options = {
          projectId,
          batchId,
          adapter: body.adapter,
          format: body.format,
        };
        const preview = Array.isArray(body.records)
          ? {
            records: body.records,
            ...generateCardsFromRecords(body.records, options),
            adapter: text(body.adapter, 'generic'),
          }
          : previewCardsFromText(body.raw ?? body.text ?? '', options);
        return json(res, 200, {
          ok: true,
          projectId,
          batchId,
          adapter: preview.adapter,
          recordCount: preview.records.length,
          recordsPreview: preview.records.slice(0, 5),
          cardCount: preview.cards.length,
          cards: preview.cards,
          warnings: preview.warnings,
        });
      }

      if (url.pathname === '/api/eval/cards/import' && req.method === 'POST') {
        const raw = await readBody(req);
        const payload = store.parseImportPayload(raw, String(req.headers['content-type'] ?? ''));
        const projectId = normalizeProjectId(payload.projectId ?? url.searchParams.get('projectId'));
        const batchId = batchIdFrom({
          batchId: payload.batchId ?? url.searchParams.get('batchId'),
          runId: payload.runId ?? url.searchParams.get('runId'),
        });
        if (payload.name || payload.description || payload.projectName || payload.projectDescription) {
          await store.createBatch({
            projectId,
            batchId,
            name: payload.name,
            description: payload.description,
            projectName: payload.projectName,
            projectDescription: payload.projectDescription,
          });
        }
        return json(res, 200, {
          ok: true,
          ...(await store.importCards({ projectId, batchId, cards: payload.cards, replace: payload.replace })),
        });
      }

      if (url.pathname === '/api/eval/dashboard/state' && req.method === 'GET') {
        return json(res, 200, await store.dashboardState(requestContext(url)));
      }

      if (url.pathname === '/api/eval/results/export' && req.method === 'GET') {
        const context = requestContext(url);
        const format = text(url.searchParams.get('format'), 'jsonl').toLowerCase();
        const body = await store.exportResults({ ...context, format });
        return send(res, 200, body, {
          'content-type': format === 'csv' ? 'text/csv; charset=utf-8' : 'application/x-ndjson; charset=utf-8',
          'content-disposition': `attachment; filename="medieval-${context.projectId}-${context.batchId}-results.${format === 'csv' ? 'csv' : 'jsonl'}"`,
        });
      }

      return json(res, 404, { ok: false, error: 'Not found.' });
    } catch (error) {
      const status = Number(error.status) || 500;
      return json(res, status, { ok: false, error: error.message || 'Internal server error.' });
    }
  });
}

export function startEvalApiServer(options = {}) {
  const port = Number(options.port ?? process.env.PORT ?? process.env.MEDIEVAL_EVAL_API_PORT ?? 5182);
  const host = text(options.host ?? process.env.HOST, '127.0.0.1');
  const dataDir = path.resolve(options.dataDir ?? process.env.MEDIEVAL_EVAL_DATA_DIR ?? path.join(process.cwd(), '.runtime', 'medieval-eval'));
  const token = text(options.token ?? process.env.EVAL_MOBILE_TOKEN ?? process.env.MEDIEVAL_EVAL_API_TOKEN);
  const defaultProjectId = normalizeProjectId(options.defaultProjectId ?? process.env.MEDIEVAL_PROJECT_ID);
  const defaultBatchId = batchIdFrom({
    batchId: options.defaultBatchId ?? process.env.MEDIEVAL_BATCH_ID,
    runId: options.defaultRunId ?? process.env.MEDIEVAL_RUN_ID,
  });
  const defaultReviewer = normalizeReviewer(options.defaultReviewer ?? process.env.MEDIEVAL_REVIEWER);
  const store = new EvalFileStore({ dataDir });
  const server = createEvalApiServer({ store, token, defaultProjectId, defaultBatchId, defaultReviewer });
  server.listen(port, host, () => {
    const displayHost = host === '0.0.0.0' ? os.hostname() : host;
    console.log(`MediEval eval API listening on http://${displayHost}:${port}`);
    console.log(`Data dir: ${dataDir}`);
    console.log(token ? 'Token auth: enabled' : 'Token auth: disabled for local use');
  });
  return server;
}

if (process.argv[1] === __filename) {
  startEvalApiServer();
}
