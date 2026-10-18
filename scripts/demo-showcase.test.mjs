import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { showcaseCard, showcaseSource, loadShowcaseImage } from './demo-showcase.mjs';

test('public example pairs a verified photograph with an honest caption', () => {
  const card = showcaseCard('http://127.0.0.1:5199');
  assert.equal(card.claim.value, 'A rover is visible on rocky terrain.');
  assert.equal(card.confidence, null);
  assert.match(card.subject.url, /jpl\.nasa\.gov\/images\/pia19808/);
  assert.equal(card.images[0].source, showcaseSource.credit);
  assert.match(card.analysisContext.warnings[0], /illustrative caption/);
  assert.ok(card.images.every((image) => !image.url.includes('/demo/images/')));
  const image = loadShowcaseImage();
  assert.equal(image.subarray(0, 2).toString('hex'), 'ffd8');
  assert.equal(createHash('sha256').update(image).digest('hex'), showcaseSource.sha256);
});

test('showcase server serves the real photo and rejects smoke images', async (t) => {
  const listener = createServer();
  listener.listen(0, '127.0.0.1');
  await once(listener, 'listening');
  const port = listener.address().port;
  await new Promise((resolve) => listener.close(resolve));
  const child = spawn(process.execPath, [fileURLToPath(new URL('./demo-server.mjs', import.meta.url))], { env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', MEDIEVAL_DEMO_PROFILE: 'showcase', MEDIEVAL_DEMO_TOKEN: 'demo-token' }, stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => child.kill('SIGTERM'));
  let output = '';
  const base = await new Promise((resolve, reject) => {
    child.stdout.on('data', (data) => {
      output += data;
      const match = output.match(/URL: (http:\/\/127\.0\.0\.1:\d+)/);
      if (match) resolve(match[1]);
    });
    child.once('exit', (code) => reject(new Error(`Showcase exited ${code}`)));
    setTimeout(() => reject(new Error('Showcase startup timed out')), 5000).unref();
  });
  const response = await fetch(`${base}/api/mobile/eval/cards`, { headers: { authorization: 'Bearer demo-token' } });
  assert.equal(response.status, 200);
  const deck = await response.json();
  assert.equal(deck.cards.length, 1);
  const photo = await fetch(deck.cards[0].images[0].url);
  assert.equal(photo.headers.get('content-type'), 'image/jpeg');
  assert.equal(createHash('sha256').update(Buffer.from(await photo.arrayBuffer())).digest('hex'), showcaseSource.sha256);
  assert.equal((await fetch(`${base}/demo/images/legacy-edition.png`)).status, 404);
  child.kill('SIGTERM');
  await once(child, 'exit');
});
