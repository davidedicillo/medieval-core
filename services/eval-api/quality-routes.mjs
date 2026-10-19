export async function qualityRequest({ url, method, body, store, ctx, actor, manage }) {
  const route = url.pathname;
  if (!route.startsWith('/api/eval/quality') && !route.startsWith('/api/mobile/eval/quality')) return null;
  if (route.startsWith('/api/eval/') && !manage) throw Object.assign(new Error('Batch administrator access is required.'), { status: 403 });
  const quality = store.quality;
  if (method === 'GET' && ['/api/eval/quality', '/api/mobile/eval/quality'].includes(route)) {
    return { body: await quality.snapshot(ctx, manage && route === '/api/eval/quality') };
  }
  if (method === 'GET' && route === '/api/mobile/eval/quality/cards') return { body: await quality.deck(ctx, url.searchParams.get('kind') || 'practice') };
  if (method === 'POST' && route === '/api/eval/quality/settings') return { body: await quality.configure(ctx, body, actor) };
  if (method === 'POST' && route === '/api/eval/quality/references') return { body: await quality.addReference(ctx, body, actor) };
  if (method === 'POST' && route === '/api/eval/quality/references/retire') return { body: await quality.retireReference(ctx, body.id) };
  if (method === 'POST' && route === '/api/eval/quality/adjudications') return { body: await quality.adjudicate(ctx, body, actor) };
  if (method === 'GET' && route === '/api/eval/quality/export') {
    const labels = await quality.labels(ctx);
    const csv = url.searchParams.get('format') === 'csv';
    if (!csv) return { type: 'application/x-ndjson', body: labels.map((r) => JSON.stringify(r)).join('\n') + (labels.length ? '\n' : '') };
    const columns = ['projectId', 'batchId', 'cardId', 'sourceKey', 'rubricVersion', 'status', 'resolvedAnswer', 'reviewerCount', 'agreement', 'votes', 'judgments', 'adjudication', 'card'];
    const cell = (value) => '"' + (value === null || value === undefined ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value)).replaceAll('"', '""') + '"';
    return { type: 'text/csv', body: [columns.join(','), ...labels.map((r) => columns.map((key) => cell(({ projectId: ctx.projectId, batchId: ctx.batchId, ...r })[key])).join(','))].join('\n') + '\n' };
  }
  throw Object.assign(new Error('Quality route not found.'), { status: 404 });
}
