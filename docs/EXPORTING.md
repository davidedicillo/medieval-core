# Exporting and interpreting labels

Export after confirming that submissions reached the server. A native offline queue, an on-screen answer, or a completed game quest is not a durable server label. Keep the source dataset and rubric version with your export.

## Choose the dataset

| Dataset | Where | Granularity |
| --- | --- | --- |
| Raw results | Batch Details → Export CSV/JSONL; `/api/eval/results/export` | Historical production review events |
| Resolved labels | Quality & Training → export; `/api/eval/quality/export` | One current derived row per eligible production card |
| Quality attempts | Manager quality snapshot | Practice, qualification, checks, and consistency; separate from production events |

On the account platform, managers export all batch judgments; reviewers export only their own raw judgments. Resolved labels and the full quality snapshot require manager access. A shared token grants broad operator access on the simpler server and should not be distributed as a restricted reviewer credential.

JSONL has one object per line and preserves nested fields. CSV is useful for spreadsheets; structured values such as votes, judgments, adjudication, or card data can appear as JSON inside quoted cells. Parse CSV with a CSV parser rather than splitting on commas. Treat free-text cells as untrusted when opening them in spreadsheet software.

## Raw result fields

The stable integration fields include `eventId`, `cardId`, `reviewer`, `answer`, `correction`, `notes`, `durationMs`, and `clientGeneratedAt`, with server context and timestamps. Account results also record user/workspace identity and reviewer name. Results can include a rubric version, reviewer role, and qualification snapshot at submission; manager exports enrich rows with current quality metadata. Older events may lack newer fields.

An event ID identifies a submission for idempotency. Do not count retry responses as additional independent reviews. Raw exports retain event history; for current resolution, the quality workflow uses the latest current-rubric vote per identity. Account servers namespace client event IDs by user.

`correction.correctAnswer` is the proposed replacement, not a rewritten model claim. `reasonTags` and `notes` explain the judgment. `durationMs` is supplied by the client and is not evidence of careful review. Card confidence describes the model/adapter, not the reviewer.

## Resolved label fields

Resolved rows include `cardId`, `sourceKey`, `rubricVersion`, `status`, `resolvedAnswer`, `reviewerCount`, `votes`, `agreement`, current `judgments`, `adjudication`, and the original card snapshot. JSONL also exposes the adjudication basis. CSV supplies project/batch context as columns. References reserved from production are excluded.

Filter on a deliberately chosen status policy. For example, a solo-expert report may include `expert_reviewed` and independently inspected `adjudicated` rows; a team report may include `consensus` and `adjudicated` rows. Keep unresolved rows for coverage reporting. Do not silently convert `unsure`, `bad_question`, `skip`, or null into `no`.

A `consensus` label proves only agreement under the configured rule. An `expert_reviewed` label identifies an explicitly designated expert's judgment, not independent confirmation. Adjudication may be performed by a prior reviewer; inspect the independence flag before describing it as independent review.

## Example export request

For a shared-token server:

```bash
node packages/cli/medieval-eval.mjs export \
  --base-url http://127.0.0.1:5182 --token dev-token \
  --project catalog --batch color-round-1 --format jsonl \
  --out .runtime/color-round-1-results.jsonl
```

For the account platform, use the web download or an authenticated request with the server-returned batch ID. The existing CLI import command targets the shared-token API; it does not create account-platform drafts. See [API reference](API_REFERENCE.md).

## Reproducibility checklist

Record the application revision, export date, source and adapter versions, batch identity, rubric text/version, quality settings, and your inclusion rules. Compare source-card count, reserved-reference count, raw reviewer coverage, resolved-card count, and unresolved reasons. Exporting data does not by itself establish its quality or suitability for training or evaluation.
