# Quality, calibration, and adjudication

This guide describes the quality implementation in this checkout. Check that your deployment exposes **Quality & Training** before using these workflows. The legacy in-memory game demo does not implement them. Configuration, references, qualification, and adjudications are currently **batch scoped**, including the UI's project-expert designation.

## Choose the workflow

| Situation | Configuration | What the resulting label means |
| --- | --- | --- |
| One domain expert performs regular evaluations | Solo; optional or off calibration; explicitly designate the expert | A recorded expert judgment, with rubric and provenance |
| Reviewer onboarding | Practice plus independent qualification references; optional or required calibration | Performance on this reference set under this rubric |
| Several reviewers evaluate the same tasks | Team; minimum reviews and agreement threshold | Agreement among current reviewer identities |
| Conflicting judgments, corrections, or abstentions | Manager adjudication with rationale | An explicit resolution based on the recorded events |

Calibration is **not always required**. The default is Solo with optional calibration. A declared expert is exempt from a required qualification gate; an owner is not automatically a domain expert. For your own expert review, document the rubric, select **Add me as project expert**, and evaluate normally. Self-consistency can reveal drift, but self-authored reference answers do not independently validate your accuracy.

## Write and version the rubric

Open **Quality & Training** for the selected batch. Describe the claim being evaluated, acceptable evidence, the boundary between yes and no, how to use unsure/bad-question/skip, and how to propose corrections. Include examples of difficult cases. Save a stable rubric version such as `color-v1`.

Once nonempty rubric text is established, changing it requires a new unique version. Previously used versions cannot be reused. Historical judgments remain; only current-version judgments contribute to current resolved labels. Required calibration needs a written rubric and enough live qualification references before it can be enabled.

## Build separate reference sets

A manager adds a reference using an existing card ID or a complete card snapshot, kind (`practice`, `qualification`, or `check`), expected answer, and explanation. `skip` cannot be a reference answer. Choose references that exercise the task's actual categories and difficult boundaries. Keep their sources independent from practice and production. The author is recorded from the authenticated manager on the account platform.

The default qualification size is **30**, with pass rate **0.90**; both are configurable. This is a product default, not a statistical guarantee or a universal minimum. Thirty at 90% means at least 27 matches on that particular set. Choose the count based on task diversity, consequences of mistakes, and available independent references; a larger count cannot repair poor coverage or incorrect reference answers. The supported count range is 1–500. A sole expert can leave calibration optional and need no qualification set at all.

Practice is for learning and can repeat. Qualification and check references must be unseen by the reviewer and cannot be authored by that reviewer. A source already exposed through production review or another assignment is excluded from future scored assignments, including across rubric versions. Keep additional fresh sources for new reviewers, retakes, and ongoing checks.

Adding an existing production source as a reference reserves all cards sharing its `sourceKey` from the production deck and resolved exports. Retiring the reference does not put that source back into production. Historical raw events remain. Retire an incorrect/outdated reference rather than silently replacing its expected answer; retirement invalidates qualification relying on that reference.

## Qualification and feedback

Set calibration to Optional while preparing references. A reviewer opens **Training Grounds**, requests qualification cards, and answers the assigned virtual cards. There is at most one pending assignment per reviewer, kind, and rubric version; repeated fetches return that assignment. Answer feedback is withheld until the qualification set is complete.

When complete, the score is compared with `passRate`. A failure does not permit retaking the same exposed questions for a better score. An administrator must provide fresh references and retire invalid/exposed ones as appropriate, or establish a new rubric and independent set. A new rubric version alone does not make old sources unseen. Check each reviewer's available reference count, since authorship and prior exposure can make it smaller than the manager's live reference count.

Enable Required only after the rubric and references are ready. Unqualified, non-expert reviewers are blocked from production review with HTTP 403 but can discover the batch and use Training Grounds. Qualification is scoped to the current batch and rubric; it is not a credential across all projects.

## Ongoing checks and consistency

`checkEvery` inserts an eligible reference check after the configured production cadence; default 10, 0 disables automatic insertion. If there is no eligible unseen reference, there is no check to insert. `consistencyEvery` similarly schedules a comparison against a reviewer's own prior current-rubric judgment; default 0. Both can also be requested explicitly in Training Grounds.

These tasks use virtual `quality:` card IDs and store attempts separately from production labels. A consistency answer never overwrites the original. It measures agreement with oneself, not correctness. The current implementation does not provide a general reviewer reliability model, statistical confidence intervals, or automatic reviewer exclusion.

## Team agreement and resolution

Team mode uses one latest current-rubric vote per reviewer identity. Defaults require two reviews and agreement threshold 1.0. Yes/no votes can reach consensus when the minimum count and configured threshold are met. Unsure, bad-question, or skip votes require adjudication. Conflicting nonempty corrected values also require adjudication even if all reviewers rejected the original value. Below-threshold conflicting yes/no votes need adjudication; matching votes below the minimum await reviews.

All eligible reviewers can see the full production batch. Automated overlap sampling, workload balancing, and advanced reviewer routing are not implemented. Shared-token reviewer names are not verified independent identities. Agreement under these rules is not proof of truth.

| Resolved status | Interpretation |
| --- | --- |
| `pending` | No current-rubric production judgment |
| `reviewed` | A judgment exists without a configured expert/team resolution |
| `expert_reviewed` | Designated solo expert supplied a substantive supported answer (`yes`, `no`, or `bad_question`) |
| `awaiting_reviews` | Team needs more substantive independent votes |
| `needs_adjudication` | Disagreement, incompatible corrections, or abstention prevents resolution |
| `consensus` | Current votes meet configured agreement rules |
| `adjudicated` | A manager explicitly resolved the current set of underlying events |

`resolvedAnswer` is null when the workflow has not produced a resolution. Preserve that distinction rather than filling it from a majority or the latest raw event.

## Adjudicate and export

In the manager quality view, inspect the card and judgments, then record an answer, rationale, optional correction, and the current `basisEventIds`. The adjudication records whether its author was independent of the reviewers. An adjudicator may have reviewed the card, but the record must not be represented as independent in that case.

If another judgment arrives after you inspected the card, a stale basis is rejected with 409. Refresh and reconsider the changed evidence. A later review can invalidate a previously current adjudication; the old decision remains in history. Raw judgment events are never overwritten by adjudication.

Export [raw judgments and resolved labels](EXPORTING.md) separately. Keep status, rubric version, qualification-at-submission snapshot, reviewer identities, corrections, and adjudication provenance. Report unresolved coverage alongside any derived metrics.

## Rewards

Quality XP awards 5 for a matched independent reference check and 20 once on passing qualification. Practice, self-consistency, majority agreement, and retries receive no such bonus. Participation XP/gold in the iOS guild is separate; correcting a model or agreeing with other reviewers earns no special correctness bonus. Neither reward balance is a label-quality score.
