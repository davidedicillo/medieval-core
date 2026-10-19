# Importing data and creating cards

You need manager access to the target account-platform project, or the shared token for an eval server. Start with a small representative sample. Preview is read-only; creating a draft or confirming an import writes cards.

## Choose a format and adapter

The web import accepts CSV, a JSON array of records, or one JSON object per line (JSONL / NDJSON). A JSON file must contain records in a shape accepted by the generator; do not assume arbitrary nested exports will be discovered automatically. Explicitly select the format if Auto guesses incorrectly. The account platform limits JSON request bodies to 2 MB, including the surrounding request. Split larger uploads into separate batches.

| Adapter | Use |
| --- | --- |
| Generic claims (`generic`) | Flat question/value source records |
| MyFireRating (`myfire-rating`) | Property ratings, supporting explanations/evidence, and mitigation recommendations |
| Custom adapter | Domain mapping implemented before import; see [adapter guide](ADAPTER_GUIDE.md) |

For the sample property workflow, choose **MyFireRating**, upload the **Sample CSV**, and inspect which questions each property generated. Missing source fields can reduce the generated card count. A source record is not necessarily one card.

## Generic record example

```json
{
  "id": "catalog:001",
  "question": "Does the source support the extracted color?",
  "value": "blue",
  "confidence": 0.72,
  "explanation": "Source description: a blue cotton shirt."
}
```

For generic source records, use a stable `id` (or supported property identifier); the generator derives `sourceKey` and `cardId`. It reads flat `question`, `value`, and `explanation`/`summary` fields, rather than preserving arbitrary nested canonical card fields. For direct card imports, supply stable `cardId` and `sourceKey` plus `schemaVersion`, `cardType`, and `claim.template`, `claim.path`, and `claim.value`. [Card schema](CARD_SCHEMA.md) explains the full contract. [Agent examples](agent/examples.json) contain a complete card, result, reference, and import payload.

CSV is useful for flat records. Quote cells containing commas, quotes, or line breaks. Direct canonical JSON/JSONL card imports preserve nested evidence, image lists, and structured context; the web source adapters use their documented field mappings. Keep the claimed value meaningful as text; an empty value does not produce a useful judgment task.

## Preview and validate

1. Select the correct project, adapter, and format, then upload a file or paste source data.
2. Select **Preview**. Check generated count, warnings, question wording, claim path/value, source identity, and available context/media.
3. Inspect positive, negative, missing-field, and ambiguous examples. Confirm reviewers have enough evidence to answer without guessing.
4. Correct source data or adapter mapping when the question evaluates the wrong thing. Do not use reviewer corrections to conceal a broken import.
5. Create the draft, inspect its details, configure review policy, and publish when ready.

Media URLs must be accessible to the reviewers' devices. A URL that works only with your private browser cookies will not necessarily load in iOS. Do not embed credentials in URLs; provide appropriately accessible source material through your own data policy.

## Direct cards and CLI

The shared-token dashboard and `/api/eval/cards/import` can import canonical cards directly. The CLI reads JSONL cards rather than generating cards from arbitrary CSV:

```bash
node packages/cli/medieval-eval.mjs import \
  --base-url http://127.0.0.1:5182 --token dev-token \
  --project catalog --batch color-round-1 --file examples/cards.jsonl
```

`--replace` replaces the batch's deck; it does not provide a complete reset of judgment or quality history. Use a new batch for a fresh evaluation round. Avoid reusing a card ID for a semantically different question. Preserve source data and adapter/rubric versions outside the import when you need to reproduce a dataset.

The account platform uses `/api/platform/preview` and `/api/platform/batches`; the shared-token CLI import endpoint is not an account-platform import API. Use [API reference](API_REFERENCE.md) to select the correct workflow.
