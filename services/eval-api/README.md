# MediEval Eval API

Self-hosted dashboard and mobile API for durable human eval labels.

The [product documentation](../../docs/README.md) covers end-to-end use, and
the [API reference](../../docs/API_REFERENCE.md) distinguishes account and
shared-token operations. Both servers expose `/docs`, `/llms.txt`, and the
machine-readable `/docs/agent/manifest.json` without access to customer data.

```bash
npm run eval-api
```

The server listens on `http://127.0.0.1:5182` by default and stores JSONL under
`.runtime/medieval-eval`.

Set `EVAL_MOBILE_TOKEN` or `MEDIEVAL_EVAL_API_TOKEN` to require bearer-token
auth. With no token, the server is open for local personal use.

## Routes

- `GET /` opens the self-hosted dashboard.
- `GET /api/mobile/eval/cards`
- `POST /api/mobile/eval/results`
- `GET /api/mobile/eval/summary`
- `POST /api/eval/batches`
- `POST /api/eval/cards/import`
- `GET /api/eval/results/export?format=jsonl|csv`

Eval labels are appended to `results.jsonl`. `eventId` is the idempotency key,
with reviewer/card/client timestamp as the fallback for older clients.
Legacy `runId` and `POST /api/eval/runs` are still accepted as aliases.

## Optional quality workflows

Open **Quality & Training** from the dashboard, or `/quality?projectId=PROJECT&batchId=BATCH`.
The account platform serves the same page with session authentication and batch
administrator checks. Reviewers can use Training Grounds without access to
other reviewers' judgments, reference answers, or adjudication records.

New batches use solo review and optional calibration. No reference set is
required to start reviewing. For a solo expert, write a rubric, add your identity
under **Expert reviewer identities** (or **Add me as project expert**), and save.
Labels from that identity are reported as `expert_reviewed`. Optional consistency
quests compare your own earlier judgment; they measure repeatability, not
independent correctness. Enable them with **Consistency check every N reviews**,
or request one manually from Training Grounds.

For additional reviewers, add expert-authored reference examples with a purpose
of `practice`, `qualification`, or `check`. References can use a selected batch
card, which reserves that source from the production queue, or the API can accept
a separate `card` object. Practice and scored references must use distinct source
keys. Authors cannot score themselves against their own references. Previously
reviewed production sources are excluded from scored assignments for that person.
Previously assigned reference sources, including those from older rubrics, are
also excluded from that person's new scored quests. Retired references remain
reserved from production to avoid evaluating examples whose answers were exposed.
Reference answers and explanations are stored only on the server and returned
after submission; qualification feedback waits until the full set is completed.
Optional calibration never blocks production. Required calibration needs a
written rubric and enough qualification examples, and declared project experts
can continue reviewing directly. The question count and pass rate are configurable;
there is no hard requirement for a 100-item pool.

In team mode, every assigned reviewer can independently review the batch. This
first version uses full batch overlap, with one latest vote per reviewer per card
and rubric version. Configure the minimum reviewer count and agreement threshold.
`unsure`, `skip`, bad questions, and incompatible corrected values remain unresolved
until adjudicated. Agreement is recorded as `consensus`, not as verified truth.
An administrator can inspect original judgments and evidence, resolve a label,
and supply a rationale and optional corrected value. Adjudication records whether
the adjudicator participated in the original review. New judgments invalidate the
resolution until the new evidence is adjudicated.

Quality records live in the batch's `quality.json`, written using atomic rename.
This file-backed service supports one writer process per data directory. It keeps
reference snapshots, assignment ownership, attempts, settings history, and
adjudications. Original production events remain in `results.jsonl`. Exporting raw
events adds the current quality status and provenance, with each event's original
qualification and expert-exemption snapshot; resolved-label exports
include original current judgments and the adjudication. Neither export claims
independent verification when it did not occur. Account reviewers' raw exports
continue to include only their own events.

Change the rubric version when changing an established rubric. Versions cannot
be reused. Qualification and production resolutions are scoped to the current
version, while past events remain exportable. Updated clients attach the rubric
version so a queued review cannot silently cross a rubric change. Older clients
without that field continue to submit under the current rubric. Failed qualification
does not permit retries on the same exposed questions: create a fresh rubric/set
or retire old references and add replacement examples.

Ongoing reference checks default to one per 10 production judgments when unseen
references are available; set the interval to zero to disable. Consistency checks
default to off. Both use separate quest IDs and never count as production labels.
Reference agreement and qualification can earn server-issued **Quality XP**
(5 for a matching independent check, 20 once upon passing qualification).
Practice, self-consistency, and majority agreement earn none. Quality XP is shown
separately from the guild's participation leaderboard and is not a reviewer
reliability score.

Quality API routes use the normal project/batch context query parameters:

- `GET /api/mobile/eval/quality`: own qualification and monitoring statistics.
- `GET /api/mobile/eval/quality/cards?kind=practice|qualification|check|consistency`: one owned, unanswered quest.
- `POST /api/mobile/eval/results`: production or a server-issued `quality:…` quest ID.
- `GET /api/eval/quality`: administrator settings, references, judgments, and resolutions.
- `POST /api/eval/quality/settings`: update batch policy and rubric.
- `POST /api/eval/quality/references`: add `{cardId|card, kind, answer, explanation}`.
- `POST /api/eval/quality/references/retire`: retire `{id}` without deleting history.
- `POST /api/eval/quality/adjudications`: resolve `{cardId, answer, rationale, correction?, basisEventIds}`; stale evidence returns 409.
- `GET /api/eval/quality/export?format=jsonl|csv`: resolved labels with provenance.

Keep batches scoped to a task and rubric when using qualification; a score for
one type of judgment does not qualify someone for an unrelated task.
Verify with `npm run quality:smoke` and `npm run platform:smoke`.
