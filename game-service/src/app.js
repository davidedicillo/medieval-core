import { URL } from 'node:url';
import { normalizeReviewer } from './scoring.js';

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
};

function sendJson(res, status, body, headers = {}) {
  res.writeHead(status, { ...JSON_HEADERS, ...headers });
  res.end(JSON.stringify(body));
}

function corsHeaders(origin = '*') {
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'authorization,content-type,x-medieval-game-token',
  };
}

function authError(req, token) {
  if (!token) return null;
  const authorization = String(req.headers.authorization ?? '');
  const bearer = authorization.match(/^Bearer\s+(.+)$/i)?.[1] ?? '';
  const headerToken = String(req.headers['x-medieval-game-token'] ?? '');
  if (bearer === token || headerToken === token) return null;
  return 'Invalid MediEval game token.';
}

function serviceMetadata(startedAt, version) {
  return {
    service: 'medieval-game-service',
    version,
    uptimeSeconds: Math.max(0, Math.round((Date.now() - startedAt.getTime()) / 1000)),
    checkedAt: new Date().toISOString(),
  };
}

async function readJsonBody(req, limitBytes = 1_000_000) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (Buffer.byteLength(body) > limitBytes) throw new Error('Request body is too large.');
  }
  if (!body.trim()) return {};
  try {
    return JSON.parse(body);
  } catch {
    throw new Error('Invalid JSON request body.');
  }
}

export function createGameApp({ store, token = '', corsOrigin = '*', version = process.env.MEDIEVAL_GAME_VERSION ?? process.env.npm_package_version ?? '0.1.0' }) {
  if (!store) throw new Error('createGameApp requires a store.');
  const cors = corsHeaders(corsOrigin);
  const startedAt = new Date();

  return async function handle(req, res) {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, cors);
      res.end();
      return;
    }

    const url = new URL(req.url ?? '/', 'http://localhost');

    try {
      if (url.pathname === '/health' && req.method === 'GET') {
        sendJson(res, 200, { ok: true, ...serviceMetadata(startedAt, version) }, cors);
        return;
      }

      if (url.pathname === '/ready' && req.method === 'GET') {
        const health = store.health ? await store.health() : { ok: true };
        sendJson(res, 200, { ok: true, ...serviceMetadata(startedAt, version), ...health }, cors);
        return;
      }

      if (url.pathname.startsWith('/api/game/')) {
        const error = authError(req, token);
        if (error) {
          sendJson(res, 401, { ok: false, error }, cors);
          return;
        }
      }

      if (url.pathname === '/api/game/profile' && req.method === 'GET') {
        const reviewer = normalizeReviewer(url.searchParams.get('reviewer'));
        sendJson(res, 200, { ok: true, profile: await store.getProfile(reviewer) }, cors);
        return;
      }

      if (url.pathname === '/api/game/verdicts' && req.method === 'POST') {
        const body = await readJsonBody(req);
        const result = await store.recordVerdict(body);
        sendJson(res, 200, { ok: true, ...result }, cors);
        return;
      }

      if (url.pathname === '/api/game/leaderboard' && req.method === 'GET') {
        const limit = url.searchParams.get('limit');
        sendJson(res, 200, { ok: true, leaderboard: await store.leaderboard(limit) }, cors);
        return;
      }

      sendJson(res, 404, { ok: false, error: 'Not found.' }, cors);
    } catch (error) {
      const status = /invalid|missing|too large|JSON/i.test(error.message) ? 400 : 500;
      sendJson(res, status, { ok: false, error: error.message }, cors);
    }
  };
}
