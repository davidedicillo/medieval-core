# Workspace administration

Applies to the account platform. Sign in before changing workspaces or batches. The [shared-token server](SELF_HOSTING.md) has a different trust model and no equivalent workspace permission boundary.

## Roles

| Role | Can do |
| --- | --- |
| Owner | Manage workspace, projects, batches, invitations, access, quality, and exports; invite administrators |
| Administrator | Manage projects, batches, reviewer invitations, quality, and exports within the workspace; cannot promote administrators or remove owners/other administrators |
| Workspace reviewer | Review active workspace-audience batches and batches directly assigned to them; export their own judgments |
| Batch guest | Review only directly assigned active batches; export their own judgments |

Being an owner or administrator does not automatically declare domain expertise. Expert designation is configured in the batch's quality settings. The UI calls the action **Add me as project expert**, but the current storage and qualification policy are scoped to the selected **batch**. Configure each batch that needs it.

## Create a workspace and project

In **Workspace**, enter a name in **New Workspace**, then select **Create Workspace**. Select that workspace under **Projects**, enter a project name, and select **Create Project**. Projects organize evaluation tasks and adapters; put separate review rounds in separate batches when you need stable provenance.

In **Create Batch**, select the project, name and describe the batch, choose an audience, and [preview your data](IMPORTING.md). Creating a batch imports a draft; it does not publish it automatically.

## Publication and audiences

Open the batch details, select a status, and use **Save Changes**. Use Published to start review, Paused to stop new review temporarily, and Archived to close a round. These actions preserve historical judgments. The current UI does not provide a destructive workspace/batch deletion or an automatic retention policy.

**Invited people** limits review to direct assignments plus workspace managers. **Workspace members** additionally allows workspace reviewers to discover and review the published batch. A batch invitation gives the recipient guest membership and direct batch access, not access to all other batches. Invite them to the workspace separately when they need broader access.

## Invite and remove access

To invite one reviewer, open **Invite to Batch**, enter their email, and send the invitation. To grant ongoing workspace participation, use **Invite to Workspace** and select Reviewer or Administrator. Invitations expire after seven days and can be accepted only by the email-verified intended recipient. Use a separate browser profile or iOS account to test a second reviewer.

Pending invitations can be revoked from management views. Remove a person's direct batch assignment in the batch access list; remove workspace membership from workspace members when their access comes from membership. Removing a direct assignment does not override access from a workspace-audience batch. Removing a member revokes their workspace access without rewriting their historical labels.

For an expired or revoked link, issue a fresh invitation. Treat an invitation URL as a bearer secret for the invitation flow: do not put it in public docs or logs, even though acceptance still requires the correct email account.

## Operate a review round

Write the rubric, inspect representative generated cards, choose [solo or team quality policy](QUALITY.md), then publish. Review progress and quality resolution separately. Before reporting a final dataset, export raw judgments and current resolved labels, account for unresolved cards, and retain the rubric version and relevant source snapshot.
