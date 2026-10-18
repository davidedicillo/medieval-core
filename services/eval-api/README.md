# MediEval Eval API

Self-hosted dashboard and mobile API for durable human eval labels.

```bash
npm run eval-api
```

The server listens on `http://127.0.0.1:5182` by default and stores JSONL under
`.runtime/medieval-eval`.

Set `EVAL_MOBILE_TOKEN` or `MEDIEVAL_EVAL_API_TOKEN` to require bearer-token
auth. With no token, the server is open for local personal use.

## Routes

- `GET /` opens the self-hosted dashboard.
- `GET /api/mobile/eval/cards`
- `POST /api/mobile/eval/results`
- `GET /api/mobile/eval/summary`
- `POST /api/eval/batches`
- `POST /api/eval/cards/import`
- `GET /api/eval/results/export?format=jsonl|csv`

Eval labels are appended to `results.jsonl`. `eventId` is the idempotency key,
with reviewer/card/client timestamp as the fallback for older clients.
Legacy `runId` and `POST /api/eval/runs` are still accepted as aliases.
