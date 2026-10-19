export function renderDemoReviewer({ accountMode = false } = {}) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Review Cards | MediEval</title>
  <link rel="icon" type="image/png" href="/demo/logo.png">
  <style>
    :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, sans-serif; color: #203831; background: #f5f7f5; font-size: 14px; letter-spacing: 0; }
    * { box-sizing: border-box; }
    body { margin: 0; }
    button, input, select, textarea { font: inherit; letter-spacing: 0; }
    button, .button { border: 1px solid #d5dfd9; border-radius: 6px; padding: 10px 16px; min-height: 42px; background: white; color: #203831; cursor: pointer; font-weight: 650; text-decoration: none; }
    button:hover, .button:hover { background: #ecfaf4; }
    button:disabled { opacity: .5; cursor: wait; }
    :focus-visible { outline: 3px solid #1c604a; outline-offset: 3px; }
    [hidden] { display: none !important; }
    header { background: white; border-bottom: 1px solid #d5dfd9; }
    .top { max-width: 1100px; min-height: 82px; margin: auto; display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 16px; padding: 10px 24px; }
    .brand { display: inline-flex; flex-shrink: 0; align-items: center; }
    .brand img { display: block; width: 144px; height: auto; aspect-ratio: 1915 / 821; object-fit: contain; }
    main { max-width: 1100px; margin: auto; padding: 28px 24px 48px; }
    h1 { font-size: 26px; margin: 0 0 20px; }
    h2 { font-size: 21px; line-height: 1.4; margin: 12px 0 22px; overflow-wrap: anywhere; }
    h3 { font-size: 13px; margin: 0 0 10px; color: #5d6c66; }
    p { line-height: 1.6; margin: 0; }
    .toolbar { display: grid; grid-template-columns: minmax(0, 1fr) 200px; gap: 16px; margin-bottom: 20px; }
    label { display: grid; gap: 7px; font-size: 12px; font-weight: 650; color: #5d6c66; }
    input, select, textarea { width: 100%; min-width: 0; border: 1px solid #d5dfd9; border-radius: 6px; background: white; color: #203831; padding: 10px; min-height: 42px; }
    textarea { resize: vertical; min-height: 80px; }
    .progress-row { display: flex; justify-content: space-between; gap: 16px; color: #5d6c66; margin-bottom: 10px; }
    progress { display: block; width: 100%; height: 8px; accent-color: #1c604a; margin-bottom: 24px; }
    .workspace { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr); background: white; border: 1px solid #d5dfd9; border-radius: 8px; overflow: hidden; }
    .claim { padding: 28px; border-right: 1px solid #d5dfd9; }
    .evidence { padding: 28px; background: #f5f7f5; }
    .meta { display: flex; gap: 14px; flex-wrap: wrap; font-size: 12px; color: #5d6c66; }
    .value { font-size: 17px; font-weight: 650; line-height: 1.6; overflow-wrap: anywhere; }
    .rule { border-top: 1px solid #d5dfd9; margin-top: 24px; padding-top: 24px; }
    .source-title { font-weight: 700; font-size: 16px; margin-bottom: 8px; overflow-wrap: anywhere; }
    .source-meta { font-size: 12px; color: #5d6c66; margin-bottom: 22px; }
    .evidence ul { padding-left: 20px; line-height: 1.6; }
    .evidence li { margin-bottom: 12px; overflow-wrap: anywhere; }
    .media { max-width: 100%; max-height: 300px; object-fit: contain; display: block; margin-bottom: 18px; }
    .fields { display: grid; gap: 16px; margin-top: 24px; }
    .verdicts { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin-top: 24px; }
    .yes { background: #1c604a; color: white; border-color: #1c604a; }
    .yes:hover { background: #1a6048; }
    .no { color: #a44335; border-color: #d8b6b0; }
    .minor { display: flex; justify-content: space-between; gap: 12px; margin-top: 12px; }
    .minor button { border: 0; font-size: 12px; color: #5d6c66; background: transparent; padding: 8px 0; }
    #status { min-height: 36px; padding-top: 12px; color: #1c604a; line-height: 1.5; }
    #status.error { color: #a44335; }
    .complete { padding: 40px 0; border-top: 1px solid #d5dfd9; }
    .complete h2 { margin-top: 0; }
    .complete a { display: inline-block; margin-top: 20px; }
    footer { display: flex; gap: 20px; flex-wrap: wrap; margin-top: 24px; font-size: 12px; }
    a { color: #1c604a; }
    details { margin-top: 24px; font-size: 12px; color: #5d6c66; }
    summary { cursor: pointer; }
    pre { white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.5; }
    @media (max-width: 700px) { .top { min-height: 75px; padding: 10px 16px; } .brand img { width: 128px; } main { padding: 24px 16px; } .toolbar, .workspace { grid-template-columns: 1fr; } .claim { display: contents; } .claim-intro, .evidence, .review-actions { padding: 20px; } .claim-intro, .evidence { border-bottom: 1px solid #d5dfd9; } .evidence { order: 1; } .review-actions { order: 2; } .review-actions .fields { margin-top: 0; } }
  </style>
</head>
<body>
  <header><div class="top"><a class="brand" href="/" aria-label="MediEval home"><img src="/demo/logo.png" alt="MediEval" width="1915" height="821"></a><a id="dashboard" class="button" href="/">${accountMode ? 'My Batches' : 'Dashboard'}</a></div></header>
  <main>
    <h1>Review Cards</h1>
    <div class="toolbar"><label>Batch<select id="batch"></select></label><label>Reviewer<input id="reviewer" value="Davide" autocomplete="off"></label></div>
    <div class="progress-row"><span id="progressText">Loading batch...</span><span id="pending"></span></div>
    <progress id="progress" max="1" value="0" aria-label="Review progress"></progress>
    <section id="workspace" class="workspace" hidden aria-label="Current review card">
      <div class="claim">
        <div class="claim-intro">
        <div class="meta"><span id="priority"></span><span id="confidence"></span></div>
        <h2 id="question"></h2>
        <h3>Model claim</h3><p id="value" class="value"></p>
        </div>
        <div class="review-actions">
        <div class="fields"><label>Correction (optional)<input id="correction" autocomplete="off"></label><label>Notes (optional)<textarea id="notes" rows="3"></textarea></label></div>
        <div class="verdicts"><button class="yes" data-answer="yes">Yes</button><button class="no" data-answer="no">No</button><button data-answer="unsure">Unsure</button></div>
        <div class="minor"><button data-answer="bad_question">Bad question</button><button data-answer="skip">Skip</button></div>
        </div>
      </div>
      <div class="evidence">
        <h3>Source</h3><p id="subject" class="source-title"></p><p id="sourceMeta" class="source-meta"></p>
        <div id="media"></div><h3>Evidence</h3><ul id="evidence"></ul>
        <div class="rule"><h3>Model context</h3><p id="context"></p></div>
        <details><summary>Source record</summary><pre id="record"></pre></details>
      </div>
    </section>
    <section id="complete" class="complete" hidden><h2>Batch complete</h2><p>All cards have a saved verdict for this reviewer.</p><a class="button" id="results" href="/">View Results</a></section>
    <div id="status" role="status" aria-live="polite"></div>
    <button id="retry" hidden>Retry</button>
    <footer><a href="/demo/myfire-rating.csv">Sample CSV</a><a href="/demo/cards.jsonl">Sample JSONL</a></footer>
  </main>
  <script>
    const el = (id) => document.getElementById(id);
    const accountMode = ${Boolean(accountMode)};
    let storagePrefix = 'medieval:';
    const params = new URLSearchParams(location.search);
    const state = { batches: [], card: null, startedAt: 0, eventId: null, busy: false, generation: 0 };
    el('reviewer').value = params.get('reviewer') || localStorage.getItem('medieval:reviewer') || 'Davide';
    function context() {
      const batch = state.batches[Number(el('batch').value)];
      return { projectId: batch.projectId, batchId: batch.batchId, reviewer: el('reviewer').value.trim() || 'Davide' };
    }
    function saveContext() {
      if (!state.batches.length) return;
      Object.entries(context()).forEach(([key, value]) => localStorage.setItem(storagePrefix + key, value));
    }
    function status(message, error = false) {
      el('status').textContent = message;
      el('status').className = error ? 'error' : '';
      el('retry').hidden = !error;
    }
    async function api(url, options = {}) {
      const response = await fetch(url, options);
      const body = await response.json();
      if (!response.ok) {
        if (response.status === 401 && accountMode) location.href = '/';
        throw new Error(body.error || 'Request failed.');
      }
      return body;
    }
    function setBusy(busy) {
      state.busy = busy;
      document.querySelectorAll('[data-answer], #batch, #reviewer').forEach((control) => { control.disabled = busy || (accountMode && control.id === 'reviewer'); });
    }
    async function loadCard() {
      const generation = ++state.generation;
      setBusy(true);
      state.card = null;
      el('workspace').hidden = true;
      el('complete').hidden = true;
      try {
        const query = new URLSearchParams(context());
        saveContext();
        const [deck, summary] = await Promise.all([
          api('/api/mobile/eval/cards?' + query + '&limit=1'),
          api('/api/mobile/eval/summary?' + query),
        ]);
        if (generation !== state.generation) return;
        const total = summary.summary.totalCards;
        const reviewed = total - deck.total;
        el('progress').max = Math.max(1, total);
        el('progress').value = reviewed;
        el('progressText').textContent = reviewed + ' of ' + total + ' reviewed';
        el('pending').textContent = deck.total + ' remaining';
        el('complete').hidden = Boolean(deck.cards.length);
        state.card = deck.cards[0] || null;
        if (!state.card) return;
        const card = state.card;
        state.startedAt = Date.now();
        state.eventId = crypto.randomUUID();
        el('question').textContent = card.question;
        el('value').textContent = card.claim.value;
        el('priority').textContent = card.priority + ' priority';
        el('confidence').textContent = card.confidence == null ? 'Confidence unavailable' : Math.round(card.confidence * 100) + '% confidence';
        el('subject').textContent = card.subject?.title || card.sourceKey;
        el('sourceMeta').textContent = [card.subject?.subtitle, card.subject?.source].filter(Boolean).join(' / ');
        el('evidence').replaceChildren();
        for (const evidence of card.evidence || []) {
          const item = document.createElement('li');
          item.textContent = evidence.detail;
          el('evidence').appendChild(item);
        }
        if (!el('evidence').children.length) { const item = document.createElement('li'); item.textContent = 'No supporting evidence supplied.'; el('evidence').appendChild(item); }
        el('context').textContent = card.analysisContext?.summary || 'No model context supplied.';
        el('record').textContent = JSON.stringify(card.analysisContext?.sourceRecord || card.subject?.metadata || card, null, 2);
        el('media').replaceChildren();
        for (const media of card.media || []) {
          if (media.type !== 'image') continue;
          const url = new URL(media.url, location.origin);
          if (!['http:', 'https:'].includes(url.protocol)) continue;
          const image = document.createElement('img'); image.className = 'media'; image.src = url.href; image.alt = media.label || 'Source image'; el('media').appendChild(image);
        }
        el('correction').value = '';
        el('notes').value = '';
        el('workspace').hidden = false;
      } finally {
        if (generation === state.generation) setBusy(false);
      }
    }
    async function submit(answer) {
      if (state.busy || !state.card) return;
      setBusy(true);
      status('Saving verdict...');
      const correction = el('correction').value.trim();
      try {
        await api('/api/mobile/eval/results?' + new URLSearchParams(context()), {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ...context(), eventId: state.eventId, cardId: state.card.cardId, answer, correction: correction ? { correctAnswer: correction } : null, notes: el('notes').value.trim(), durationMs: Date.now() - state.startedAt, clientGeneratedAt: new Date().toISOString() }),
        });
      } catch (error) {
        status(error.message, true);
        setBusy(false);
        return;
      }
      try { await loadCard(); status('Verdict saved.'); } catch (error) { status('Verdict saved. Could not load the next card: ' + error.message, true); }
    }
    document.querySelectorAll('[data-answer]').forEach((button) => button.addEventListener('click', () => submit(button.dataset.answer)));
    for (const id of ['batch', 'reviewer']) el(id).addEventListener('change', () => { status(''); loadCard().catch((error) => status(error.message, true)); });
    for (const id of ['dashboard', 'results']) el(id).addEventListener('click', saveContext);
    async function initialize() {
      status('Loading...');
      if (accountMode) {
        const me = await api('/api/me');
        el('reviewer').value = me.user.name || me.user.email;
        el('reviewer').readOnly = true;
        storagePrefix = 'medieval:account:' + me.user.id + ':';
      }
      state.batches = (await api(accountMode ? '/api/me/batches' : '/api/eval/batches')).batches;
      el('batch').replaceChildren();
      for (const [index, batch] of state.batches.entries()) {
        const option = document.createElement('option'); option.value = index; option.textContent = (batch.workspaceName ? batch.workspaceName + ' / ' + batch.projectName : batch.projectId) + ' / ' + batch.name; el('batch').appendChild(option);
      }
      if (!state.batches.length) { status('No batches available.'); return; }
      const project = params.get('projectId') || localStorage.getItem(storagePrefix + 'projectId') || 'myfire-rating';
      const batchId = params.get('batchId') || localStorage.getItem(storagePrefix + 'batchId') || 'property-review';
      const selected = state.batches.findIndex((batch) => batch.projectId === project && batch.batchId === batchId);
      const fallback = state.batches.findIndex((batch) => batch.projectId === 'myfire-rating' && batch.batchId === 'property-review');
      el('batch').value = selected >= 0 ? selected : Math.max(0, fallback);
      await loadCard();
      status('');
    }
    el('retry').addEventListener('click', () => { status(''); (state.batches.length ? loadCard() : initialize()).catch((error) => status(error.message, true)); });
    initialize().catch((error) => status(error.message, true));
  </script>
</body>
</html>`;
}
