#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { manifest, servedManifest, documentationUrl, renderMarkdown } from '../services/documentation/server.mjs';
import { createEvalApiServer } from '../services/eval-api/server.mjs';
import { EvalFileStore } from '../services/eval-api/store.mjs';
import { evalAnswerValues, validateEvalCard, validateEvalResult } from '../packages/schema/index.mjs';
import { generateCardsFromRecords } from '../packages/schema/card-generator.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = (file) => fs.readFile(path.join(root, file), 'utf8');
const json = async (file) => JSON.parse(await read(file));
const catalog = await json('docs/agent/api.json');
const workflows = await json('docs/agent/workflows.json');
const schemas = await json('docs/agent/schemas.json');
const examples = await json('docs/agent/examples.json');
const entries = [...manifest.documents, ...manifest.resources];
const unique = (items, label) => assert.equal(new Set(items).size, items.length, `Duplicate ${label}`);
unique(entries.map((d) => d.id), 'document/resource ID');
unique(entries.map((d) => d.file), 'document/resource path');
unique(catalog.operations.map((o) => o.id), 'operation ID');
unique(workflows.workflows.map((w) => w.id), 'workflow ID');
unique(examples.examples.map((e) => e.id), 'example ID');
assert.deepEqual(schemas.$defs.Answer.enum, [...evalAnswerValues]);
const operations = new Map(catalog.operations.map((o) => [o.id, o]));
for (const op of catalog.operations) {
  assert(op.path.startsWith('/'), op.id);
  assert(['GET', 'POST'].includes(op.method), op.id);
  assert(catalog.conventions.authentication[op.auth], `Unknown auth: ${op.id}`);
  assert(catalog.conventions.retryValues[op.retry], `Unknown retry rule: ${op.id}`);
  if (op.requestSchema) assert(schemas.$defs[op.requestSchema], `Unknown schema: ${op.id}`);
  for (const service of op.services) assert(manifest.services[service], `Unknown service: ${op.id}`);
}
for (const workflow of workflows.workflows) {
  assert(workflow.prerequisites.length && workflow.success.length && workflow.stopConditions.length, workflow.id);
  await fs.access(path.resolve(root, 'docs/agent', workflow.guide));
  for (const step of workflow.steps) {
    const operation = operations.get(step.operation);
    assert(operation, `Missing operation: ${workflow.id}/${step.operation}`);
    for (const service of workflow.services) assert(operation.services.includes(service), `Wrong service: ${workflow.id}/${operation.id}`);
  }
}

// Validate the JSON Schema keywords used by our examples, without adding a runtime dependency.
// This is intentionally not a general JSON Schema implementation.
function validate(value, schema, label) {
  if (schema.$ref) return validate(value, schemas.$defs[schema.$ref.split('/').at(-1)], label);
  for (const part of schema.allOf || []) validate(value, part, label);
  if (schema.anyOf) assert(schema.anyOf.some((part) => { try { validate(value, part, label); return true; } catch { return false; } }), `${label}: anyOf`);
  if (schema.const !== undefined) assert.deepEqual(value, schema.const, `${label}: const`);
  if (schema.enum) assert(schema.enum.includes(value), `${label}: enum`);
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    assert(types.some((type) => type === 'null' ? value === null : type === 'array' ? Array.isArray(value) : type === 'integer' ? Number.isInteger(value) : type === 'object' ? value !== null && typeof value === 'object' && !Array.isArray(value) : typeof value === type), `${label}: type`);
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const key of schema.required || []) assert(Object.hasOwn(value, key), `${label}.${key}: required`);
    for (const [key, val] of Object.entries(value)) {
      if (schema.properties?.[key]) validate(val, schema.properties[key], `${label}.${key}`);
      else if (schema.additionalProperties === false) assert.fail(`${label}.${key}: unknown property`);
    }
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined) assert(value.length >= schema.minItems, `${label}: minItems`);
    if (schema.uniqueItems) unique(value.map((v) => JSON.stringify(v)), label);
    if (schema.items) value.forEach((v, i) => validate(v, schema.items, `${label}[${i}]`));
  }
  if (typeof value === 'string') {
    if (schema.minLength !== undefined) assert(value.length >= schema.minLength, `${label}: minLength`);
    if (schema.maxLength !== undefined) assert(value.length <= schema.maxLength, `${label}: maxLength`);
    if (schema.format === 'date-time') assert(Number.isFinite(Date.parse(value)), `${label}: date-time`);
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined) assert(value >= schema.minimum, `${label}: minimum`);
    if (schema.maximum !== undefined) assert(value <= schema.maximum, `${label}: maximum`);
    if (schema.exclusiveMinimum !== undefined) assert(value > schema.exclusiveMinimum, `${label}: exclusiveMinimum`);
  }
}
for (const example of examples.examples) {
  assert(schemas.$defs[example.schema], example.id);
  validate(example.value, schemas.$defs[example.schema], example.id);
  if (example.schema === 'Card') assert.deepEqual(validateEvalCard(example.value), []);
  if (example.schema === 'Result') assert.deepEqual(validateEvalResult(example.value), []);
}

let checkedLinks = 0;
for (const entry of entries) {
  const source = await read(entry.file);
  if (entry.file.endsWith('.json')) JSON.parse(source);
  if (!entry.file.endsWith('.md') && entry.file !== 'llms.txt') continue;
  const prose = source.replace(/```[^\n]*\n[\s\S]*?```/g, '');
  for (const match of prose.matchAll(/!?\[[^\]]+\]\(([^\s)]+)\)/g)) {
    const href = match[1];
    if (/^(?:https?:|mailto:|#)/.test(href)) continue;
    const [file, fragment] = href.split('#');
    const target = path.resolve(root, path.dirname(entry.file), decodeURIComponent(file));
    assert(target.startsWith(root), `${entry.file}: link outside repository ${href}`);
    try { await fs.access(target); } catch { assert.fail(`${entry.file}: broken link ${href}`); }
    if (fragment && file.endsWith('.md')) {
      const rendered = renderMarkdown(await fs.readFile(target, 'utf8'), path.relative(root, target)).html;
      assert(rendered.includes(`id="${fragment}"`), `${entry.file}: missing anchor ${href}`);
    }
    checkedLinks++;
  }
}
for (const file of ['docs/QUICKSTART.md', 'docs/IMPORTING.md']) {
  const sample = JSON.parse((await read(file)).match(/```json\n([\s\S]*?)```/)[1]);
  const cards = generateCardsFromRecords(Array.isArray(sample) ? sample : [sample], { adapter: 'generic' }).cards;
  assert.equal(cards.length, 1, `${file}: working first-use example`);
  assert.equal(cards[0].sourceKey, 'catalog:001');
  assert.equal(cards[0].claim.value, 'blue');
  assert.match(cards[0].analysisContext.summary, /blue cotton shirt/);
}

const unsafe = renderMarkdown('<script>alert(1)</script>\n\n[bad](javascript:alert)\n\n[safe](QUALITY.md)', 'docs/README.md').html;
assert(!unsafe.includes('<script>') && !unsafe.includes('href="javascript:'), 'Escaped renderer');
assert(unsafe.includes('href="/docs/QUALITY"'));

const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'medieval-docs-'));
const server = createEvalApiServer({ store: new EvalFileStore({ dataDir }), token: 'docs-test-token' });
try {
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const entry of entries) {
    const response = await fetch(base + documentationUrl(entry.file));
    assert.equal(response.status, 200, entry.file);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    const text = await response.text();
    if (entry.file.endsWith('.json')) assert.deepEqual(JSON.parse(text), entry.id === 'manifest' ? servedManifest : JSON.parse(await read(entry.file)));
    if (entry.file.endsWith('.md')) {
      assert.match(text, /<!doctype html>/);
      assert.match(response.headers.get('content-security-policy'), /default-src 'none'/);
      assert.equal(await fetch(base + documentationUrl(entry.file, true)).then((r) => r.text()), await read(entry.file));
    }
  }
  const full = await fetch(base + '/llms-full.txt').then((r) => r.text());
  for (const guide of manifest.documents.filter((d) => d.combined)) assert(full.includes(`source: ${guide.file}`), guide.file);
  const search = await fetch(base + '/docs?q=qualification').then((r) => r.text());
  assert.match(search, /Search results/); assert.match(search, /href="\/docs\/QUALITY"/);
  const escaped = await fetch(base + '/docs?q=' + encodeURIComponent('<script>alert(1)</script>')).then((r) => r.text());
  assert(!escaped.includes('<script>'));
  assert.equal((await fetch(base + '/docs', { method: 'HEAD' })).status, 200);
  assert.equal((await fetch(base + '/docs', { method: 'POST', body: '{}' })).status, 405);
  for (const url of ['/docs/agent/absent.json', '/docs/files/.env', '/docs/files/services/platform/auth.mjs', '/docs/%2e%2e%2f.env', '/docs/api/me']) assert.equal((await fetch(base + url)).status, 404, url);
  assert.equal((await fetch(base + '/api/eval/projects')).status, 401, 'Docs cannot bypass API authentication');

  const context = new URLSearchParams({ projectId: 'catalog', batchId: 'color-round-1', reviewer: 'expert-1' });
  async function call(id, body, query = context) {
    const op = operations.get(id);
    const response = await fetch(base + op.path + (query ? '?' + query : ''), { method: op.method, headers: { authorization: 'Bearer docs-test-token', 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    assert.equal(response.status, 200, `${id}: ${await response.clone().text()}`);
    const result = response.headers.get('content-type').includes('application/json') ? await response.json() : await response.text();
    for (const field of op.responseFields) assert(Object.hasOwn(result, field), `${id}: documented response field ${field}`);
    return result;
  }
  const example = (id) => structuredClone(examples.examples.find((e) => e.id === id).value);
  const initialQuality = await call('own-quality');
  for (const [key, schema] of Object.entries(schemas.$defs.QualitySettings.properties)) {
    assert.deepEqual(initialQuality.settings[key], schema.default, `Documented default: ${key}`);
  }
  const preview = await call('eval-preview', example('preview'));
  assert.equal(preview.cards.length, 1);
  assert.match(preview.cards[0].analysisContext.summary, /blue cotton shirt/);
  await call('import-cards', example('direct-import'));
  const settings = example('solo-settings'); settings.expertReviewers = ['expert-1'];
  await call('configure-quality', settings);
  const deck = await call('review-deck');
  assert.equal(deck.cards[0].reviewRubric.version, '1');
  const result = example('production-result');
  assert.equal((await call('submit-result', result)).duplicate, false);
  assert.equal((await call('submit-result', result)).duplicate, true);
  const raw = (await call('export-results')).trim().split('\n').map(JSON.parse);
  assert.equal(raw.length, 1); assert.equal(raw[0].cardId, result.cardId);
  const resolved = (await call('export-resolved')).trim().split('\n').map(JSON.parse);
  assert.equal(resolved[0].status, 'expert_reviewed'); assert.equal(resolved[0].resolvedAnswer, 'yes');
  await call('add-reference', example('reference'));
  for (const id of ['health', 'list-projects', 'list-batches', 'eval-batch-detail', 'dashboard-state', 'review-summary', 'own-quality', 'quality-deck', 'manager-quality']) await call(id);
  console.log(`Documentation checks passed: ${manifest.documents.length} documents, ${catalog.operations.length} operations, ${workflows.workflows.length} workflows, ${examples.examples.length} schema-checked examples, ${checkedLinks} local links, public routes and working import/review/export.`);
} finally {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  await fs.rm(dataDir, { recursive: true, force: true });
}
