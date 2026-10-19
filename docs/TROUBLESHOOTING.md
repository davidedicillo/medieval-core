# Troubleshooting

Start with the application URL, service mode, batch identity, and the visible error. Keep tokens, email codes, invitation links, and private source data out of shared logs. [API reference](API_REFERENCE.md) explains authentication differences.

| Symptom | Likely cause | Recovery and verification |
| --- | --- | --- |
| No sign-in email | Wrong address, provider/sender configuration, spam filtering, or rate limit | Check address and delivery activity; local demos use Development Inbox. Request a fresh code deliberately, then complete sign-in. |
| Code rejected | Expired/wrong code, wrong email, or too many attempts | Use the latest code for the exact address; respect rate limiting. Do not loop requests. |
| Invitation cannot be accepted | Different signed-in email, expiry, or revocation | Sign in as the invited recipient; ask a manager for a fresh invitation when needed. |
| My Batches is empty | Draft/paused/archived batch, wrong account/server, missing acceptance, or wrong audience | Confirm server and account; accept invitation; manager checks publication and access. Refresh discovery. |
| Create Batch is disabled | No managed project | Create a workspace and project or obtain manager access. |
| Preview generates no cards | Wrong adapter/format or missing fields | Try the sample, explicitly select the format, inspect warnings, and compare source fields with the adapter contract. |
| Import rejected with 413 | Account JSON body exceeds 2 MB | Split into smaller batches, including request wrapper overhead. |
| Card evidence/image does not load | Unreachable URL, local-only address, expired access, or private browser cookies | Test from the reviewer's actual device and provide accessible source context. |
| Shared-token API returns 401 | Wrong token or wrong server type | Match the configured token; account servers require a session, not `EVAL_MOBILE_TOKEN`. |
| Account API returns 401 | Missing or expired authenticated session | Sign in again on the correct origin. |
| Write returns 403 | Permission/publication gate, qualification gate, or wrong Origin | Read the error; restore access, qualify, or send a valid authenticated same-origin request. Do not bypass the gate. |
| Request returns 409 | Stale rubric, duplicate/conflicting reference, or stale adjudication basis | Refresh current state, inspect the changed facts, and retry only after resolving the conflict. |
| Quality page returns 404 | Older deployment or legacy demo | Confirm the deployed revision/service. Use a quality-capable eval server or account platform. |
| Empty qualification deck | No live unseen independent references, calibration off, or qualification already complete | Check own qualification status and manager reference pool. Add fresh eligible sources; own authored/exposed references cannot qualify you. |
| Qualification did not pass | Match rate below configured threshold | Study practice feedback; manager supplies fresh independent references. Replaying exposed questions is not a retake. |
| Retired reference changed qualification | Only current live references count | Manager inspects affected reviewers and adds suitable replacement references. |
| Solo label remains `reviewed` | Reviewer not explicitly designated as expert, old rubric, or unsupported expert verdict | Check batch-scoped expert identities and rubric; owner/admin status alone does not imply expertise. |
| Team label is unresolved | Too few substantive votes, disagreement, conflicting corrections, or abstention | Inspect the quality status; obtain needed reviews or adjudicate with rationale. |
| Progress complete but dataset unresolved | Individual completion differs from quality resolution | Inspect resolved-label status and unresolved coverage. |
| iPhone cannot reach localhost | Loopback refers to the phone | Use a reachable LAN server address and allow Local Network access; use HTTPS when deployed. |
| Outbox remains pending | Offline, wrong account/server/batch, expired session, or rejected submission | Reopen the original context, restore valid access/network, and verify server acceptance. Preserve unsent work. |
| Guild sync fails | Optional game service not configured or unreachable | Check its URL/token separately. Verify labels against the eval API; guild health is separate. |

## Xcode or iOS SDK missing

The standalone Command Line Tools do not include the full iOS SDK. Install full Xcode and finish its first-run setup. If Xcode is already installed but `xcode-select -p` points at CommandLineTools, inspect the installed SDKs without changing global settings:

```bash
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild -showsdks
```

Use the actual installed Xcode path. For a simulator build, the [iOS guide](../ios/README.md) documents build and smoke commands. Code signing and distribution require the operator's Apple configuration; a simulator SDK check does not validate App Store distribution.

## Report a reproducible problem

Include the application revision if known, service mode, sanitized endpoint and status, expected behavior, actual behavior, and minimal synthetic input. State whether the result was present in server exports and whether it reproduced after refresh. Report vulnerabilities privately using [security reporting](../SECURITY.md).
