# Running and operating MediEval

Choose the service based on the required identity model. The account platform provides email sign-in, workspace authorization, invitations, and batch publication. The simpler eval server provides a file-backed review loop for trusted operators with one shared token. The optional game service is independent of both label storage and quality resolution.

## Local development

Install the Node dependencies from the core root with `npm install`. For account workflows, run `npm run demo:accounts`; the local inbox replaces real email and requires loopback-only access. It uses a private local PostgreSQL cluster unless `DATABASE_URL` is supplied. For a file-backed sample web review, run `npm run demo:web`. Do not point a development demo at production storage.

The legacy `npm run demo` is an in-memory iOS/game integration fixture. Its data resets on restart and it does not implement the account or quality APIs. [Verification](maintainers/VERIFY.md) lists smoke tests for each service.

## Self-hosted account platform

Use a dedicated PostgreSQL database and persistent filesystem volume. Configure `DATABASE_URL`, a stable `BETTER_AUTH_SECRET` of at least 32 characters, public HTTPS `MEDIEVAL_PLATFORM_URL`, `SMTP_URL`, verified `MAIL_FROM`, `HOST`, `PORT`, and `MEDIEVAL_EVAL_DATA_DIR`. Keep real secrets out of shell transcripts, Git, and documentation examples. See [account deployment](ACCOUNTS.md) for exact variables and universal links.

`services/platform/compose.yml` and `services/platform/Dockerfile` provide the container setup. From the core root:

```bash
docker compose -f services/platform/compose.yml up --build -d
```

Set the Compose variables first, terminate HTTPS at your reverse proxy, and keep the public origin consistent with the browser and native client. Startup applies Better Auth and platform schema migrations. Development inbox routes are unavailable in the SMTP deployment.

## Shared-token server

```bash
EVAL_MOBILE_TOKEN=dev-token npm run eval-api
```

The default listener is loopback port 5182, and the default data directory is `.runtime/medieval-eval`. Configure a real secret token, persistent `MEDIEVAL_EVAL_DATA_DIR`, network binding, and HTTPS reverse proxy for nonlocal use. An empty token disables token checks; do not confuse this local convenience with account authentication. Use [self-hosting](SELF_HOSTING.md) for the dashboard and CLI steps.

## Email and hosted operations

The hosted application and public marketing site are separate deployments. A working landing page does not prove the application is healthy. Application email delivery requires a verified sender/domain, provider credentials, and working DNS. Provider acceptance alone is not inbox delivery: check delivery activity and complete a sign-in test using an address you control.

For a SendGrid SMTP deployment, use its documented SMTP connection settings and an appropriately restricted API credential as the SMTP password. Configure the sender's domain authentication records using the values issued for that account; never copy another account's CNAME targets. Preserve existing inbound mail routing unless deliberately changing it. Provider administration and private infrastructure details belong in the hosted repository's deployment runbooks, not this public documentation.

Hosted maintenance procedures are kept in the private repository's `deployment/README.md` and dated `deployment/STATE.md`. Source implementation does not establish that a pinned hosted image includes a newer feature. Release the core change, update the reviewed deployment pin, and verify the actual deployed behavior through the operator's release process.

## Persistence, backups, and restore

PostgreSQL stores accounts, sessions, memberships, projects, publication state, invitations, and assignments. The filesystem stores cards, production `results.jsonl`, and batch `quality.json` containing settings history, references, assignments, attempts, and adjudications. Optional game-service balances live in its separate PostgreSQL database.

Back up PostgreSQL **and** the entire configured eval data directory as a matched snapshot. Quiesce writes for a consistent backup using your deployment's maintenance process; an unrelated database dump and later file copy may disagree. Protect reference answers and personal data as well as labels. Keep the persistent authentication secret securely with recovery configuration.

Restore into an isolated environment first: restore database and data directory from the same checkpoint, restore configuration, start the matching application version, then verify workspace access, card counts, raw exports, quality settings, and a representative result. Ensure restored sessions and email behavior match your intended recovery policy before reopening public access. A database-only restore is incomplete.

The file and quality stores assume a **single writer process** for a data directory. Quality writes are atomically replaced and serialized inside one process; this is not a distributed lock. Do not scale several application processes against the same files without adding a storage/locking design. Neither automatic retention/deletion nor a managed backup service is supplied by the core.

## Release verification

Run `npm run docs:check`, `npm run quality:smoke`, `npm run eval-api:smoke`, and `npm run platform:smoke` as applicable, then the [preflight](maintainers/VERIFY.md). Platform smoke requires PostgreSQL. Before release, verify `/healthz`, sign-in email, invitation acceptance, publish/review/export, persistence across restart, and any newly enabled feature. Check the serving revision rather than treating this guide as a deployment status page.
