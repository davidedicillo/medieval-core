# Your first review batch

Applies to the account platform. You need an email address and access to a running server. Use a synthetic sample before importing real project data.

## Sign in

1. Open your MediEval application URL and enter your email under **Sign In**.
2. Select **Send Code**, read the email, and enter its six-digit code. Add your name if prompted.
3. If you received an invitation, sign in with the exact invited email and select **Accept Invitation**. A link alone does not grant access.

For a local trial, run `npm install` followed by `npm run demo:accounts`. Open `http://127.0.0.1:5183`; sign in as `owner@medieval.test` and read the code in **Development Inbox**. This address is an example, not an existing account. The demo needs local PostgreSQL tools or an explicit `DATABASE_URL`; see [account setup](ACCOUNTS.md).

## Create and publish

1. Open **Workspace**. Create a workspace named `Catalog evaluation`, then a project named `Color extraction` in that workspace.
2. Open **Create Batch**, select that project, and name the batch `First color review`.
3. Select **Generic claims**, **JSON**, and paste:

```json
[
  {
    "id": "catalog:001",
    "question": "Does the source support the extracted color?",
    "value": "blue",
    "explanation": "Source description: a blue cotton shirt."
  }
]
```

4. Select **Preview**. Confirm the question, claimed value, and context are intelligible and that one card was generated.
5. Select **Create Draft**. In **Batch Details**, change **Status** to **Published** and select **Save Changes**. The API calls this status `active`.
6. Keep **Invited people** if only directly invited reviewers should participate. For a team, invite a reviewer from **Invite to Batch**, then have them accept using their own account.

## Review and export

Select **Review**. Read the source and question, then choose **Yes** if the source supports `blue`. Save the verdict. Confirm the card no longer appears as pending and your progress increases. A browser error is not a saved label; retry only after checking whether the result was accepted.

Return to **Batch Details** to inspect **Results** and select **Export JSONL** or **Export CSV**. These downloads contain recorded judgments, not a quality certification. For a resolved expert label, open **Quality & Training**, write the rubric, keep **Solo** and optional calibration, and explicitly use **Add me as project expert** before reviewing. See [quality workflows](QUALITY.md) for the distinction between `reviewed`, `expert_reviewed`, and `consensus`.

Your first loop is complete when the draft is published, a review is durably recorded, and the exported record contains the expected card ID, reviewer identity, and answer. [Web review](REVIEWING.md) explains other verdicts; [imports](IMPORTING.md) explains larger datasets.
