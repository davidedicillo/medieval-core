# Answer-Grounding Walkthrough

This uses the three **synthetic** source records and illustrative answers in
[answer-grounding.csv](../examples/answer-grounding.csv), also used by the
[website sample](https://medieval.dev/#demo). They are teaching examples, not
actual model outputs, measured reviewer performance, or a benchmark dataset.

## Import

Start the browser demo using [Self-Hosting](SELF_HOSTING.md#try-the-browser-demo).
In **Create Batch**, use project `website-sample`, batch `answer-grounding`, and
the **Generic** adapter. Upload `examples/answer-grounding.csv`, preview the
three cards, then import them.

The importer reads `question`, `answer`, and `evidence`. Each row's `id` becomes
its `sourceKey`; IDs remain stable inside this project and batch.

The notebook row asks whether an answer calling the notebook waterproof is
supported. The source explicitly says it is not waterproof. Its generated card
includes:

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
  "evidence": [{
    "source": "source_record",
    "detail": "Cover: recycled paperboard. Pages: 96. Paper: dotted, 100 gsm. Dimensions: 140 x 210 mm. The notebook is not waterproof."
  }]
}
```

Optional subject/context fields are omitted here. See the
[complete schema](CARD_SCHEMA.md) for their meaning.

## Review

Open **Review Cards**, select the project and batch, and enter a reviewer name
such as `reviewer-1`. The iOS app can use the same standalone API in manual
connection mode; see [iOS setup](../ios/README.md).

The examples test different kinds of source support:

| Record | What to inspect |
| --- | --- |
| Returns | Whether the paraphrase preserves the time limit and receipt requirement |
| Notebook | Whether the answer reverses the source's explicit negation |
| Atlas release | Whether a planned release and unfinished audit justify a promised outcome |

You decide the label. These prompts are not an automatic accuracy score. A no
or unsure decision can be useful for different reasons; capture that reasoning
in a note rather than inferring agreement from a count.

## Export

Download JSONL or CSV from the dashboard. Each result retains the reviewer,
card, answer, correction, and notes. API-stored results also include project and
batch context and a server receipt timestamp.

This abbreviated **illustrative** request shows a rejected notebook answer:

```json
{
  "cardId": "website-sample:answer-grounding:sample-002:claim",
  "reviewer": "reviewer-1",
  "answer": "no",
  "correction": null,
  "notes": "The source says not waterproof."
}
```

The full [result request](CARD_SCHEMA.md#result-payload) includes a fresh
`eventId`, elapsed review time, and client timestamp. Do not reuse an example
event ID for multiple reviews. A server uses the event ID to deduplicate retries.

The website download uses those request fields but has no server receipt
metadata: it never submits to a server. Import the CSV into your own installation
to produce results from its actual storage/export flow.
