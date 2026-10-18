# Accounts, Invitations, And Batch Discovery

The account platform runs with `npm run platform`. It uses Better Auth email
codes for both browser cookies and signed mobile bearer sessions. PostgreSQL
stores accounts, sessions, workspaces, membership, projects, batches, assignments,
and invitations. Review cards and labels remain in workspace-specific JSONL
directories. This service has no shared-token fallback.

## Local Demo

```bash
npm install
npm run demo:accounts
```

The demo normally opens at `http://127.0.0.1:5183`. It needs local PostgreSQL
binaries (`pg_config`, `initdb`, and `pg_ctl`) or an explicit `DATABASE_URL`.
Without a database URL it starts its own socket-only PostgreSQL cluster under
`.runtime/platform-demo/postgres`; it does not change an existing database
server. Sign-in codes and invitations appear in `/dev/inbox`. Local delivery is
restricted to a loopback URL, loopback listener, and loopback inbox requests.
No real email is sent. Demo accounts, reviews, and sessions survive restarts.

Any sample email address works with the local inbox. For example, sign in as
`owner@medieval.test`, create a workspace and project, upload
`examples/myfire-rating.csv`, create a draft, publish it, and invite
`reviewer@medieval.test`. Sign in as the invited address in a different browser
session or the app to accept the invitation. These are suggested development
addresses, not pre-provisioned credentials.

Set `MEDIEVAL_PLATFORM_DEMO_PORT` to change the demo HTTP port. The separate
`npm run demo:web` and `npm run demo` commands retain their original local flows.

## Deployment

Configure these environment variables before `npm run platform`:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Dedicated PostgreSQL database for the account platform |
| `BETTER_AUTH_SECRET` | Persistent random secret, at least 32 characters |
| `MEDIEVAL_PLATFORM_URL` | Public HTTPS origin, including a nonstandard port if needed |
| `SMTP_URL` | Nodemailer SMTP connection URL |
| `MAIL_FROM` | Verified sender address |
| `HOST` | Bind address, normally `0.0.0.0` in a container |
| `PORT` | HTTP port, default `5183` |
| `MEDIEVAL_EVAL_DATA_DIR` | Persistent label directory, default `.runtime/platform` |
| `MEDIEVAL_APP_ID` | Optional Apple Team ID plus bundle ID for universal links |

The server applies Better Auth migrations and the idempotent platform schema
on startup. Back up both PostgreSQL and the label directory. Existing legacy
projects are not automatically assigned to an account or workspace. Import
their cards into a new workspace; old reviewer display names are not evidence
of identity and are never automatically linked to new accounts.

`services/platform/Dockerfile` builds from the repository root.
`services/platform/compose.yml` includes PostgreSQL and persistent label storage.
Set `POSTGRES_PASSWORD` as a URL-safe random string for that Compose example,
then use `docker compose -f services/platform/compose.yml up --build -d` behind
your HTTPS reverse proxy. This deployment uses SMTP and disables the development
inbox. Auth rate limiting uses the immediate peer socket IP; behind
a proxy this deliberately shares a limit rather than trusting client-supplied
forwarding headers.

## iOS Connection

New installations open Sign In and My Batches. Debug builds default to the local
account demo if no platform URL is configured. For a hosted build set the
`MEDIEVAL_PLATFORM_URL` Xcode build setting to your public platform origin.
Self-hosted invitations include an **Open in App** link that sets the server
once, with confirmation before switching to a different server. The server
origin scopes the session token in Keychain; tokens are never saved in
UserDefaults. Signing out revokes the server session and removes its token.

The `medieval://join?server=...&token=...` URL scheme works without domain
association. For automatic HTTPS Universal Links, enable Associated Domains for
your Apple app, set `MEDIEVAL_PLATFORM_HOST`, and use
`ios/ListingEvalApp/Platform.entitlements.example` as the signed target's
entitlements. Set `MEDIEVAL_APP_ID` on the server to the corresponding
`TEAM_ID.BUNDLE_ID`; the platform serves the AASA file at
`/.well-known/apple-app-site-association`. The app already handles HTTPS
invitation links and prompts before changing servers. Domain association and
signed-device behavior must be verified with the deployment's Apple team.

Advanced Connection retains shared-token integrations and the iOS local demo.
Queued account reviews include their server, user, project, workspace, and
batch. A queue flush only sends reviews for the current scope; the API client
also rejects mismatched account payloads. Older unscoped reviews stay in the
legacy queue and are never submitted through an account session.

## Permissions

- Owners create workspaces, projects, drafts, and invitations. Administrators
  manage that workspace but cannot promote reviewers to administrator or remove
  owners/other administrators.
- Workspace reviewers see published batches whose audience is **Workspace
  members**, plus batches assigned directly to them.
- A batch invitation creates guest membership and a direct assignment. Guests
  cannot discover other workspace batches. Joining the wider workspace requires
  a separate workspace invitation.
- Draft, paused, and archived batches do not appear in reviewer discovery and
  reject reviews. Administrators can inspect and export their historical data.
- Review identity comes from the authenticated session. Reviewer names, user
  IDs, and workspace IDs supplied in a submitted body cannot change identity.
- Reviewers export only their own labels. Workspace administrators can inspect
  and export the full batch. Access is checked on every list, card, submission,
  result inspection, and export request.
- Invitations expire after seven days, are bound to a verified email, and store
  only a token hash. Administrators can revoke pending invitations, remove
  direct batch access, or remove workspace membership. Removing a direct
  assignment does not remove access independently granted by workspace-wide
  membership; change the audience or workspace membership for that case.

## API

| Endpoint | Purpose |
| --- | --- |
| `POST /api/auth/email-otp/send-verification-otp` | Send a sign-in code |
| `POST /api/auth/sign-in/email-otp` | Verify code; create/sign into account |
| `POST /api/auth/sign-out` | Revoke session |
| `GET /api/me` | Current identity and pending invitations |
| `GET /api/me/batches` | Published batches visible to the current user, with their progress |
| `GET /api/platform/state` | Workspace and management views, filtered by access |
| `POST /api/platform/workspaces` | Create a workspace |
| `POST /api/platform/projects` | Create a project in a managed workspace |
| `POST /api/platform/preview` | Generate a preview before upload |
| `POST /api/platform/batches` | Import a draft batch |
| `GET/POST /api/platform/batches/:id` | Inspect or change publication/audience |
| `POST /api/platform/invitations` | Invite to a workspace or batch |
| `POST /api/invitations/accept` | Accept as the email-verified recipient |
| `POST /api/platform/invitations/:id/revoke` | Revoke a pending invitation |
| `POST /api/platform/batches/:id/access` | Remove direct batch access |
| `GET /api/platform/workspaces/:id/members` | Inspect membership |
| `POST /api/platform/workspaces/:id/members/:userId` | Remove membership |

The existing mobile cards, summary, results, and export endpoints work on the
platform with `batchId` (or legacy `runId`) plus optional matching `projectId`
and `workspaceId`. Authentication determines the reviewer. Mobile clients use
the signed `set-auth-token` response header as their bearer token. Browser
clients use HttpOnly session cookies and same-origin writes.

Run `npm run platform:smoke` for a real, isolated PostgreSQL test covering
authentication, invitations, publishing, roles, isolation, identities, exports,
CSRF checks, and revocation. `npm run preflight` also exercises Swift contracts,
settings, and account-scoped offline queue behavior when Swift is available.
