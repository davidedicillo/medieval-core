# iOS reviewer guide

The SwiftUI app is a reviewer client. Workspace creation, data import, publication, invitations, and manager quality setup are performed in the web interface. Source availability does not imply an App Store release; use the build distributed by your operator or follow the [iOS build guide](../ios/README.md).

## Account sign-in and batch discovery

Open the configured platform server, enter the same email used for your invitation, and verify the email code. Open **My Batches**, accept a pending invitation if needed, then choose a batch. The server supplies workspace, project, and batch IDs and uses the session account as the reviewer identity.

An invitation's **Open in App** link can set the server and invitation. The `medieval://join` scheme works without universal-link association. HTTPS invitation links open directly in the app only when the distributed build and domain association are configured. Confirm any proposed server switch and verify the origin. Sessions are stored in Keychain per server origin.

## Review a card

Read the claim and evidence, then choose Aye, Nay, Hmm, Bad Question, or Skip where offered. These map to `yes`, `no`, `unsure`, `bad_question`, and `skip`. Enter a supported correction or note when useful. Judge the evidence rather than optimizing rewards; yes/no/unsure/bad-question participation has the same base reward, and skip earns none.

Open **Training Grounds & Consistency** to see the rubric, qualification progress, reference feedback, and separate quality XP. Practice can repeat; scored references must be independent and unseen. A reference author's own answers are not scored against their references. Required qualification does not block declared project experts. Read [quality workflows](QUALITY.md) for exact rules and batch scope.

## Offline queue and recovery

The outbox retains queued submissions durably. A queued item is pending delivery, not proof the server accepted it. Reconnect to the original server and account, open the original batch context, and allow delivery to finish; verify the server's progress or export before counting it as submitted.

Account queue entries include server, account, workspace, project, and batch. Switching accounts or servers does not submit old entries under the new identity. Legacy unscoped entries are kept separate and are never flushed through an account session. Do not erase app storage or discard the queue to fix connectivity unless you intend to lose unsent work.

If access was removed, the batch was paused, or the rubric changed, restore valid access/context or resolve the conflict with the administrator before retrying. Retrying a rejected item under a new identity is not a valid recovery strategy.

## Advanced Connection and optional guild

Use **Advanced Connection** for a shared-token server or the legacy local game demo. Supply the service root URL, project/batch context, reviewer name, and token configured by the operator. URL paths are normalized to the service origin; a dashboard URL does not change API routing. Caller-supplied names in this mode are not verified account identities.

The optional guild service stores participation rewards and leaderboards separately from labels. It is not required to review, export, or qualify. Quality XP is a separate authoritative score for reference checks and qualification, not a guild reliability ranking.

## Local device connection

In the simulator, loopback points to your Mac. On a physical iPhone, loopback points to the phone: use your Mac's reachable LAN address and allow Local Network access. The legacy `npm run demo:lan` prints usable URLs but provides no quality endpoints. For quality, connect to the file-backed eval server or account platform. Use HTTPS for deployed servers. See [troubleshooting](TROUBLESHOOTING.md) for SDK and connection failures.
