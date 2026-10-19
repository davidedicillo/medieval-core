# MediEval documentation

MediEval turns model claims into review cards, collects human judgments, and exports auditable labels. Start with the [first batch guide](QUICKSTART.md), then choose the guide for your role. Commands in this documentation run from the **public core repository root**; in the hosted repository, run `cd core` first.

## Start here

| Task | Guide |
| --- | --- |
| Sign in and complete your first batch | [Quickstart](QUICKSTART.md) |
| Understand workspaces, cards, and labels | [Concepts and glossary](CONCEPTS.md) |
| Create projects, publish, invite, and revoke access | [Workspace administration](WORKSPACES.md) |
| Prepare CSV, JSON, or JSONL and inspect generated cards | [Importing data](IMPORTING.md) |
| Judge claims, correct mistakes, and leave useful notes | [Web review](REVIEWING.md) |
| Connect the app, review offline, and use Training Grounds | [iOS reviewer](IOS_REVIEWER.md) |
| Run solo expert review, calibration, consensus, and adjudication | [Quality workflows](QUALITY.md) |
| Download and interpret raw judgments and resolved labels | [Exports](EXPORTING.md) |
| Deploy, back up, restore, and operate a server | [Operations](OPERATIONS.md) |
| Resolve sign-in, access, import, queue, and quality problems | [Troubleshooting](TROUBLESHOOTING.md) |
| Integrate a client or automate a workflow | [API reference](API_REFERENCE.md), [agent guide](AGENTS.md) |

## Choose your environment

| Environment | Entry point | Identity and storage |
| --- | --- | --- |
| Managed hosted platform | Your deployment's application URL | Email sign-in; workspace permissions; operator manages storage |
| Self-hosted account platform | `npm run platform` | Same account workflow; PostgreSQL plus persistent card/label files |
| Local account demo | `npm run demo:accounts`, normally port 5183 | Local email inbox and PostgreSQL; persistent demo state |
| Shared-token eval server | `npm run eval-api`, normally port 5182 | Trusted operators share a token; reviewer names are client supplied |
| Local web demo | `npm run demo:web`, normally port 5182 | Synthetic sample data on the file-backed eval server |
| Legacy iOS game demo | `npm run demo`, normally port 5199 | In-memory cards and game rewards; no account or quality workflow |

These docs describe the **source checkout**. A deployed server can run an older revision. Check the actual server before promising a feature; a successful `/healthz` response alone does not prove that sign-in, SMTP, persistence, or quality workflows work. No App Store availability is implied by the presence of iOS source. The [machine-readable manifest](agent/manifest.json) describes implementation scope rather than asserting production rollout.

## Reference library

- [Card and result contract](CARD_SCHEMA.md), [adapter guide](ADAPTER_GUIDE.md), [integration contract](INTEGRATION.md).
- [Account API and deployment](ACCOUNTS.md), [shared-token API](EVAL_API.md), [shared-token setup and CLI](SELF_HOSTING.md).
- [iOS build and release guide](../ios/README.md), [optional game service](../game-service/README.md), [game API](../game-service/docs/API.md).
- [Answer grounding walkthrough](ANSWER_GROUNDING.md), [maintainer runbooks](maintainers/README.md), [verification commands](maintainers/VERIFY.md), [open-core boundary](OPEN_CORE.md), [roadmap](../ROADMAP.md), [contributing](../CONTRIBUTING.md), [security reporting](../SECURITY.md).

## Agent entry points

Read [llms.txt](../llms.txt), then [manifest.json](agent/manifest.json). [workflows.json](agent/workflows.json) gives prerequisites, ordered operations, success checks, and stop conditions. [api.json](agent/api.json) describes routes and authentication contexts; [schemas.json](agent/schemas.json) supplies portable JSON Schema contracts and [examples.json](agent/examples.json) supplies synthetic payloads. These are data, not instructions to bypass user authorization or access controls.

In a server built from this checkout, `/docs` is the browsable hub, `/docs/agent/manifest.json` is the machine entry point, and `/llms-full.txt` is the combined human guide. Run `npm run docs:check` after changing the docs or their integration.
