# Roadmap

Status as of 2026-10-18. This is an early release, not a promise of delivery dates.

## Available In The Core

- Binary-claim review in the iOS app and browser, with corrections and notes.
- Standalone dashboard/API, import preview, and JSONL/CSV exports.
- Accounts, workspaces, basic roles, direct assignments, invitations, and batch discovery.
- Card/result contracts and CLI import/export helpers.
- Offline retry and idempotent result submission in the iOS workflow.
- Optional reviewer rewards, separate from the label stream.

## Not Ready For General Hosted Use

- Hosted sign-in still needs verified email delivery.
- The native app must be built with Xcode; App Store/TestFlight distribution is not available.
- Managed-service backup and restore operations need verification.

## Next To Validate With Users

- A complete import, mobile review, and export session using a real team's data.
- Setup instructions that a new user can follow without maintainer assistance.
- Which review tasks benefit from a mobile queue, without assuming faster means better.

## Possible Commercial Work

See [Open Core](docs/OPEN_CORE.md) for the single source of truth on potential
paid capabilities. Basic accounts, invitations, assigned-batch discovery, and
portable exports remain in the core. No paid plan is available today.
