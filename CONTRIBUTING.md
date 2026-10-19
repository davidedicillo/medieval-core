# Contributing

MediEval is being built OSS-first. The public core should stay generic, durable,
and easy to self-host.

## Development

```bash
npm run oss:check
./scripts/preflight.sh
```

Run commands from the repository root after `npm ci`. The detailed
[maintainer runbooks](docs/maintainers/README.md) cover simulator, service,
packaging, and deployment checks. Only run live write checks against data you
are authorized to change.

Use the self-hosted eval API while working on dashboard or API changes:

```bash
EVAL_MOBILE_TOKEN=dev-token npm run eval-api
```

## Contribution Rules

- Keep private/domain-specific adapters out of the public core.
- Preserve the mobile API contract in `docs/EVAL_API.md`.
- Treat `eventId` as the primary idempotency key for eval results.
- Keep eval labels durable and exportable as JSONL.
- Do not commit secrets, local runtime data, build products, or personal Xcode state.

## Pull Requests

Include the behavior change, verification command, and any schema/API impact.
For user-facing changes, update the relevant docs in `docs/`.
