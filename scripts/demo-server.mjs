#!/usr/bin/env node

import http from 'node:http';
import os from 'node:os';
import { deflateSync } from 'node:zlib';
import { loadShowcaseImage, showcaseCard } from './demo-showcase.mjs';

const port = Number(process.env.PORT ?? process.env.MEDIEVAL_DEMO_PORT ?? 5199);
const host = process.env.HOST ?? '127.0.0.1';
const token = String(process.env.MEDIEVAL_DEMO_TOKEN ?? 'demo-token');
const publicReview = process.env.MEDIEVAL_DEMO_PUBLIC_REVIEW === '1';
if (publicReview && token.length < 32) throw new Error('Public review requires a dedicated token of at least 32 characters.');
const runId = `demo-${new Date().toISOString().slice(0, 10)}`;
const demoProfile = process.env.MEDIEVAL_DEMO_PROFILE ?? 'smoke';
if (!['smoke', 'showcase'].includes(demoProfile)) throw new Error('MEDIEVAL_DEMO_PROFILE must be smoke or showcase');
const isShowcase = demoProfile === 'showcase';
const showcasePhoto = isShowcase ? loadShowcaseImage() : null;

const results = [];
const gameEvents = new Map();
const profiles = new Map();

const answerKeys = ['yes', 'no', 'unsure', 'bad_question', 'skip'];

function normalizeReviewer(value) {
  const reviewer = String(value ?? '').trim();
  return reviewer || 'Davide';
}

function normalizeAnswer(value) {
  const answer = String(value ?? '').trim().toLowerCase();
  if (!answerKeys.includes(answer)) {
    throw new Error(`Invalid answer: ${answer || '(empty)'}`);
  }
  return answer;
}

function reviewerKey(reviewer) {
  return normalizeReviewer(reviewer).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'davide';
}

function json(response, status, body) {
  const data = Buffer.from(JSON.stringify(body, null, 2));
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': data.length,
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'authorization, content-type, x-eval-mobile-token, x-medieval-game-token',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
  });
  response.end(data);
}

function text(response, status, body) {
  response.writeHead(status, {
    'content-type': 'text/plain; charset=utf-8',
    'access-control-allow-origin': '*',
  });
  response.end(body);
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(error);
      }
    });
    request.on('error', reject);
  });
}

function providedToken(request) {
  const authorization = request.headers.authorization ?? '';
  const bearer = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  return bearer
    ?? request.headers['x-eval-mobile-token']
    ?? request.headers['x-medieval-game-token']
    ?? '';
}

function isAuthorized(request) {
  return String(providedToken(request)).trim() === token;
}

function ensureAuthorized(request, response) {
  if (isAuthorized(request)) return true;
  json(response, 401, { ok: false, error: 'Invalid MediEval demo token.' });
  return false;
}

function publicBaseURL(request) {
  const proto = request.headers['x-forwarded-proto'] ?? 'http';
  const requestHost = request.headers.host ?? `${host}:${port}`;
  return `${proto}://${requestHost}`;
}

function localDemoURLs() {
  const urls = new Set();
  if (host && host !== '0.0.0.0' && host !== '::') {
    urls.add(`http://${host}:${port}`);
  }
  urls.add(`http://127.0.0.1:${port}`);
  for (const interfaces of Object.values(os.networkInterfaces())) {
    for (const address of interfaces ?? []) {
      if (address.family === 'IPv4' && !address.internal) {
        urls.add(`http://${address.address}:${port}`);
      }
    }
  }
  return Array.from(urls);
}

function baseCards(request) {
  const base = publicBaseURL(request);
  if (isShowcase) return [showcaseCard(base)];
  return [
    {
      schemaVersion: '1.0',
      cardId: 'demo-variant-007-legacy',
      cardType: 'binary_claim',
      question: 'Does the source image show this variant signal?',
      claim: {
        template: 'variant_signal',
        path: 'analysis.variants[0].signal',
        value: 'Visible on outer box: "FIRST LIGHT" and "LEGACY EDITION"',
      },
      sourceKey: 'demo:007-first-light-legacy',
      priority: 'high',
      confidence: 0.5,
      subject: {
        title: '007: First Light Legacy Edition (PS5)',
        url: 'https://example.com/listing/007-first-light-legacy',
        subtitle: 'Packaging variant review',
        source: 'demo catalog',
        metadata: {
          domain: 'collectibles',
          observedPrice: '$265.00',
        },
      },
      images: [
        { url: `${base}/demo/images/legacy-edition.png`, position: 1, source: 'demo' },
      ],
      media: [
        { url: `${base}/demo/images/legacy-edition.png`, type: 'image', label: 'Packaging photo', position: 1, source: 'demo' },
      ],
      analysisContext: {
        summary: 'The model thinks the outer packaging text identifies the Legacy Edition variant.',
        model: 'demo-gpt',
        provider: 'MediEval Demo',
        analysisStage: 'demo',
        warnings: ['Synthetic card for app smoke testing'],
      },
      evidence: [
        {
          source: 'image',
          detail: 'Outer box artwork includes FIRST LIGHT and LEGACY EDITION text.',
          confidence: 0.5,
          imagePositions: ['1'],
        },
      ],
    },
    {
      schemaVersion: '1.0',
      cardId: 'demo-item-charging-cable',
      cardType: 'binary_claim',
      question: 'Is this included item correctly identified?',
      claim: {
        template: 'component_title_or_label',
        path: 'analysis.components[1].title',
        value: 'Charging cable (USB-A to Nintendo handheld charging connector; exact model not shown)',
      },
      sourceKey: 'demo:new-3ds-xl-fire-emblem',
      priority: 'high',
      confidence: 0.63,
      subject: {
        title: 'New Nintendo 3DS XL Fire Emblem Fates Edition console bundle (128GB microSD, charging cable)',
        url: 'https://example.com/listing/new-3ds-xl-fire-emblem',
        subtitle: 'Bundle component extraction',
        source: 'demo catalog',
        metadata: {
          domain: 'bundle review',
          observedPrice: '$560.00',
        },
      },
      images: [
        { url: `${base}/demo/images/handheld-bundle.png`, position: 1, source: 'demo' },
      ],
      media: [
        { url: `${base}/demo/images/handheld-bundle.png`, type: 'image', label: 'Bundle photo', position: 1, source: 'demo' },
      ],
      analysisContext: {
        summary: 'The model found a console bundle and extracted the visible cable as a component.',
        model: 'demo-gpt',
        provider: 'MediEval Demo',
        analysisStage: 'demo',
        warnings: [],
      },
      evidence: [
        {
          source: 'image',
          detail: 'A black cable appears beside the handheld console.',
          confidence: 0.63,
          imagePositions: ['1'],
        },
      ],
    },
    {
      schemaVersion: '1.0',
      cardId: 'demo-game-title-mario',
      cardType: 'binary_claim',
      question: 'Is this game title correct?',
      claim: {
        template: 'component_game_title',
        path: 'analysis.components[0].gameTitle',
        value: 'Super Mario World',
      },
      sourceKey: 'demo:snes-cartridge',
      priority: 'medium',
      confidence: 0.78,
      subject: {
        title: 'SNES cartridge lot with Super Mario World',
        url: 'https://example.com/listing/snes-mario-world',
        subtitle: 'Title extraction review',
        source: 'demo catalog',
        metadata: {
          domain: 'catalog enrichment',
          observedPrice: '$44.00',
        },
      },
      images: [
        { url: `${base}/demo/images/mario-cart.png`, position: 1, source: 'demo' },
      ],
      media: [
        { url: `${base}/demo/images/mario-cart.png`, type: 'image', label: 'Cartridge photo', position: 1, source: 'demo' },
      ],
      analysisContext: {
        summary: 'The cartridge label and listing text both suggest Super Mario World.',
        model: 'demo-gpt',
        provider: 'MediEval Demo',
        analysisStage: 'demo',
        warnings: [],
      },
      evidence: [
        {
          source: 'title',
          detail: 'Listing title includes Super Mario World.',
          confidence: 0.78,
          imagePositions: ['1'],
        },
      ],
    },
    {
      schemaVersion: '1.0',
      cardId: 'demo-animal-plush',
      cardType: 'binary_claim',
      question: 'Does this listing include an animal?',
      claim: {
        template: 'listing_contains_animal',
        path: 'analysis.flags.containsAnimal',
        value: 'true',
      },
      sourceKey: 'demo:zelda-plush-bundle',
      priority: 'medium',
      confidence: 0.34,
      listing: {
        title: 'Nintendo plush and game display bundle',
        url: 'https://example.com/listing/plush-bundle',
        price: '$38.00',
        marketplace: 'demo:eBay',
      },
      images: [
        { url: `${base}/demo/images/plush-bundle.png`, position: 1, source: 'demo' },
      ],
      media: [
        { url: `${base}/demo/images/plush-bundle.png`, type: 'image', label: 'Legacy listing image', position: 1, source: 'demo' },
      ],
      analysisContext: {
        summary: 'The model is uncertain whether the plush character should count as an animal.',
        model: 'demo-gpt',
        provider: 'MediEval Demo',
        analysisStage: 'demo',
        warnings: ['Low-confidence semantic flag'],
      },
      evidence: [
        {
          source: 'image',
          detail: 'A small plush figure is visible near the games.',
          confidence: 0.34,
          imagePositions: ['1'],
        },
      ],
    },
  ];
}

function reviewedCardIdsFor(reviewer) {
  return new Set(results
    .filter((result) => normalizeReviewer(result.reviewer) === normalizeReviewer(reviewer))
    .map((result) => result.cardId));
}

function evalResultEventId(payload) {
  const explicit = String(payload?.eventId ?? '').trim();
  if (explicit) return explicit;
  const reviewer = normalizeReviewer(payload?.reviewer);
  const cardId = String(payload?.cardId ?? '').trim();
  const clientGeneratedAt = String(payload?.clientGeneratedAt ?? '').trim();
  if (!cardId || !clientGeneratedAt) return '';
  return `${reviewer}:${cardId}:${clientGeneratedAt}`;
}

function deck(request, url) {
  const reviewer = normalizeReviewer(url.searchParams.get('reviewer'));
  const page = Math.max(1, Number(url.searchParams.get('page') ?? 1) || 1);
  const pageSize = Math.max(1, Math.min(50, Number(url.searchParams.get('limit') ?? url.searchParams.get('pageSize') ?? 20) || 20));
  const reviewed = reviewedCardIdsFor(reviewer);
  const pending = baseCards(request).filter((card) => !reviewed.has(card.cardId));
  const start = (page - 1) * pageSize;
  return {
    ok: true,
    cards: pending.slice(start, start + pageSize),
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(pending.length / pageSize)),
    total: pending.length,
    unfilteredTotal: baseCards(request).length,
    reviewer,
    reviewState: 'pending',
  };
}

function summary(request, url) {
  const reviewer = normalizeReviewer(url.searchParams.get('reviewer'));
  const cards = baseCards(request);
  const reviewed = reviewedCardIdsFor(reviewer);
  const byPriority = {};
  for (const card of cards) {
    byPriority[card.priority] ??= { total: 0, reviewed: 0, pending: 0 };
    byPriority[card.priority].total += 1;
    if (reviewed.has(card.cardId)) byPriority[card.priority].reviewed += 1;
    else byPriority[card.priority].pending += 1;
  }
  const reviewerResults = results.filter((result) => normalizeReviewer(result.reviewer) === reviewer);
  return {
    ok: true,
    summary: {
      runId,
      reviewer,
      totalCards: cards.length,
      reviewedCards: reviewed.size,
      pendingCards: Math.max(0, cards.length - reviewed.size),
      totalResultRows: results.length,
      lastReviewedAt: reviewerResults.at(-1)?.clientGeneratedAt ?? null,
      byPriority,
    },
  };
}

function scoreVerdict(payload) {
  const answer = normalizeAnswer(payload.answer);
  const correctionPresent = answer === 'no' && hasCorrection(payload.correction);
  const base = {
    yes: { xp: 5, gold: 1 },
    no: { xp: 5, gold: 1 },
    unsure: { xp: 5, gold: 1 },
    bad_question: { xp: 5, gold: 1 },
    skip: { xp: 0, gold: 0 },
  }[answer];
  return {
    xp: base.xp,
    gold: base.gold,
  };
}

function hasCorrection(correction) {
  if (!correction || typeof correction !== 'object') return false;
  if (String(correction.correctAnswer ?? '').trim()) return true;
  return Array.isArray(correction.reasonTags)
    && correction.reasonTags.some((tag) => String(tag ?? '').trim());
}

function priorityBonus(priority) {
  switch (String(priority ?? '').trim().toLowerCase()) {
  case 'high': return 4;
  case 'medium': return 2;
  default: return 0;
  }
}

function confidenceBonus(confidence) {
  if (confidence === null || confidence === undefined || confidence === '') return 0;
  const value = Number(confidence);
  if (!Number.isFinite(value)) return 0;
  if (value < 0.35) return 5;
  if (value < 0.65) return 2;
  return 0;
}

function blankProfile(reviewer) {
  return {
    reviewer,
    reviewerKey: reviewerKey(reviewer),
    rank: 'Page',
    rankProgress: 0,
    xp: 0,
    gold: 0,
    streakDays: 0,
    totalVerdicts: 0,
    correctionCount: 0,
    answerCounts: {
      yes: 0,
      no: 0,
      unsure: 0,
      badQuestion: 0,
      skip: 0,
    },
    today: {
      verdicts: 0,
      corrections: 0,
      lowConfidence: 0,
    },
    dailyQuests: [],
    updatedAt: null,
  };
}

function hydrateProfile(profile) {
  const rankThresholds = [
    ['Page', 0],
    ['Squire', 250],
    ['Knight', 1000],
    ['Guild Scribe', 3000],
  ];
  let rankIndex = 0;
  for (let index = 0; index < rankThresholds.length; index += 1) {
    if (profile.xp >= rankThresholds[index][1]) rankIndex = index;
  }
  const [, currentMin] = rankThresholds[rankIndex];
  const [, nextMin] = rankThresholds[Math.min(rankIndex + 1, rankThresholds.length - 1)];
  const span = Math.max(1, nextMin - currentMin);
  const rankProgress = rankIndex === rankThresholds.length - 1 ? 1 : Math.max(0, Math.min(1, (profile.xp - currentMin) / span));
  return {
    ...profile,
    rank: rankThresholds[rankIndex][0],
    rankProgress,
    dailyQuests: [
      {
        key: 'torch_lit',
        title: 'Keep the torch lit',
        detail: `Judge ${isShowcase ? 1 : 4} demo claims`,
        progress: Math.min(profile.today.verdicts, isShowcase ? 1 : 4),
        target: isShowcase ? 1 : 4,
        complete: profile.today.verdicts >= (isShowcase ? 1 : 4),
      },
      {
        key: 'careful_review',
        title: 'Review with care',
        detail: 'Review 2 claims; uncertainty is welcome',
        progress: Math.min(profile.today.verdicts, 2),
        target: 2,
        complete: profile.today.verdicts >= 2,
      },
      {
        key: 'fog_cleaver',
        title: 'Clear the fog',
        detail: 'Judge 2 low-confidence claims',
        progress: Math.min(profile.today.lowConfidence, 2),
        target: 2,
        complete: profile.today.lowConfidence >= 2,
      },
    ],
  };
}

function getProfile(reviewer) {
  const key = reviewerKey(reviewer);
  if (!profiles.has(key)) profiles.set(key, blankProfile(normalizeReviewer(reviewer)));
  return hydrateProfile(profiles.get(key));
}

function updateProfile(payload) {
  const reviewer = normalizeReviewer(payload.reviewer);
  const answer = normalizeAnswer(payload.answer);
  const key = reviewerKey(reviewer);
  const profile = profiles.get(key) ?? blankProfile(reviewer);
  const awarded = scoreVerdict(payload);
  profile.xp += awarded.xp;
  profile.gold += awarded.gold;
  profile.streakDays = Math.max(profile.streakDays, 1);
  profile.totalVerdicts += 1;
  const correctionPresent = answer === 'no' && hasCorrection(payload.correction);
  if (correctionPresent) profile.correctionCount += 1;
  const answerKey = answer === 'bad_question' ? 'badQuestion' : answer;
  if (Object.hasOwn(profile.answerCounts, answerKey)) profile.answerCounts[answerKey] += 1;
  profile.today.verdicts += 1;
  if (correctionPresent) profile.today.corrections += 1;
  if (Number(payload.confidence ?? 1) < 0.65) profile.today.lowConfidence += 1;
  profile.updatedAt = new Date().toISOString();
  profiles.set(key, profile);
  return { awarded, profile: hydrateProfile(profile) };
}

function leaderboard() {
  const entries = [...profiles.values()]
    .map(hydrateProfile)
    .sort((left, right) => right.xp - left.xp || right.gold - left.gold || left.reviewer.localeCompare(right.reviewer));
  if (entries.length === 0) entries.push(getProfile('Sir Wrongalot'));
  return entries.map((entry, index) => ({ place: index + 1, ...entry }));
}

function crc32(buffer) {
  let crc = -1;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ -1) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function demoPng(name) {
  const width = 640;
  const height = 420;
  const rows = [];
  const palettes = {
    'legacy-edition': [[22, 20, 22], [216, 179, 93], [70, 70, 76], [245, 242, 230]],
    'handheld-bundle': [[32, 34, 38], [239, 239, 232], [34, 75, 130], [20, 20, 20]],
    'mario-cart': [[220, 34, 42], [248, 218, 74], [40, 112, 53], [245, 245, 238]],
    'plush-bundle': [[44, 88, 112], [229, 184, 90], [112, 68, 128], [244, 230, 204]],
  };
  const palette = palettes[name] ?? palettes['legacy-edition'];
  for (let y = 0; y < height; y += 1) {
    const row = Buffer.alloc(1 + width * 3);
    row[0] = 0;
    for (let x = 0; x < width; x += 1) {
      const block = Math.floor(x / 24) + Math.floor(y / 24);
      let color = palette[(block + (x > 420 ? 1 : 0)) % palette.length];
      if (name === 'handheld-bundle' && x > 95 && x < 390 && y > 85 && y < 270) color = palette[1];
      if (name === 'handheld-bundle' && x > 425 && x < 500 && y > 165 && y < 330) color = palette[3];
      if (name === 'legacy-edition' && x > 95 && x < 385 && y > 75 && y < 270) color = palette[2];
      if (name === 'legacy-edition' && x > 430 && x < 555 && y > 85 && y < 280) color = palette[1];
      if (name === 'mario-cart' && x > 160 && x < 475 && y > 80 && y < 300) color = palette[3];
      if (name === 'mario-cart' && x > 210 && x < 430 && y > 130 && y < 235) color = palette[0];
      if (name === 'plush-bundle' && (x - 320) ** 2 + (y - 210) ** 2 < 95 ** 2) color = palette[1];
      const offset = 1 + x * 3;
      row[offset] = color[0];
      row[offset + 1] = color[1];
      row[offset + 2] = color[2];
    }
    rows.push(row);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(Buffer.concat(rows))),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

async function handle(request, response) {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? `${host}:${port}`}`);
  if (request.method === 'OPTIONS') return json(response, 200, { ok: true });
  if (url.pathname === '/health' || url.pathname === '/ready') {
    return json(response, 200, { ok: true, service: 'medieval-demo-server', database: 'in-memory' });
  }
  if (url.pathname === '/demo/showcase/curiosity.jpg' && request.method === 'GET' && showcasePhoto) {
    response.writeHead(200, { 'content-type': 'image/jpeg', 'content-length': showcasePhoto.length, 'cache-control': 'no-store', 'access-control-allow-origin': '*' });
    return response.end(showcasePhoto);
  }
  if (url.pathname.startsWith('/demo/images/') && request.method === 'GET') {
    if (isShowcase) return json(response, 404, { ok: false, error: 'Smoke-test images are not available in the showcase profile.' });
    const name = url.pathname.split('/').pop()?.replace(/\.png$/, '') ?? 'legacy-edition';
    const image = demoPng(name);
    response.writeHead(200, {
      'content-type': 'image/png',
      'content-length': image.length,
      'cache-control': 'no-store',
      'access-control-allow-origin': '*',
    });
    return response.end(image);
  }
  if (url.pathname === '/') {
    if (publicReview) return text(response, 200, 'MediEval review environment. Synthetic sample data only.');
    const urls = localDemoURLs();
    return text(response, 200, [
      'MediEval demo server is running.',
      `Token: ${token}`,
      'Use the same URL for Dashboard URL and Guild backend URL.',
      '',
      ...urls.map((candidate) => `- ${candidate}`),
    ].join('\n'));
  }
  if (url.pathname.startsWith('/api/') && !ensureAuthorized(request, response)) return;

  if (url.pathname === '/api/mobile/eval/cards' && request.method === 'GET') {
    return json(response, 200, deck(request, url));
  }
  if (url.pathname === '/api/mobile/eval/summary' && request.method === 'GET') {
    return json(response, 200, summary(request, url));
  }
  if (url.pathname === '/api/mobile/eval/results' && request.method === 'POST') {
    const payload = await readBody(request);
    if (!payload.cardId || !answerKeys.includes(payload.answer)) {
      return json(response, 400, { ok: false, error: 'cardId and canonical answer are required.' });
    }
    const eventId = evalResultEventId(payload);
    const existing = eventId ? results.find((result) => evalResultEventId(result) === eventId) : null;
    if (existing) {
      return json(response, 200, { ok: true, stored: true, duplicate: true, result: existing, totalResultRows: results.length });
    }
    const result = { ...payload, eventId, duplicate: false, receivedAt: new Date().toISOString() };
    results.push(result);
    return json(response, 200, { ok: true, stored: true, duplicate: false, result, totalResultRows: results.length });
  }
  if (url.pathname === '/api/game/profile' && request.method === 'GET') {
    return json(response, 200, { ok: true, profile: getProfile(url.searchParams.get('reviewer')) });
  }
  if (url.pathname === '/api/game/leaderboard' && request.method === 'GET') {
    return json(response, 200, { ok: true, leaderboard: leaderboard().slice(0, Number(url.searchParams.get('limit') ?? 10) || 10) });
  }
  if (url.pathname === '/api/game/verdicts' && request.method === 'POST') {
    const payload = await readBody(request);
    if (!payload.cardId || !answerKeys.includes(payload.answer)) {
      return json(response, 400, { ok: false, error: 'cardId and canonical answer are required.' });
    }
    const eventId = String(payload.eventId ?? `${payload.reviewer}:${payload.cardId}`).trim();
    if (gameEvents.has(eventId)) {
      return json(response, 200, {
        ok: true,
        duplicate: true,
        eventId,
        awarded: { xp: 0, gold: 0 },
        profile: getProfile(payload.reviewer),
      });
    }
    const { awarded, profile } = updateProfile({ ...payload, eventId });
    gameEvents.set(eventId, { ...payload, eventId, awarded });
    return json(response, 200, { ok: true, duplicate: false, eventId, awarded, profile });
  }
  return json(response, 404, { ok: false, error: `No demo route for ${request.method} ${url.pathname}` });
}

const server = http.createServer((request, response) => {
  handle(request, response).catch((error) => {
    console.error(error);
    json(response, 500, { ok: false, error: error.message });
  });
});

server.listen(port, host, () => {
  console.log('MediEval demo server ready.');
  if (!publicReview) console.log(`Token: ${token}`);
  for (const url of localDemoURLs()) {
    console.log(`URL: ${url}`);
  }
  if (host === '127.0.0.1' || host === 'localhost') {
    console.log('For a physical iPhone, run: npm run demo:lan');
  }
});
