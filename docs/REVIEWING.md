# Reviewing in the browser

Sign in, accept your invitation, and open a published batch under **My Batches**. Select **Review**. On the shared-token web demo, set the correct project, batch, reviewer name, and token before opening **Review Cards**.

## Make a judgment

Read the question and claimed value, inspect the source context and evidence, and apply the current rubric. Evaluate what the question asks; do not infer that a plausible claim is supported when the supplied source cannot establish it.

| Visible choice | Stored value | Use when |
| --- | --- | --- |
| Yes / Aye | `yes` | The claim meets the rubric |
| No / Nay | `no` | The claim fails the rubric |
| Unsure / Hmm | `unsure` | Evidence or expertise is insufficient to decide |
| Bad question | `bad_question` | The task is malformed, ambiguous, or inappropriate under the rubric |
| Skip | `skip` | You are declining this card; this is not an affirmative/negative label |

For a rejected claim, add a corrected value when the evidence supports one. Use notes to explain the specific problem, cite relevant evidence, or describe ambiguity. A correction is a proposal attached to the judgment; it does not rewrite the original source or model output. API corrections can also carry `reasonTags`.

Save once and confirm progress or result visibility. The app may offer a compact subset of choices depending on the screen; the API vocabulary above is canonical. Finishing your deck means your judgments are saved, not that all reviewers agree or that every label is resolved.

## Quality tasks

If required qualification blocks production review, open **Quality & Training** and complete the qualification for this rubric version. Practice gives feedback for learning; qualification withholds answer feedback until the set is complete. A batch may also insert reference checks or repeat one of your own prior questions for consistency.

Quality cards use IDs beginning with `quality:` and record attempts separately from production labels. Do not treat their answers as new production votes. A consistency answer compares with your previous judgment; it does not prove either answer is correct.

## Progress and resubmission

Cards normally disappear from your pending deck after a saved judgment. Use the result inspector or exports to verify a label when the network response is uncertain. API clients must retry an uncertain submission with the **same** `eventId` and body; creating a new event ID can create another historical judgment. For quality resolution, only the latest current-rubric vote per reviewer counts, while raw history remains available.

If an administrator pauses or archives a batch while you are reviewing, a later submission can be rejected. Refresh discovery before continuing. If the rubric changes, refresh the deck and read the new rubric; a stale client can receive a conflict rather than silently submitting against old instructions.

Reviewers on the account platform can export their own results. Administrators can inspect and export all results in their managed batch. Cross-reviewer results are not exposed to reviewers merely because they share a batch.
