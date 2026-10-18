import assert from 'node:assert/strict';

const baseUrl = String(process.env.MEDIEVAL_GAME_BASE_URL ?? process.env.BASE_URL ?? '').replace(/\/+$/, '');
const token = String(process.env.MEDIEVAL_GAME_TOKEN ?? '').trim();
const reviewer = String(process.env.MEDIEVAL_GAME_REVIEWER ?? 'Davide').trim() || 'Davide';
const eventId = String(process.env.MEDIEVAL_GAME_SMOKE_EVENT_ID ?? `smoke-${Date.now()}`);
const expectAuth = !/^(0|false|no)$/i.test(String(process.env.MEDIEVAL_GAME_EXPECT_AUTH ?? 'true'));

function requireEnv() {
  if (!baseUrl) throw new Error('Set MEDIEVAL_GAME_BASE_URL to the deployed service URL.');
  if (!token) throw new Error('Set MEDIEVAL_GAME_TOKEN to the shared game-service token.');
}

function assertObject(value, label) {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object.`);
}

function assertString(value, label) {
  assert.equal(typeof value, 'string', `${label} must be a string.`);
}

function assertNumber(value, label) {
  assert.equal(typeof value, 'number', `${label} must be a number.`);
}

function validateQuest(quest, label) {
  assertObject(quest, label);
  assertString(quest.key, `${label}.key`);
  assertString(quest.title, `${label}.title`);
  assertString(quest.detail, `${label}.detail`);
  assertNumber(quest.progress, `${label}.progress`);
  assertNumber(quest.target, `${label}.target`);
  assert.equal(typeof quest.complete, 'boolean', `${label}.complete must be a boolean.`);
}

function validateProfile(profile, label = 'profile') {
  assertObject(profile, label);
  assertString(profile.reviewer, `${label}.reviewer`);
  assertString(profile.reviewerKey, `${label}.reviewerKey`);
  assertString(profile.rank, `${label}.rank`);
  assertNumber(profile.rankProgress, `${label}.rankProgress`);
  assertNumber(profile.xp, `${label}.xp`);
  assertNumber(profile.gold, `${label}.gold`);
  assertNumber(profile.streakDays, `${label}.streakDays`);
  assertNumber(profile.totalVerdicts, `${label}.totalVerdicts`);
  assertNumber(profile.correctionCount, `${label}.correctionCount`);
  assert.ok(profile.updatedAt === null || typeof profile.updatedAt === 'string', `${label}.updatedAt must be null or a string.`);

  assertObject(profile.answerCounts, `${label}.answerCounts`);
  for (const key of ['yes', 'no', 'unsure', 'badQuestion', 'skip']) {
    assertNumber(profile.answerCounts[key], `${label}.answerCounts.${key}`);
  }

  assertObject(profile.today, `${label}.today`);
  for (const key of ['verdicts', 'corrections', 'lowConfidence']) {
    assertNumber(profile.today[key], `${label}.today.${key}`);
  }

  assert.ok(Array.isArray(profile.dailyQuests), `${label}.dailyQuests must be an array.`);
  profile.dailyQuests.forEach((quest, index) => validateQuest(quest, `${label}.dailyQuests[${index}]`));
}

async function readJsonResponse(path, response) {
  const text = await response.text();
  let body = {};
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      throw new Error(`${path} returned non-JSON body: ${text.slice(0, 200)}`);
    }
  }
  return body;
}

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/json',
      ...(options.headers ?? {}),
    },
  });
  const body = await readJsonResponse(path, response);
  if (!response.ok) {
    throw new Error(`${path} returned ${response.status}: ${JSON.stringify(body)}`);
  }
  return body;
}

async function assertAuthIsEnforced() {
  if (!expectAuth) return false;

  const response = await fetch(`${baseUrl}/api/game/profile?reviewer=${encodeURIComponent(reviewer)}`, {
    headers: { accept: 'application/json' },
  });
  const body = await readJsonResponse('/api/game/profile unauthenticated check', response);
  assert.equal(response.status, 401, `unauthenticated profile request should return 401, got ${response.status}: ${JSON.stringify(body)}`);
  assert.equal(body.ok, false);
  return true;
}

async function assertCorsPreflight() {
  const response = await fetch(`${baseUrl}/api/game/verdicts`, {
    method: 'OPTIONS',
    headers: {
      origin: 'https://medieval.example',
      'access-control-request-method': 'POST',
      'access-control-request-headers': 'authorization,content-type',
    },
  });
  assert.equal(response.status, 204, `CORS preflight should return 204, got ${response.status}`);
  assert.ok(response.headers.get('access-control-allow-origin'), 'CORS preflight should include allow-origin.');
  assert.match(response.headers.get('access-control-allow-methods') ?? '', /POST/);
  assert.match(response.headers.get('access-control-allow-headers') ?? '', /authorization/);
  assert.match(response.headers.get('access-control-allow-headers') ?? '', /content-type/);
  return true;
}

async function main() {
  requireEnv();

  const ready = await request('/ready');
  assert.equal(ready.ok, true);
  assert.equal(ready.service, 'medieval-game-service');
  assertString(ready.version, 'ready.version');
  assertNumber(ready.uptimeSeconds, 'ready.uptimeSeconds');
  assertString(ready.checkedAt, 'ready.checkedAt');

  const authEnforced = await assertAuthIsEnforced();
  const corsPreflight = await assertCorsPreflight();

  const profile = await request(`/api/game/profile?reviewer=${encodeURIComponent(reviewer)}`);
  assert.equal(profile.ok, true);
  validateProfile(profile.profile);
  assert.equal(profile.profile.reviewer, reviewer);

  const verdictPayload = {
    eventId,
    reviewer,
    cardId: `${eventId}-card`,
    answer: 'yes',
    priority: 'high',
    confidence: 0.5,
    sourceKey: 'smoke',
    claimTemplate: 'smoke_test',
    durationMs: 1200,
    clientGeneratedAt: new Date().toISOString(),
  };

  const firstVerdict = await request('/api/game/verdicts', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(verdictPayload),
  });
  assert.equal(firstVerdict.ok, true);
  assert.equal(firstVerdict.duplicate, false);
  assert.ok(firstVerdict.awarded.xp > 0);
  validateProfile(firstVerdict.profile, 'firstVerdict.profile');

  const duplicateVerdict = await request('/api/game/verdicts', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(verdictPayload),
  });
  assert.equal(duplicateVerdict.ok, true);
  assert.equal(duplicateVerdict.duplicate, true);
  assert.equal(duplicateVerdict.awarded.xp, 0);
  validateProfile(duplicateVerdict.profile, 'duplicateVerdict.profile');

  const leaderboard = await request('/api/game/leaderboard?limit=10');
  assert.equal(leaderboard.ok, true);
  assert.ok(Array.isArray(leaderboard.leaderboard), 'leaderboard.leaderboard must be an array.');
  leaderboard.leaderboard.forEach((entry, index) => {
    assertNumber(entry.place, `leaderboard[${index}].place`);
    validateProfile(entry, `leaderboard[${index}]`);
  });
  assert.ok(leaderboard.leaderboard.some((entry) => entry.reviewer === reviewer));

  console.log(JSON.stringify({
    ok: true,
    service: baseUrl,
    reviewer,
    database: ready.database ?? 'unknown',
    authEnforced,
    corsPreflight,
    awardedXp: firstVerdict.awarded.xp,
    duplicateProtected: duplicateVerdict.duplicate,
    leaderboardSize: leaderboard.leaderboard.length,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
