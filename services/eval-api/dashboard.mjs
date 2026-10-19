export function renderDashboardPage({
  defaultProjectId = 'default',
  defaultBatchId = 'default',
  defaultReviewer = 'MediEval Reviewer',
  tokenConfigured = false,
  reviewEnabled = false,
} = {}) {
  const initial = JSON.stringify({
    defaultProjectId,
    defaultBatchId,
    defaultReviewer,
    tokenConfigured,
  });
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>MediEval Core</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f5f7fa;
      --surface: #ffffff;
      --surface-2: #eef2f6;
      --line: #d8dee8;
      --line-strong: #c5cedb;
      --text: #17202c;
      --muted: #627084;
      --brand: #315f8c;
      --brand-strong: #234766;
      --green: #24775b;
      --amber: #a16207;
      --red: #b43b43;
      --blue-soft: #e8f1fb;
      --green-soft: #e8f6ef;
      --amber-soft: #fff5db;
      --red-soft: #fdecee;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 14px;
      letter-spacing: 0;
      background: var(--bg);
      color: var(--text);
    }
    * { box-sizing: border-box; }
    body { margin: 0; min-width: 320px; }
    button, input, select, textarea { font: inherit; letter-spacing: 0; }
    button { border: 0; border-radius: 6px; min-height: 36px; padding: 8px 12px; cursor: pointer; background: var(--brand); color: #fff; font-weight: 650; }
    button:hover { background: var(--brand-strong); }
    button.secondary { color: var(--text); background: var(--surface-2); border: 1px solid var(--line); }
    button.secondary:hover { background: #e2e8f0; }
    button.ghost { color: var(--text); background: transparent; border: 1px solid transparent; }
    button.ghost:hover { background: var(--surface-2); border-color: var(--line); }
    button.link { min-height: 0; padding: 0; color: var(--brand); background: transparent; font-weight: 700; text-align: left; }
    button.link:hover { color: var(--brand-strong); background: transparent; }
    input, select, textarea {
      width: 100%;
      border: 1px solid var(--line-strong);
      border-radius: 6px;
      background: #fff;
      color: var(--text);
      padding: 9px 10px;
      min-height: 38px;
    }
    textarea {
      min-height: 190px;
      resize: vertical;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 12px;
      line-height: 1.45;
    }
    label { display: grid; gap: 5px; color: var(--muted); font-size: 12px; font-weight: 700; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    th, td { border-bottom: 1px solid var(--line); padding: 10px 12px; text-align: left; vertical-align: top; overflow-wrap: anywhere; }
    th { color: #526071; background: #f8fafc; font-size: 11px; text-transform: uppercase; }
    td { font-size: 13px; }
    code { padding: 2px 5px; border-radius: 5px; background: var(--surface-2); color: #263648; }
    pre { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 12px; line-height: 1.45; }
    .app { min-height: 100vh; display: grid; grid-template-columns: 244px minmax(0, 1fr); }
    .sidebar { background: #17202c; color: #eef4fb; padding: 20px 14px; display: flex; flex-direction: column; gap: 18px; }
    .brand { padding: 4px 8px 14px; border-bottom: 1px solid rgba(255, 255, 255, .12); }
    .brand b { display: block; font-size: 18px; }
    .brand span { display: block; margin-top: 4px; color: #aab8c7; font-size: 12px; }
    .nav { display: grid; gap: 6px; }
    .nav button { justify-content: start; width: 100%; text-align: left; background: transparent; color: #cdd8e5; }
    .nav button.active, .nav button:hover { background: #233246; color: #fff; }
    .sidebar-footer { margin-top: auto; color: #aab8c7; font-size: 12px; padding: 8px; line-height: 1.5; }
    .main { min-width: 0; display: grid; grid-template-rows: auto 1fr; }
    .topbar {
      position: sticky;
      top: 0;
      z-index: 5;
      background: rgba(245, 247, 250, .94);
      backdrop-filter: blur(12px);
      border-bottom: 1px solid var(--line);
      padding: 14px clamp(14px, 3vw, 28px);
      display: grid;
      grid-template-columns: minmax(180px, 1fr) minmax(520px, 2fr);
      gap: 16px;
      align-items: end;
    }
    .title h1 { margin: 0; font-size: 22px; line-height: 1.15; }
    .title p { margin: 4px 0 0; color: var(--muted); font-size: 13px; }
    .context-bar { display: grid; grid-template-columns: repeat(4, minmax(112px, 1fr)) auto; gap: 10px; align-items: end; }
    .content { padding: 22px clamp(14px, 3vw, 28px) 38px; display: grid; gap: 18px; align-content: start; align-items: start; grid-auto-rows: max-content; }
    .view { display: none; gap: 18px; width: 100%; }
    .view.active { display: grid; }
    .band, .panel, .table-shell {
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: 8px;
    }
    .band { padding: 16px; }
    .panel { padding: 16px; }
    .panel-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
    .panel-header h2, .panel h2 { margin: 0; font-size: 15px; }
    .panel-header .actions { display: flex; gap: 8px; flex-wrap: wrap; }
    .muted { color: var(--muted); }
    .small { font-size: 12px; }
    .status-line { min-height: 20px; color: var(--green); font-weight: 650; }
    .status-line:empty { display: none; }
    .status-line.error { color: var(--red); }
    .stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
    .stat {
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 14px;
      min-height: 88px;
    }
    .stat span { display: block; color: var(--muted); font-size: 12px; font-weight: 700; }
    .stat b { display: block; margin-top: 7px; font-size: 28px; line-height: 1; }
    .split { display: grid; grid-template-columns: minmax(0, 1fr) minmax(360px, .72fr); gap: 18px; align-items: start; }
    .form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    .form-grid .wide { grid-column: 1 / -1; }
    .button-row { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
    .project-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 12px; }
    .project-card, .batch-card {
      border: 1px solid var(--line);
      background: var(--surface);
      border-radius: 8px;
      padding: 13px;
      min-height: 118px;
      display: grid;
      gap: 9px;
    }
    .project-card h3, .batch-card h3 { margin: 0; font-size: 14px; }
    .progress { width: 100%; height: 8px; border-radius: 999px; background: #e8edf4; overflow: hidden; }
    .progress i { display: block; height: 100%; width: 0%; background: var(--green); }
    .pill-row { display: flex; gap: 6px; flex-wrap: wrap; }
    .pill { display: inline-flex; align-items: center; min-height: 24px; padding: 3px 7px; border-radius: 999px; background: var(--surface-2); color: #405064; font-size: 12px; font-weight: 700; }
    .pill.green { background: var(--green-soft); color: var(--green); }
    .pill.amber { background: var(--amber-soft); color: var(--amber); }
    .pill.red { background: var(--red-soft); color: var(--red); }
    .pill.blue { background: var(--blue-soft); color: var(--brand); }
    .empty {
      border: 1px dashed var(--line-strong);
      border-radius: 8px;
      padding: 22px;
      color: var(--muted);
      text-align: center;
      background: #fbfcfe;
    }
    .table-shell { overflow: hidden; }
    .activity-table { table-layout: fixed; }
    .activity-card { display: block; width: 100%; max-width: 100%; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
    .table-scroll { overflow-x: auto; }
    .bars { display: grid; gap: 9px; }
    .bar-row { display: grid; grid-template-columns: 92px minmax(120px, 1fr) 42px; gap: 10px; align-items: center; }
    .bar-track { height: 9px; background: #e8edf4; border-radius: 999px; overflow: hidden; }
    .bar-track i { display: block; height: 100%; background: var(--brand); width: 0%; }
    .inspector {
      position: fixed;
      top: 0;
      right: 0;
      width: min(560px, 100vw);
      height: 100vh;
      background: #fff;
      border-left: 1px solid var(--line);
      box-shadow: -18px 0 40px rgba(23, 32, 44, .12);
      z-index: 20;
      display: grid;
      grid-template-rows: auto 1fr;
    }
    .inspector[hidden] { display: none; }
    .inspector-head { padding: 16px; border-bottom: 1px solid var(--line); display: flex; justify-content: space-between; gap: 12px; align-items: start; }
    .inspector-head h2 { margin: 0; font-size: 16px; }
    .inspector-body { min-height: 0; overflow: auto; padding: 16px; display: grid; gap: 14px; }
    .kv { display: grid; grid-template-columns: 130px minmax(0, 1fr); gap: 8px; }
    .kv dt { color: var(--muted); font-weight: 700; }
    .kv dd { margin: 0; overflow-wrap: anywhere; }
    .json-block { border: 1px solid var(--line); background: #f8fafc; border-radius: 8px; padding: 12px; }
    @media (max-width: 980px) {
      .app { grid-template-columns: 1fr; }
      .sidebar { position: static; flex-direction: row; align-items: center; flex-wrap: wrap; }
      .brand { border-bottom: 0; padding-bottom: 4px; }
      .nav { display: flex; flex-wrap: wrap; }
      .nav button { width: auto; }
      .sidebar-footer { display: none; }
      .topbar { grid-template-columns: 1fr; }
      .context-bar { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .split { grid-template-columns: 1fr; }
    }
    @media (max-width: 640px) {
      .stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .form-grid { grid-template-columns: 1fr; }
      .context-bar { grid-template-columns: 1fr; }
      th, td { padding: 9px; font-size: 12px; }
    }
  </style>
</head>
<body>
  <div class="app">
    <aside class="sidebar">
      <div class="brand">
        <b>MediEval Core</b>
        <span>Human eval batches</span>
      </div>
      <nav class="nav" aria-label="Dashboard views">
        <button class="active" data-view-button="home" type="button">Home</button>
        <button data-view-button="create" type="button">Create Batch</button>
        <button data-view-button="detail" type="button">Batch Detail</button>
        ${reviewEnabled ? '<a id="reviewLink" href="/review" style="color: #eef4fb; padding: 10px 12px; text-decoration: none;">Review Cards</a>' : ''}
        <a id="qualityLink" href="/quality" style="color: #eef4fb; padding: 10px 12px; text-decoration: none;">Quality & Training</a>
        <a href="/docs" style="color: #eef4fb; padding: 10px 12px; text-decoration: none;">Documentation</a>
      </nav>
      <div class="sidebar-footer">
        <div>OSS Core</div>
        <div>Durable JSONL labels</div>
      </div>
    </aside>
    <main class="main">
      <header class="topbar">
        <div class="title">
          <h1 id="pageTitle">Dashboard Home</h1>
          <p id="pageSubtitle">Projects, batches, review progress, and exports.</p>
        </div>
        <div class="context-bar">
          <label>Project ID <input id="projectId" autocomplete="off"></label>
          <label>Batch ID <input id="batchId" autocomplete="off"></label>
          <label>Reviewer <input id="reviewer" autocomplete="off"></label>
          <label>Token <input id="token" type="password" autocomplete="off"></label>
          <button id="refresh" type="button">Refresh</button>
        </div>
      </header>
      <div class="content">
        <div id="globalStatus" class="status-line"></div>

        <section id="view-home" class="view active">
          <div id="homeStats" class="stats"></div>
          <div class="split">
            <section class="panel">
              <div class="panel-header">
                <h2>Projects</h2>
                <button class="secondary" data-view-jump="create" type="button">New Batch</button>
              </div>
              <div id="projectList" class="project-grid"></div>
            </section>
            <section class="panel">
              <div class="panel-header">
                <h2>Recent Activity</h2>
              </div>
              <div class="table-shell">
                <div class="table-scroll">
                  <table class="activity-table">
                    <colgroup><col style="width: 30%"><col style="width: 20%"><col style="width: 20%"><col style="width: 30%"></colgroup>
                    <thead><tr><th>Time</th><th>Reviewer</th><th>Answer</th><th>Card</th></tr></thead>
                    <tbody id="activityRows"></tbody>
                  </table>
                </div>
              </div>
            </section>
          </div>
          <section class="panel">
            <div class="panel-header">
              <h2>Batches</h2>
              <div class="actions">
                <button class="secondary" data-export="jsonl" type="button">Export JSONL</button>
                <button class="secondary" data-export="csv" type="button">Export CSV</button>
              </div>
            </div>
            <div class="table-shell">
              <div class="table-scroll">
                <table>
                  <thead><tr><th>Batch</th><th>Project</th><th>Progress</th><th>Labels</th><th>Export</th></tr></thead>
                  <tbody id="batchRows"></tbody>
                </table>
              </div>
            </div>
          </section>
        </section>

        <section id="view-create" class="view">
          <div class="split">
            <section class="panel">
              <div class="panel-header">
                <h2>Batch Creation</h2>
                <div class="actions">
                  <button id="previewCards" type="button">Preview</button>
                  <button id="confirmImport" type="button">Confirm Import</button>
                </div>
              </div>
              <div class="form-grid">
                <label>Project ID <input id="newProjectId" autocomplete="off"></label>
                <label>Project Name <input id="newProjectName" autocomplete="off"></label>
                <label>Batch ID <input id="newBatchId" autocomplete="off"></label>
                <label>Batch Name <input id="newBatchName" autocomplete="off"></label>
                <label class="wide">Batch Description <input id="newBatchDescription" autocomplete="off"></label>
                <label>Adapter
                  <select id="adapter">
                    <option value="myfire-rating">MyFireRating</option>
                    <option value="generic">Generic Claim CSV</option>
                  </select>
                </label>
                <label>Format
                  <select id="format">
                    <option value="auto">Auto</option>
                    <option value="csv">CSV</option>
                    <option value="jsonl">JSONL</option>
                    <option value="json">JSON</option>
                  </select>
                </label>
                <label class="wide">Upload <input id="fileInput" type="file" accept=".csv,.json,.jsonl,.ndjson,text/csv,application/json"></label>
                <label class="wide">Source Data <textarea id="sourceInput" spellcheck="false"></textarea></label>
              </div>
              <div class="button-row">
                <label style="display:flex;grid-template-columns:auto 1fr;align-items:center;gap:8px;width:auto;color:var(--text);font-size:13px;">
                  <input id="replaceCards" type="checkbox" style="width:auto;min-height:0;"> Replace existing cards
                </label>
                <span id="createStatus" class="status-line"></span>
              </div>
            </section>
            <section class="panel">
              <div class="panel-header">
                <h2>Preview</h2>
                <span id="previewSummary" class="muted small">No preview yet.</span>
              </div>
              <div id="previewWarnings"></div>
              <div class="table-shell">
                <div class="table-scroll">
                  <table>
                    <thead><tr><th>Card</th><th>Question</th><th>Claim</th></tr></thead>
                    <tbody id="previewRows"></tbody>
                  </table>
                </div>
              </div>
            </section>
          </div>
        </section>

        <section id="view-detail" class="view">
          <div id="detailStats" class="stats"></div>
          <div class="split">
            <section class="panel">
              <div class="panel-header">
                <h2 id="detailTitle">Batch Detail</h2>
                <div class="actions">
                  <button class="secondary" data-export="jsonl" type="button">Export JSONL</button>
                  <button class="secondary" data-export="csv" type="button">Export CSV</button>
                </div>
              </div>
              <div id="answerBars" class="bars"></div>
            </section>
            <section class="panel">
              <div class="panel-header">
                <h2>Reviewer Breakdown</h2>
              </div>
              <div class="table-shell">
                <div class="table-scroll">
                  <table>
                    <thead><tr><th>Reviewer</th><th>Labels</th><th>Corrections</th><th>Avg Time</th></tr></thead>
                    <tbody id="reviewerRows"></tbody>
                  </table>
                </div>
              </div>
            </section>
          </div>
          <section class="panel">
            <div class="panel-header">
              <h2>Cards</h2>
            </div>
            <div class="table-shell">
              <div class="table-scroll">
                <table>
                  <thead><tr><th>Card</th><th>Question</th><th>Subject</th><th>Status</th></tr></thead>
                  <tbody id="cardRows"></tbody>
                </table>
              </div>
            </div>
          </section>
          <section class="panel">
            <div class="panel-header">
              <h2>Recent Labels</h2>
            </div>
            <div class="table-shell">
              <div class="table-scroll">
                <table>
                  <thead><tr><th>Time</th><th>Reviewer</th><th>Answer</th><th>Correction</th><th>Event</th></tr></thead>
                  <tbody id="labelRows"></tbody>
                </table>
              </div>
            </div>
          </section>
        </section>
      </div>
    </main>
  </div>

  <aside id="inspector" class="inspector" hidden>
    <div class="inspector-head">
      <div>
        <h2 id="inspectorTitle">Result Inspector</h2>
        <div id="inspectorSubtitle" class="muted small"></div>
      </div>
      <button id="closeInspector" class="secondary" type="button">Close</button>
    </div>
    <div id="inspectorBody" class="inspector-body"></div>
  </aside>

  <script>
    const initial = ${initial};
    const sampleCsv = 'propertyId,address,fireRiskRating,confidence,explanation,evidence,recommendation,vegetation,slope,roof,defensibleSpace,imageUrl\\n' +
      'P-1001,"2148 Cedar Ridge Rd, Sonoma CA",High,0.82,"Dense vegetation and slope increase ember exposure.","Brush within 30 ft; class B roof; steep west slope.","Clear defensible space and upgrade vents.",Dense,Steep,Class B,"Needs clearing",\\n' +
      'P-1002,"91 Lakeview Ct, Santa Rosa CA",Moderate,0.71,"Recent clearing reduced structure exposure.","Maintained 100 ft defensible space; nearby wildland interface.","Maintain annual vegetation clearance.",Light,Moderate,Class A,Good,\\n';
    const app = {
      state: null,
      preview: null,
      activeView: 'home',
      activeCards: [],
      activeResults: [],
    };

    const el = (id) => document.getElementById(id);
    const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[char]));
    const compact = (value, fallback) => {
      const text = String(value ?? '').trim();
      return text || fallback || '';
    };
    const jsonText = (value) => JSON.stringify(value ?? null, null, 2);
    const fmtNumber = (value) => Number(value || 0).toLocaleString();
    const fmtPercent = (value) => Math.round(Number(value || 0) * 100) + '%';
    const fmtMs = (value) => {
      const ms = Number(value);
      if (!Number.isFinite(ms)) return 'n/a';
      if (ms < 1000) return Math.round(ms) + ' ms';
      return (ms / 1000).toFixed(ms >= 10000 ? 0 : 1) + ' s';
    };
    const fmtDate = (value) => {
      if (!value) return 'n/a';
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return value;
      return date.toLocaleString();
    };
    const metricBox = (label, value, tone) => '<div class="stat"><span>' + escapeHtml(label) + '</span><b>' + escapeHtml(value) + '</b>' + (tone ? '<div class="muted small">' + escapeHtml(tone) + '</div>' : '') + '</div>';
    const emptyRow = (cols, text) => '<tr><td colspan="' + cols + '"><div class="empty">' + escapeHtml(text) + '</div></td></tr>';

    function getContext() {
      return {
        projectId: compact(el('projectId').value, initial.defaultProjectId),
        batchId: compact(el('batchId').value, initial.defaultBatchId),
        reviewer: compact(el('reviewer').value, initial.defaultReviewer),
      };
    }

    function getCreateContext() {
      const context = getContext();
      return {
        projectId: compact(el('newProjectId').value, context.projectId),
        projectName: compact(el('newProjectName').value, compact(el('newProjectId').value, context.projectId)),
        batchId: compact(el('newBatchId').value, context.batchId),
        batchName: compact(el('newBatchName').value, compact(el('newBatchId').value, context.batchId)),
        batchDescription: compact(el('newBatchDescription').value),
      };
    }

    function syncContext(projectId, batchId) {
      if (projectId) el('projectId').value = projectId;
      if (batchId) el('batchId').value = batchId;
      if (projectId) el('newProjectId').value = projectId;
      if (batchId) el('newBatchId').value = batchId;
    }

    function setStatus(message, isError) {
      el('globalStatus').textContent = message || '';
      el('globalStatus').className = 'status-line' + (isError ? ' error' : '');
    }

    function setCreateStatus(message, isError) {
      el('createStatus').textContent = message || '';
      el('createStatus').className = 'status-line' + (isError ? ' error' : '');
    }

    function authHeaders(extra) {
      const headers = Object.assign({}, extra || {});
      const token = compact(el('token').value);
      if (token) headers.authorization = 'Bearer ' + token;
      return headers;
    }

    async function request(path, options) {
      return fetch(path, Object.assign({}, options || {}, {
        headers: authHeaders(Object.assign({}, (options && options.headers) || {}, options && options.body ? { 'content-type': 'application/json' } : {})),
      }));
    }

    async function api(path, options) {
      const response = await request(path, options);
      const raw = await response.text();
      let body = {};
      try {
        body = raw ? JSON.parse(raw) : {};
      } catch {
        body = { ok: response.ok, raw };
      }
      if (!response.ok || body.ok === false) throw new Error(body.error || raw || response.statusText);
      return body;
    }

    async function apiText(path) {
      const response = await request(path);
      const raw = await response.text();
      if (!response.ok) {
        try {
          const body = raw ? JSON.parse(raw) : {};
          throw new Error(body.error || response.statusText);
        } catch (error) {
          throw new Error(error.message || raw || response.statusText);
        }
      }
      return raw;
    }

    function queryForContext() {
      const context = getContext();
      return new URLSearchParams(context).toString();
    }

    function setView(view) {
      app.activeView = view;
      document.querySelectorAll('[data-view-button]').forEach((button) => {
        button.classList.toggle('active', button.dataset.viewButton === view);
      });
      document.querySelectorAll('.view').forEach((section) => {
        section.classList.toggle('active', section.id === 'view-' + view);
      });
      const titles = {
        home: ['Dashboard Home', 'Projects, batches, review progress, and exports.'],
        create: ['Create Batch', 'Generate cards, preview them, then import.'],
        detail: ['Batch Detail', 'Metrics, labels, source context, and export.'],
      };
      el('pageTitle').textContent = titles[view][0];
      el('pageSubtitle').textContent = titles[view][1];
      if (view === 'detail') renderDetail();
    }

    async function loadState() {
      setStatus('Refreshing...');
      const state = await api('/api/eval/dashboard/state?' + queryForContext());
      app.state = state;
      app.activeCards = (state.selectedBatch && state.selectedBatch.cards) || [];
      app.activeResults = (state.selectedBatch && state.selectedBatch.recentResults) || [];
      renderHome();
      renderDetail();
      setStatus('');
    }

    function renderHome() {
      const state = app.state || {};
      const projects = state.projects || [];
      const batches = state.batches || [];
      const totalCards = projects.reduce((sum, project) => sum + Number(project.totalCards || 0), 0);
      const totalResults = projects.reduce((sum, project) => sum + Number(project.totalResultRows || 0), 0);
      const pending = projects.reduce((sum, project) => sum + Number(project.pendingCards || 0), 0);
      el('homeStats').innerHTML = [
        metricBox('Projects', fmtNumber(projects.length), ''),
        metricBox('Batches', fmtNumber(batches.length), ''),
        metricBox('Cards', fmtNumber(totalCards), fmtNumber(pending) + ' pending'),
        metricBox('Label Rows', fmtNumber(totalResults), 'JSONL ready'),
      ].join('');

      el('projectList').innerHTML = projects.length ? projects.map((project) => {
        const done = Number(project.reviewedCards || 0);
        const total = Number(project.totalCards || 0);
        const pct = total ? Math.round((done / total) * 100) : 0;
        return '<article class="project-card">' +
          '<h3>' + escapeHtml(project.name || project.projectId) + '</h3>' +
          '<div class="muted small">' + escapeHtml(project.projectId) + '</div>' +
          '<div class="progress"><i style="width:' + pct + '%"></i></div>' +
          '<div class="pill-row"><span class="pill blue">' + fmtNumber(project.totalBatches) + ' batches</span><span class="pill green">' + fmtNumber(done) + ' reviewed</span><span class="pill amber">' + fmtNumber(project.pendingCards) + ' pending</span></div>' +
          '</article>';
      }).join('') : '<div class="empty">No projects yet.</div>';

      el('batchRows').innerHTML = batches.length ? batches.map((batch, index) => {
        const metrics = batch.metrics || {};
        const total = Number(metrics.totalCards || 0);
        const reviewed = Number(metrics.reviewedCards || 0);
        const skipped = Number(metrics.skippedCards || 0);
        const pct = total ? Math.round(((reviewed + skipped) / total) * 100) : 0;
        return '<tr>' +
          '<td><button class="link" data-open-batch="' + index + '" type="button">' + escapeHtml(batch.name || batch.batchId) + '</button><div class="muted small">' + escapeHtml(batch.batchId) + '</div></td>' +
          '<td>' + escapeHtml(batch.projectId) + '</td>' +
          '<td><div class="progress"><i style="width:' + pct + '%"></i></div><div class="muted small">' + fmtNumber(reviewed) + ' reviewed, ' + fmtNumber(metrics.pendingCards) + ' pending, ' + fmtNumber(skipped) + ' skipped</div></td>' +
          '<td>' + fmtNumber(metrics.totalResultRows) + '</td>' +
          '<td><span class="pill ' + (metrics.exportStatus && metrics.exportStatus.ready ? 'green' : 'amber') + '">' + (metrics.exportStatus && metrics.exportStatus.ready ? 'Ready' : 'Empty') + '</span></td>' +
          '</tr>';
      }).join('') : emptyRow(5, 'No batches yet.');

      el('activityRows').innerHTML = (state.recentActivity || []).length ? state.recentActivity.map((row, index) => {
        return '<tr>' +
          '<td>' + escapeHtml(fmtDate(row.serverReceivedAt || row.clientGeneratedAt)) + '</td>' +
          '<td>' + escapeHtml(row.reviewer) + '</td>' +
          '<td><span class="pill blue">' + escapeHtml(row.answer) + '</span></td>' +
          '<td><button class="link activity-card" title="' + escapeHtml(row.cardId) + '" data-inspect-activity="' + index + '" type="button">' + escapeHtml(row.subject && row.subject.title || row.cardId) + '</button></td>' +
          '</tr>';
      }).join('') : emptyRow(4, 'No labels yet.');

      document.querySelectorAll('[data-open-batch]').forEach((button) => {
        button.addEventListener('click', async () => {
          const batch = batches[Number(button.dataset.openBatch)];
          syncContext(batch.projectId, batch.batchId);
          setView('detail');
          await loadState().catch((error) => setStatus(error.message, true));
        });
      });
      document.querySelectorAll('[data-inspect-activity]').forEach((button) => {
        button.addEventListener('click', () => openInspector((state.recentActivity || [])[Number(button.dataset.inspectActivity)]));
      });
    }

    function renderDetail() {
      const detail = (app.state && app.state.selectedBatch) || {};
      const metrics = detail.metrics || {};
      const batch = detail.batch || {};
      el('detailTitle').textContent = (batch.name || detail.batchId || 'Batch Detail') + ' Detail';
      el('detailStats').innerHTML = [
        metricBox('Total Cards', fmtNumber(metrics.totalCards), ''),
        metricBox('Reviewed', fmtNumber(metrics.reviewedCards), fmtNumber(metrics.pendingCards || 0) + ' pending'),
        metricBox('Skipped', fmtNumber(metrics.skippedCards), ''),
        metricBox('Avg Time', fmtMs(metrics.avgReviewTimeMs), ''),
        metricBox('Correction Rate', fmtPercent(metrics.correctionRate), fmtNumber(metrics.correctionCount) + ' corrections'),
      ].join('');

      const distribution = metrics.answerDistribution || {};
      const maxCount = Math.max(1, ...Object.values(distribution).map((value) => Number(value || 0)));
      el('answerBars').innerHTML = Object.keys(distribution).map((answer) => {
        const count = Number(distribution[answer] || 0);
        return '<div class="bar-row"><strong>' + escapeHtml(answer) + '</strong><div class="bar-track"><i style="width:' + Math.round((count / maxCount) * 100) + '%"></i></div><span class="muted">' + fmtNumber(count) + '</span></div>';
      }).join('') || '<div class="empty">No answers yet.</div>';

      el('reviewerRows').innerHTML = (metrics.reviewerBreakdown || []).length ? metrics.reviewerBreakdown.map((row) => {
        return '<tr><td>' + escapeHtml(row.reviewer) + '<div class="muted small">' + escapeHtml(fmtDate(row.lastReviewedAt)) + '</div></td><td>' + fmtNumber(row.total) + '</td><td>' + fmtNumber(row.corrections) + ' <span class="muted small">' + fmtPercent(row.correctionRate) + '</span></td><td>' + escapeHtml(fmtMs(row.avgDurationMs)) + '</td></tr>';
      }).join('') : emptyRow(4, 'No reviewer labels yet.');

      app.activeCards = detail.cards || [];
      app.activeResults = detail.recentResults || [];
      el('cardRows').innerHTML = app.activeCards.length ? app.activeCards.map((card, index) => {
        const latest = card.latestResult;
        const status = latest ? latest.answer : 'pending';
        const tone = status === 'pending' ? 'amber' : status === 'no' ? 'red' : 'green';
        const subject = card.subject || {};
        return '<tr>' +
          '<td><button class="link" data-inspect-card="' + index + '" type="button">' + escapeHtml(card.cardId) + '</button><div class="muted small">' + escapeHtml(card.claim && card.claim.template) + '</div></td>' +
          '<td>' + escapeHtml(card.question) + '</td>' +
          '<td>' + escapeHtml(subject.title || card.sourceKey || '') + '<div class="muted small">' + escapeHtml(subject.subtitle || '') + '</div></td>' +
          '<td><span class="pill ' + tone + '">' + escapeHtml(status) + '</span></td>' +
          '</tr>';
      }).join('') : emptyRow(4, 'No cards in this batch.');

      el('labelRows').innerHTML = app.activeResults.length ? app.activeResults.map((row, index) => {
        const correction = row.correction ? 'yes' : 'no';
        return '<tr>' +
          '<td>' + escapeHtml(fmtDate(row.serverReceivedAt || row.clientGeneratedAt)) + '</td>' +
          '<td>' + escapeHtml(row.reviewer) + '</td>' +
          '<td><span class="pill blue">' + escapeHtml(row.answer) + '</span></td>' +
          '<td>' + escapeHtml(correction) + '</td>' +
          '<td><button class="link" data-inspect-result="' + index + '" type="button">' + escapeHtml(row.eventId) + '</button></td>' +
          '</tr>';
      }).join('') : emptyRow(5, 'No labels yet.');

      document.querySelectorAll('[data-inspect-card]').forEach((button) => {
        button.addEventListener('click', () => openInspector(app.activeCards[Number(button.dataset.inspectCard)]));
      });
      document.querySelectorAll('[data-inspect-result]').forEach((button) => {
        button.addEventListener('click', () => openInspector(app.activeResults[Number(button.dataset.inspectResult)]));
      });
    }

    function renderPreview() {
      const preview = app.preview;
      const cards = (preview && preview.cards) || [];
      el('previewSummary').textContent = preview ? fmtNumber(preview.recordCount) + ' records, ' + fmtNumber(preview.cardCount) + ' cards' : 'No preview yet.';
      el('previewWarnings').innerHTML = preview && preview.warnings && preview.warnings.length
        ? '<div class="band" style="background:var(--amber-soft);border-color:#f2d184;color:var(--amber);">' + preview.warnings.map(escapeHtml).join('<br>') + '</div>'
        : '';
      el('previewRows').innerHTML = cards.length ? cards.slice(0, 50).map((card) => {
        return '<tr><td>' + escapeHtml(card.cardId) + '</td><td>' + escapeHtml(card.question) + '</td><td><code>' + escapeHtml(card.claim && card.claim.template) + '</code><div class="muted small">' + escapeHtml(card.claim && card.claim.value) + '</div></td></tr>';
      }).join('') : emptyRow(3, 'Preview generated cards before importing.');
    }

    function openInspector(item) {
      if (!item) return;
      const isResult = Boolean(item.eventId || item.answer);
      const card = isResult ? {
        cardId: item.cardId,
        question: item.question,
        claim: item.claim,
        subject: item.subject,
        evidence: item.evidence,
        analysisContext: item.analysisContext,
      } : item;
      const result = isResult ? item : item.latestResult;
      el('inspectorTitle').textContent = isResult ? 'Result Inspector' : 'Card Inspector';
      el('inspectorSubtitle').textContent = compact(card.cardId, '');
      el('inspectorBody').innerHTML =
        '<section class="panel"><h2>Original Card</h2><dl class="kv">' +
        '<dt>Question</dt><dd>' + escapeHtml(card.question) + '</dd>' +
        '<dt>Claim</dt><dd><code>' + escapeHtml(card.claim && card.claim.template) + '</code> ' + escapeHtml(card.claim && card.claim.value) + '</dd>' +
        '<dt>Subject</dt><dd>' + escapeHtml(card.subject && card.subject.title) + '</dd>' +
        '</dl></section>' +
        '<section class="panel"><h2>Label</h2>' + (result ? '<dl class="kv">' +
        '<dt>Reviewer</dt><dd>' + escapeHtml(result.reviewer) + '</dd>' +
        '<dt>Answer</dt><dd>' + escapeHtml(result.answer) + '</dd>' +
        '<dt>Correction</dt><dd><pre>' + escapeHtml(jsonText(result.correction)) + '</pre></dd>' +
        '<dt>Duration</dt><dd>' + escapeHtml(fmtMs(result.durationMs)) + '</dd>' +
        '<dt>Client Time</dt><dd>' + escapeHtml(result.clientGeneratedAt || '') + '</dd>' +
        '<dt>Server Time</dt><dd>' + escapeHtml(result.serverReceivedAt || '') + '</dd>' +
        '<dt>Event ID</dt><dd>' + escapeHtml(result.eventId || '') + '</dd>' +
        '<dt>Duplicate</dt><dd>' + escapeHtml(result.duplicateStatus || 'not stored twice') + '</dd>' +
        '</dl>' : '<div class="empty">No label for this card yet.</div>') + '</section>' +
        '<section class="panel"><h2>Evidence and Context</h2><div class="json-block"><pre>' + escapeHtml(jsonText({ evidence: card.evidence || [], analysisContext: card.analysisContext || {} })) + '</pre></div></section>';
      el('inspector').hidden = false;
    }

    async function previewCards() {
      setCreateStatus('Generating preview...');
      const context = getCreateContext();
      const preview = await api('/api/eval/cards/preview', {
        method: 'POST',
        body: JSON.stringify({
          projectId: context.projectId,
          batchId: context.batchId,
          adapter: el('adapter').value,
          format: el('format').value,
          raw: el('sourceInput').value,
        }),
      });
      app.preview = preview;
      renderPreview();
      setCreateStatus('Preview ready.');
      return preview;
    }

    async function confirmImport() {
      setCreateStatus('');
      let preview = app.preview;
      if (!preview || !preview.cards || !preview.cards.length) preview = await previewCards();
      if (!preview.cards.length) throw new Error('No cards generated.');
      const context = getCreateContext();
      const result = await api('/api/eval/cards/import', {
        method: 'POST',
        body: JSON.stringify({
          projectId: context.projectId,
          projectName: context.projectName,
          batchId: context.batchId,
          name: context.batchName,
          description: context.batchDescription,
          replace: el('replaceCards').checked,
          cards: preview.cards,
        }),
      });
      syncContext(result.projectId, result.batchId);
      setCreateStatus('Imported ' + fmtNumber(result.imported) + ', replaced ' + fmtNumber(result.replaced) + '.');
      await loadState();
      setView('detail');
    }

    async function downloadExport(format) {
      const context = getContext();
      const body = await apiText('/api/eval/results/export?' + queryForContext() + '&format=' + encodeURIComponent(format));
      const blob = new Blob([body], { type: format === 'csv' ? 'text/csv' : 'application/x-ndjson' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'medieval-' + context.projectId + '-' + context.batchId + '-results.' + (format === 'csv' ? 'csv' : 'jsonl');
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(link.href);
    }

    document.querySelectorAll('[data-view-button]').forEach((button) => {
      button.addEventListener('click', () => setView(button.dataset.viewButton));
    });
    if (el('reviewLink')) {
      el('reviewLink').addEventListener('click', (event) => {
        event.currentTarget.href = '/review?' + queryForContext();
      });
    }
    el('qualityLink').addEventListener('click', (event) => { event.currentTarget.href = '/quality?' + queryForContext(); });
    document.querySelectorAll('[data-view-jump]').forEach((button) => {
      button.addEventListener('click', () => setView(button.dataset.viewJump));
    });
    document.querySelectorAll('[data-export]').forEach((button) => {
      button.addEventListener('click', async () => {
        try {
          await downloadExport(button.dataset.export);
        } catch (error) {
          setStatus(error.message, true);
        }
      });
    });
    el('refresh').addEventListener('click', () => loadState().catch((error) => setStatus(error.message, true)));
    el('previewCards').addEventListener('click', () => previewCards().catch((error) => setCreateStatus(error.message, true)));
    el('confirmImport').addEventListener('click', () => confirmImport().catch((error) => setCreateStatus(error.message, true)));
    el('closeInspector').addEventListener('click', () => { el('inspector').hidden = true; });
    el('fileInput').addEventListener('change', async (event) => {
      const file = event.target.files && event.target.files[0];
      if (!file) return;
      el('sourceInput').value = await file.text();
      if (/\\.csv$/i.test(file.name)) el('format').value = 'csv';
      if (/\\.jsonl$|\\.ndjson$/i.test(file.name)) el('format').value = 'jsonl';
      if (/\\.json$/i.test(file.name)) el('format').value = 'json';
      app.preview = null;
      renderPreview();
    });
    ['projectId', 'batchId', 'reviewer', 'token'].forEach((id) => {
      el(id).addEventListener('change', () => {
        localStorage.setItem('medieval:' + id, el(id).value);
      });
    });
    ['projectId', 'batchId'].forEach((id) => {
      el(id).addEventListener('change', () => {
        if (id === 'projectId') el('newProjectId').value = el(id).value;
        if (id === 'batchId') el('newBatchId').value = el(id).value;
      });
    });

    el('projectId').value = localStorage.getItem('medieval:projectId') || initial.defaultProjectId;
    el('batchId').value = localStorage.getItem('medieval:batchId') || initial.defaultBatchId;
    el('reviewer').value = localStorage.getItem('medieval:reviewer') || initial.defaultReviewer;
    el('token').value = localStorage.getItem('medieval:token') || '';
    el('token').placeholder = initial.tokenConfigured ? 'configured' : 'optional';
    el('newProjectId').value = el('projectId').value;
    el('newProjectName').value = el('projectId').value;
    el('newBatchId').value = el('batchId').value;
    el('newBatchName').value = el('batchId').value;
    el('sourceInput').value = sampleCsv;
    renderPreview();
    loadState().catch((error) => setStatus(error.message, true));
  </script>
</body>
</html>`;
}
