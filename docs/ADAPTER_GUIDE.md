# Adapter Guide

An adapter turns your domain data into MediEval cards. Keep the adapter close to
your backend, not in the iOS app. The app should not need to know whether a card
came from sold listings, documents, tickets, search results, or model traces.

## Adapter Checklist

- Pick a stable `batchId` for each batch, import, experiment, or model output sample.
- Pick stable `cardId` values within that batch.
- Write a human-readable `question`.
- Put the machine-checked value in `claim.value`.
- Put the original object in `subject`.
- Put images in `media` with `type: "image"`.
- Put model or pipeline details in `analysisContext`.
- Put the most useful supporting facts in `evidence`.
- Store results by `eventId` so retries are idempotent.

## Built-In Generator

The self-hosted dashboard and API include a small generator layer:

```text
POST /api/eval/cards/preview
```

It parses CSV, JSON, or JSONL into records and returns generated eval cards for
preview. Import is a separate confirmation step, so source data can be checked
before it becomes the mobile review deck.

Supported adapters:

- `myfire-rating`: property fire-risk records become review cards for rating
  correctness, explanation/evidence support, and mitigation recommendation.
- `generic`: rows with `question` plus `value`, `claimValue`, `modelOutput`, or
  `answer` become generic binary claim cards.

Try the MyFireRating example:

```bash
EVAL_MOBILE_TOKEN=dev-token npm run eval-api
```

Open the dashboard, choose **Create Batch**, upload `examples/myfire-rating.csv`,
preview the generated cards, and confirm the import.

## MyFireRating Field Mapping

The built-in MyFireRating adapter accepts flexible field names so early exports
do not need a perfect schema. These are the most useful fields:

```text
propertyId, parcelId, apn, id          -> sourceKey / subject metadata
address, propertyAddress               -> subject title
fireRiskRating, riskRating, rating     -> rating correctness card
explanation, reason, rationale         -> evidence support card
evidence, evidenceSummary              -> evidence shown to reviewer
recommendation, mitigation             -> mitigation recommendation card
confidence, modelConfidence            -> card confidence
imageUrl, photoUrl, streetviewUrl      -> media image
url, propertyUrl, sourceUrl            -> subject URL
```

## Sold-Listing Adapter Example

The original MediEval use case reviewed eBay sold-listing analysis. In the
generic model, that mapping becomes:

```text
listing title          -> subject.title
listing URL            -> subject.url
price + marketplace    -> subject.metadata
listing images         -> media[type=image]
analysis component     -> claim
model explanation      -> analysisContext.summary
image/title rationale  -> evidence
review batch           -> batchId
pipeline/model run     -> sourceRunId or analysisContext
```

Legacy `listing` and `images` fields still work, but new sold-listing adapters
should also emit `subject` and `media` so the payload matches the generic
contract.

## Batch ID Defaults

If your backend has only one queue, ignore missing `batchId` and serve that
queue. If your backend has multiple batches, use `batchId` to scope cards,
summary, and result writes. A queued mobile result includes its original batch
selector, so a later retry should still resolve to the same batch.

`runId` is still accepted by the self-hosted API as a backwards-compatible alias
for `batchId`.
