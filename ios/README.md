# MediEval iOS

Native SwiftUI reviewer for binary evaluation cards. Swipe right for yes, left
for no, or choose unsure. Source evidence, corrections, notes, and offline
retries are part of the review flow.

For sign-in, batch discovery, offline review, and Training Grounds, read the
[iOS reviewer guide](../docs/IOS_REVIEWER.md). The [documentation hub](../docs/README.md)
covers the complete product; this file covers building and integrating the app.

## Build

Requires a Mac with full Xcode; command-line tools alone cannot build the app.
For a physical iPhone, configure code signing with an Apple development team.
There is no App Store or TestFlight release today.

From the repository root:

```bash
open ios/ListingEvalApp.xcodeproj
```

Select the shared `ListingEvalApp` scheme and run on a simulator or device.
The project retains its original internal name; the installed app is MediEval.

## Account Sign-In And My Batches

1. Start an account platform using [Accounts](../docs/ACCOUNTS.md).
2. In the app's **Sign In** screen, expand **Connection** and set **Platform URL**.
3. Enter your email, request a code, and sign in. The local account demo provides
   a development inbox; a deployed server must deliver real email.
4. Choose an available batch from **My Batches**. An owner/admin can publish a
   batch and invite reviewers through the web platform.

An invitation's **Open in App** link can set the server for you. The app asks
before changing servers. See [iOS connection details](../docs/ACCOUNTS.md#ios-connection)
for invitation links, Keychain sessions, and signed Universal Links.

## Standalone API Connection

For a shared-token backend, expand **Connection** and open **Advanced
Connection**. Enter the eval server URL, reviewer name, and token. Select the
project/batch supported by that backend. Leave the optional rewards service
blank unless you run it separately.

Use [Self-Hosting](../docs/SELF_HOSTING.md) to start the standalone dashboard/API
or local web demo. A physical iPhone cannot reach your Mac through
`127.0.0.1`; use the Mac's LAN address on a trusted local network or an HTTPS
deployment. Keep tokenless demos off public networks.

For the in-memory iOS Simulator test backend, run `npm run demo` from the repo
root, then choose **Use Local Demo** in Advanced Connection. `npm run demo:lan`
binds that demo for a physical phone on the same trusted Wi-Fi network. This
test backend resets when stopped; it is not a persistent deployment.

## Results, Retries, And Rewards

The app displays Aye / Nay / Hmm while results use `yes` / `no` / `unsure`.
Bad-question and skip decisions also have canonical API values. See the
[card/result schema](../docs/CARD_SCHEMA.md).

Transient network/server failures queue results locally for retry. Permanent
rejections keep the card visible with an error. Event IDs let the backend
deduplicate retries; account queues are scoped to the server, user, and batch.

The optional [game service](../game-service/README.md) adds XP, gold, streaks,
quests, and a leaderboard. Reward events are separate from accepted eval
results. Reward totals are not accuracy or reviewer-agreement measurements.

## Training Grounds And Quality

**Training Grounds & Consistency** opens optional practice, qualification,
reference checks, and personal consistency quests. Solo experts can review
directly without a calibration set. A batch administrator can require qualification
for additional reviewers. The sheet shows the rubric, qualification progress,
reference agreement, consistency, and server-issued Quality XP. These quests
have separate IDs, do not become production labels, and do not earn guild rewards.
Configure the rubric, references, and adjudication in the web **Quality & Training**
page. See [quality workflows](../docs/QUALITY.md) for batch scope and limitations.

To try these workflows locally, run `npm run demo:web` and connect the app to
its printed eval URL. The older in-memory `npm run demo` backend does not expose
quality endpoints.

Production participation rewards are 5 XP and 1 gold for `yes`, `no`, `unsure`,
or `bad_question`; skipping awards neither. A correction, priority, or model
confidence does not increase rewards. Existing guild balances are preserved.

## Contributors

Run checks from the repository root after `npm ci`:

```bash
npm run verify:xcode
npm run preflight
```

The [maintainer verification guide](../docs/maintainers/VERIFY.md) covers
simulator builds, local and live integration tests, and offline retry checks.
[Handoff](../docs/maintainers/HANDOFF.md) covers offline packaging.
