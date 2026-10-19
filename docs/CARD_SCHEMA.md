# Eval Card Schema

MediEval cards describe one human-review task. The schema is intentionally
generic: a card can represent a listing, a document, a support ticket, a model
trace, a catalog item, or any other subject.

## Card

```json
{
  "schemaVersion": "eval-card.v1",
  "cardId": "website-sample:answer-grounding:sample-002:claim",
  "cardType": "binary_claim",
  "question": "Is this answer supported by the source?",
  "claim": {
    "template": "generic_claim",
    "path": "value",
    "value": "This waterproof notebook has 96 dotted pages and a recycled paperboard cover."
  },
  "sourceKey": "sample-002",
  "priority": "medium",
  "confidence": null,
  "subject": {
    "title": "Product record / Field notebook",
    "subtitle": "Synthetic answer-grounding example",
    "url": null,
    "source": "csv",
    "metadata": {}
  },
  "media": [],
  "analysisContext": {
    "summary": "An illustrative answer contradicts its source record.",
    "model": "",
    "provider": "",
    "analysisStage": "answer-grounding",
    "warnings": ["Synthetic teaching example, not an actual model run."]
  },
  "evidence": [
    {
      "source": "source_record",
      "detail": "Cover: recycled paperboard. Pages: 96. Paper: dotted, 100 gsm. Dimensions: 140 x 210 mm. The notebook is not waterproof.",
      "confidence": null
    }
  ]
}
```

## Required Fields

- `schemaVersion`: string identifying your card contract.
- `cardId`: stable card ID for this eval run.
- `cardType`: currently `binary_claim`.
- `question`: human-facing review prompt.
- `claim.template`: machine-readable claim type.
- `claim.path`: source path or logical field being checked.
- `claim.value`: value the reviewer should verify.
- `sourceKey`: source-system key for debugging and analytics.

## Optional Generic Fields

- `subject`: preferred generic description of the thing being reviewed.
- `media`: preferred generic media array. Image media is rendered in the app.
- `analysisContext`: model or pipeline context; missing fields default to empty.
- `evidence`: supporting snippets; missing evidence defaults to an empty list.
- `priority`: `high`, `medium`, or `low`; missing priority is treated as medium.
- `confidence`: number from 0 to 1, or null.

## Legacy Listing Compatibility

Existing sold-listing backends can keep sending:

```json
{
  "listing": {
    "title": "Sold listing title",
    "url": "https://example.com/listing/123",
    "price": "$44.00",
    "marketplace": "eBay"
  },
  "images": [
    {
      "url": "https://example.com/listing/123.jpg",
      "position": 1,
      "source": "listing"
    }
  ]
}
```

The app prefers `subject` and `media` when present, but falls back to legacy
`listing` and `images`. New integrations should use `subject` and `media`.

## Result Payload

The app posts:

```json
{
  "eventId": "uuid",
  "batchId": "optional-batch-id",
  "cardId": "website-sample:answer-grounding:sample-002:claim",
  "reviewer": "reviewer-1",
  "answer": "no",
  "correction": {
    "correctAnswer": "The notebook has 96 dotted pages and is not waterproof.",
    "reasonTags": ["unsupported_claim"]
  },
  "notes": "",
  "durationMs": 1200,
  "clientGeneratedAt": "2026-06-24T18:00:00Z"
}
```

Canonical answers are `yes`, `no`, `unsure`, `bad_question`, and `skip`. The
medieval labels in the app are presentation only.

`runId` is accepted as a legacy alias for `batchId` by the self-hosted API.
