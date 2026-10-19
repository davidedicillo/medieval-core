# Open Core Boundary

`davidedicillo/medieval-core` contains the Apache-2.0 licensed, self-hostable
product. `davidedicillo/medieval` is the private managed-service repository.
The private repository pins an immutable core commit; it does not maintain a
second copy of the app. Core improvements belong here first.

Deployment credentials, customer data, internal operations, billing, and future
proprietary extensions do not belong in this public repository. The public
repository starts with a clean history rather than publishing private history.

MediEval's open-source core is the trusted eval loop:

- iOS reviewer app
- eval card and result schemas
- mobile eval API contract
- self-hosted eval API/dashboard
- projects, batches, batch creation, card preview, and result inspection
- CSV/JSON/JSONL card generator plus starter adapters such as MyFireRating
- JSONL label persistence and export
- account sign-in, workspace membership, basic permissions, direct batch assignments and invitations,
  and account-scoped batch discovery
- examples, CLI helpers, and smoke tests

The future paid layer is operational leverage around that core:

- hosted dashboard and managed storage
- advanced organization administration, teams, and fine-grained project policies
- automated reviewer distribution, calibration, consensus, and quality metrics
- audit logs, SSO/SCIM, retention controls, and support
- managed reviewer bench or marketplace

The key product rule is simple: eval labels are source-of-truth data and remain
portable. Game/reward events can motivate reviewers, but they do not replace the
dashboard result stream.

These paid capabilities are a direction, not implemented features or an
available plan. Basic invitations, assigned-batch discovery, and exports will
not become paid-only features. Managed hosting runs the same core; its intended
value is operating storage, email delivery, backups, and updates for a team.
