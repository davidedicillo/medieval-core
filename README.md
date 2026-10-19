# MediEval Core

Review model outputs on your iPhone with a swipe, or in the browser. Import a
batch of answers and source evidence, collect decisions, corrections, and notes,
then export labels as JSONL or CSV.

MediEval currently supports **binary-claim review**: yes, no, unsure,
bad question, or skip. It does not support rating scales, pairwise ranking,
multi-label tasks, or span annotation. Rewards are optional, not quality scores.

[Try the browser sample](https://medieval.dev/#demo) without an account.
The native iOS app must currently be built from source; there is no App Store or
TestFlight release. The hosted account platform is at
[app.medieval.dev](https://app.medieval.dev); access uses email-code sign-in.
The self-hosted core is usable independently of the managed service.

Start with the [product documentation](docs/README.md) for first-use, reviewer,
administrator, quality, export, and operations guides. Agents can begin with
[llms.txt](llms.txt) and the [structured manifest](docs/agent/manifest.json).
Both servers expose the searchable documentation at `/docs`.

## Try It Locally

Requires Node.js 22 or later. No database or email provider is needed for the
web demo.

```bash
git clone https://github.com/davidedicillo/medieval-core.git
cd medieval-core
npm ci
npm run demo:web
```

Open the URL printed in the terminal. The dashboard includes a **Review Cards**
link. To try your own import, upload [answer-grounding.csv](examples/answer-grounding.csv)
in **Create Batch**, choose the **Generic** adapter, preview, then import.
These three synthetic records match the website sample; they are not a model
benchmark. See the [input-to-export walkthrough](docs/ANSWER_GROUNDING.md).

The demo stores data under `.runtime/web-demo`; restarting preserves it.
It binds to loopback without a token. Do not expose that demo to the internet.
Full setup, data paths, and device connection instructions live in
[Self-Hosting](docs/SELF_HOSTING.md).

## Choose A Setup

| Need | Command | Details |
| --- | --- | --- |
| Dashboard and browser reviewer, with sample data | `npm run demo:web` | No external services; persistent local demo data |
| Empty standalone dashboard/API | `npm run eval-api` | Shared-token access; JSONL label storage |
| Local accounts and assigned batches | `npm run demo:accounts` | PostgreSQL required; development email inbox |
| Deployed multi-user platform | `npm run platform` | PostgreSQL, SMTP, HTTPS, and deployment configuration |
| iOS Simulator demo, with simulated rewards | `npm run demo` | In-memory test backend; resets when stopped |

For accounts, workspace roles, invitations, and production deployment, use
[Accounts](docs/ACCOUNTS.md). Basic membership and direct batch invitations are
part of the open core, not paid-only features.

## iOS Reviewer

Requires a Mac with full Xcode. Open `ios/ListingEvalApp.xcodeproj`; the installed
app is named MediEval. A physical iPhone requires code signing with an Apple
development team.

With the account platform, sign in and choose from **My Batches**. Standalone
API integrations also support manual server URL/token configuration.
[iOS setup](ios/README.md) covers both paths and physical-device networking.

Swipe right for yes or left for no, or choose unsure. The app's Aye / Nay / Hmm
labels are presentation only; exported answers use the canonical API values.
Source evidence, corrections, notes, and offline retries are part of the review
workflow. Optional XP, gold, and leaderboards use a separate
[rewards service](game-service/README.md) and do not establish label quality.

## Integrate Your Data

- [Worked example](docs/ANSWER_GROUNDING.md): CSV input, a generated card, and a result.
- [Card and result schema](docs/CARD_SCHEMA.md): fields and canonical answer values.
- [Mobile integration](docs/INTEGRATION.md): backend routes and retry behavior.
- [Eval API](docs/EVAL_API.md): standalone dashboard and export endpoints.
- [Adapter guide](docs/ADAPTER_GUIDE.md): map your own source records into cards.

The generic importer is the starting point for answer grounding, extraction,
and classification checks. [MyFireRating](examples/myfire-rating.csv) is a
domain-specific adapter example, not a requirement or a validated risk model.

## Open Source And Hosting

The Apache-2.0 core includes the iOS app, web review, dashboard/API, accounts,
workspaces, permissions, invitations, schemas, and imports/exports.
Optional calibration, direct expert review, consensus, adjudication, and quality
provenance are included; exports alone do not establish label quality.
The private managed-service repository holds deployment configuration and
future commercial extensions. There are no paid plans today.
See [Open Core](docs/OPEN_CORE.md) for the boundary; labels remain exportable.

## Contribute Or Report A Problem

Maintained by [Davide Di Cillo](https://github.com/davidedicillo).
Use [GitHub issues](https://github.com/davidedicillo/medieval-core/issues) for
bugs and integration questions, and [private vulnerability reporting](SECURITY.md)
for security concerns. Setup confusion and examples from actual review workflows
are useful contributions.

[Contributing](CONTRIBUTING.md) covers checks and pull requests.
[Maintainer runbooks](docs/maintainers/README.md) cover simulator verification,
packaging, and handoff. They are not required to try the product.
