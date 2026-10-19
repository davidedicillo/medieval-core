# Concepts and glossary

## Data hierarchy

An account belongs to workspaces. A workspace contains projects, and a project contains batches. A batch holds review cards and their judgments. Account-platform IDs are returned by the server: discover them instead of deriving them from names. The shared-token server accepts operator-chosen project and batch IDs; `runId` is a legacy alias for `batchId`.

| Term | Meaning |
| --- | --- |
| Source record | Original item, document, property, or model output to evaluate |
| Adapter | Mapping that turns one source record into one or more cards |
| Card | One question about one claimed value, with context and evidence |
| `cardId` | Stable identifier for that question within the batch |
| `sourceKey` | Stable identity of the underlying source; multiple cards may share it |
| Judgment / result | One submitted review event; original events are retained |
| Correction | Reviewer-proposed replacement value and optional reason tags |
| Rubric | Written rule for judging a claim, including ambiguity and abstention |
| Reference | Expert-labeled card used for practice, qualification, or checks |
| Qualification | Reviewer comparison against independent references under a rubric version |
| Consensus | Agreement among distinct reviewer identities under configured rules |
| Adjudication | Explicit resolution with rationale and a recorded set of underlying events |
| Resolved label | Current derived answer, if the configured workflow supports one |
| Guild XP / gold | Participation rewards in the optional game layer |
| Quality XP | Separate reward for independent reference checks or passed qualification |

## Three independent dimensions

Batch publication determines access: `draft`, `active` (shown as Published), `paused`, or `archived`. A draft is editable management state; a published batch can accept reviews. Pausing or archiving hides it from reviewer discovery and rejects new reviewer submissions. Historical manager inspection and exports remain available.

Review progress counts whether an individual has submitted cards. It does not establish that every card has enough independent judgments, a resolved answer, or a correct answer. Team reviewers can each see the full eligible batch; advanced assignment balancing is not implemented.

Quality status describes the current rubric's evidence for a label. A person can finish their deck while the batch still needs another reviewer or adjudication. A rubric change can leave old judgments in raw exports while current resolved labels become pending.

## Identity and confidence

Account review identity comes from the authenticated session, not a supplied display name or `reviewer` field. In shared-token mode, reviewer names are caller-supplied and do not prove independent human identities. Distinct names alone cannot substantiate independent consensus.

Card `confidence` is supplied by the model or adapter. It is not reviewer reliability, calibrated label correctness, or a confidence interval. Quality XP, speed, corrections, repeated agreement, and a single qualification score are also insufficient as general reliability scores.

## Source separation

Practice and scored reference sets use distinct sources. Once a source is reserved as a reference in a batch, its production cards remain excluded even if the reference is retired. Avoid using another card from the same document as a supposedly independent test. Reference authors cannot score their own answers; previously exposed sources are excluded from that person's future scored assignments.
