#!/usr/bin/env node
import fs from 'node:fs/promises';
import { text } from '../schema/index.mjs';

function usage() {
  console.log(`MediEval CLI

Usage:
  medieval-eval import --file cards.jsonl --base-url http://127.0.0.1:5182 --token TOKEN [--project default] [--batch default] [--replace]
  medieval-eval export --out results.jsonl --base-url http://127.0.0.1:5182 --token TOKEN [--format jsonl|csv] [--project default] [--batch default] [--reviewer name]

Legacy --run is still accepted as an alias for --batch.
`);
}

function args(argv) {
  const out = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith('--')) {
      out._.push(value);
      continue;
    }
    const key = value.slice(2);
    if (key === 'replace') {
      out[key] = true;
    } else {
      out[key] = argv[index + 1];
      index += 1;
    }
  }
  return out;
}

function authHeaders(token) {
  return token ? { authorization: `Bearer ${token}` } : {};
}

async function requestJson(url, options) {
  const response = await fetch(url, options);
  const body = await response.text();
  const parsed = body ? JSON.parse(body) : {};
  if (!response.ok || parsed.ok === false) {
    throw new Error(parsed.error || body || response.statusText);
  }
  return parsed;
}

async function importCards(options) {
  const baseUrl = text(options['base-url']);
  const file = text(options.file);
  const batchId = text(options.batch ?? options.run, 'default');
  if (!baseUrl || !file) throw new Error('import requires --base-url and --file.');
  const raw = await fs.readFile(file, 'utf8');
  const cards = raw.split(/\r?\n/).filter((line) => line.trim()).map((line) => JSON.parse(line));
  const result = await requestJson(`${baseUrl}/api/eval/cards/import`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...authHeaders(text(options.token)) },
    body: JSON.stringify({
      projectId: text(options.project, 'default'),
      batchId,
      replace: Boolean(options.replace),
      cards,
    }),
  });
  console.log(JSON.stringify(result, null, 2));
}

async function exportResults(options) {
  const baseUrl = text(options['base-url']);
  const out = text(options.out);
  const batchId = text(options.batch ?? options.run, 'default');
  if (!baseUrl || !out) throw new Error('export requires --base-url and --out.');
  const params = new URLSearchParams({
    projectId: text(options.project, 'default'),
    batchId,
    reviewer: text(options.reviewer, 'anonymous'),
    format: text(options.format, 'jsonl'),
  });
  const response = await fetch(`${baseUrl}/api/eval/results/export?${params}`, {
    headers: authHeaders(text(options.token)),
  });
  const body = await response.text();
  if (!response.ok) throw new Error(body || response.statusText);
  await fs.writeFile(out, body, 'utf8');
  console.log(`Wrote ${out}`);
}

const options = args(process.argv.slice(2));
const command = options._[0];
try {
  if (command === 'import') await importCards(options);
  else if (command === 'export') await exportResults(options);
  else usage();
  process.exitCode = 0;
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}

process.exit(process.exitCode ?? 0);
