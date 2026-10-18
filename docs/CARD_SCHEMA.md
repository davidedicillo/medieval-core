# Eval Card Schema

MediEval cards describe one human-review task. The schema is intentionally
generic: a card can represent a listing, a document, a support ticket, a model
trace, a catalog item, or any other subject.

## Card

```json
{
  "schemaVersion": "eval-card.v1",
  "cardId": "run-123:item-456:color",
  "cardType": "binary_claim",
  "question": "Is the extracted color correct?",
  "claim": {
    "template": "attribute_color",
    "path": "attributes.color",
    "value": "blue"
  },
  "sourceKey": "catalog:item-456",
  "priority": "medium",
  "confidence": 0.62,
  "subject": {
    "title": "Catalog item 456",
    "subtitle": "Attribute extraction",
    "url": "https://example.com/items/456",
    "source": "catalog",
    "metadata": {
      "category": "apparel"
    }
  },
  "media": [
    {
      "url": "https://example.com/items/456.jpg",
      "type": "image",
      "label": "Source image",
      "position": 1,
      "source": "catalog"
    }
  ],
  "analysisContext": {
    "summary": "The model extracted blue from the product image.",
    "model": "example-model",
    "provider": "example-provider",
    "analysisStage": "attribute-extraction",
    "warnings": []
  },
  "evidence": [
    {
      "source": "image",
      "detail": "The item appears blue in the primary image.",
      "confidence": 0.62,
      "imagePositions": ["1"]
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
  "cardId": "run-123:item-456:color",
  "reviewer": "Davide",
  "answer": "no",
  "correction": {
    "correctAnswer": "green",
    "reasonTags": ["wrong_item"]
  },
  "notes": "",
  "durationMs": 1200,
  "clientGeneratedAt": "2026-06-24T18:00:00Z"
}
```

Canonical answers are `yes`, `no`, `unsure`, `bad_question`, and `skip`. The
medieval labels in the app are presentation only.

`runId` is accepted as a legacy alias for `batchId` by the self-hosted API.
