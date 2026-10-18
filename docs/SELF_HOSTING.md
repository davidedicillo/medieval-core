# Self-Hosting

This is the first-user setup for MediEval's open-source core.

## Start The Eval Dashboard

```bash
EVAL_MOBILE_TOKEN=dev-token npm run eval-api
```

Open:

```text
http://127.0.0.1:5182
```

Use the same base URL and token in the iOS app setup screen. Leave the game
service blank unless you also run the optional game service.

## Create A Batch

The dashboard home shows projects, batches, review progress, recent labels, and
export readiness.

Use **Create Batch** to:

1. Enter a project ID and batch ID.
2. Upload or paste CSV/JSONL.
3. Pick an adapter.
4. Preview generated cards.
5. Confirm the import.

For the first real adapter example, paste or upload:

```text
examples/myfire-rating.csv
```

Choose the `MyFireRating` adapter. Each property record generates cards for the
rating, evidence/explanation support, and mitigation recommendation when those
fields are present.

## Import Existing Cards

Use the dashboard import box, or the CLI:

```bash
node packages/cli/medieval-eval.mjs import \
  --base-url http://127.0.0.1:5182 \
  --token dev-token \
  --project personal \
  --batch first-batch \
  --replace \
  --file examples/cards.jsonl
```

## Export Labels

```bash
node packages/cli/medieval-eval.mjs export \
  --base-url http://127.0.0.1:5182 \
  --token dev-token \
  --project personal \
  --batch first-batch \
  --reviewer "Davide" \
  --format jsonl \
  --out .runtime/first-batch-labels.jsonl
```

The JSONL export is the durable human-label dataset. The optional game service
is only a reward/progress layer.
