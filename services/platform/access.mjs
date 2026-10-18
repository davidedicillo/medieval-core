import { randomBytes, randomUUID, createHash } from 'node:crypto';
import fs from 'node:fs/promises';

export function fail(status, message) {
  throw Object.assign(new Error(message), { status });
}
export function requiredName(value, label = 'Name') {
  const name = String(value ?? '').trim();
  if (!name || name.length > 200) fail(400, `${label} must contain 1 to 200 characters.`);
  return name;
}
const tokenHash = (value) => createHash('sha256').update(value).digest('hex');
const isManager = (role) => ['owner', 'admin'].includes(role);

export class PlatformAccess {
  constructor(pool) { this.pool = pool; }

  async migrate() { await this.pool.query(await fs.readFile(new URL('./schema.sql', import.meta.url), 'utf8')); }

  async workspaces(userId) {
    return (await this.pool.query(`SELECT w.id, w.name, m.role FROM medieval_workspace w
      JOIN medieval_membership m ON m.workspace_id = w.id WHERE m.user_id = $1 ORDER BY w.name`, [userId])).rows;
  }

  async requireManager(userId, workspaceId) {
    const membership = (await this.pool.query('SELECT role FROM medieval_membership WHERE workspace_id = $1 AND user_id = $2', [workspaceId, userId])).rows[0];
    if (!isManager(membership?.role)) fail(403, 'Workspace administrator access is required.');
    return membership;
  }

  async createWorkspace(userId, name) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const workspace = { id: randomUUID(), name: requiredName(name), role: 'owner' };
      await client.query('INSERT INTO medieval_workspace(id,name) VALUES($1,$2)', [workspace.id, workspace.name]);
      await client.query("INSERT INTO medieval_membership(workspace_id,user_id,role) VALUES($1,$2,'owner')", [workspace.id, userId]);
      await client.query('COMMIT');
      return workspace;
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }

  async createProject(userId, workspaceId, name) {
    await this.requireManager(userId, workspaceId);
    return (await this.pool.query('INSERT INTO medieval_project(id,workspace_id,name) VALUES($1,$2,$3) RETURNING *', [randomUUID(), workspaceId, requiredName(name)])).rows[0];
  }

  async projects(userId) {
    return (await this.pool.query(`SELECT p.*, m.role FROM medieval_project p JOIN medieval_membership m
      ON m.workspace_id = p.workspace_id WHERE m.user_id = $1 AND m.role IN ('owner','admin') ORDER BY p.name`, [userId])).rows;
  }

  async projectForManager(userId, projectId) {
    const project = (await this.pool.query('SELECT * FROM medieval_project WHERE id = $1', [projectId])).rows[0];
    if (!project) fail(404, 'Project not found.');
    await this.requireManager(userId, project.workspace_id);
    return project;
  }

  async createBatch(userId, { projectId, name, description = '', audience = 'invited' }) {
    await this.projectForManager(userId, projectId);
    if (!['workspace', 'invited'].includes(audience)) fail(400, 'Choose workspace or invited access.');
    return (await this.pool.query(`INSERT INTO medieval_batch(id,project_id,name,description,audience)
      VALUES($1,$2,$3,$4,$5) RETURNING *`, [randomUUID(), projectId, requiredName(name), String(description).slice(0,4000), audience])).rows[0];
  }

  async batches(userId, { manage = false } = {}) {
    return (await this.pool.query(`SELECT b.*, p.workspace_id, p.name AS project_name, w.name AS workspace_name, m.role
      FROM medieval_batch b JOIN medieval_project p ON p.id = b.project_id
      JOIN medieval_workspace w ON w.id = p.workspace_id
      JOIN medieval_membership m ON m.workspace_id = w.id AND m.user_id = $1
      WHERE (($2 AND m.role IN ('owner','admin')) OR
        (b.status = 'active' AND (m.role IN ('owner','admin') OR
          (b.audience = 'workspace' AND m.role = 'reviewer') OR
          EXISTS (SELECT 1 FROM medieval_assignment a WHERE a.batch_id = b.id AND a.user_id = $1))))
      ORDER BY b.created_at DESC`, [userId, manage])).rows;
  }

  async batch(userId, batchId, { manage = false, includeManaged = false } = {}) {
    const batches = await this.batches(userId, { manage: manage || includeManaged });
    const batch = batches.find((candidate) => candidate.id === batchId);
    if (!batch) fail(403, 'This batch is not available to your account.');
    if (manage && !isManager(batch.role)) fail(403, 'Workspace administrator access is required.');
    return batch;
  }

  async updateBatch(userId, batchId, { status, audience }) {
    await this.batch(userId, batchId, { manage: true });
    if (status !== undefined && !['draft', 'active', 'paused', 'archived'].includes(status)) fail(400, 'Invalid batch status.');
    if (audience !== undefined && !['workspace', 'invited'].includes(audience)) fail(400, 'Invalid batch audience.');
    return (await this.pool.query(`UPDATE medieval_batch SET status = COALESCE($2,status), audience = COALESCE($3,audience)
      WHERE id = $1 RETURNING *`, [batchId, status ?? null, audience ?? null])).rows[0];
  }

  async invite(userId, { workspaceId, batchId = null, email, role = 'reviewer' }) {
    const membership = await this.requireManager(userId, workspaceId);
    const target = String(email ?? '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target) || target.length > 254) fail(400, 'Enter a valid email address.');
    if (batchId) {
      const batch = await this.batch(userId, batchId, { manage: true });
      if (batch.workspace_id !== workspaceId) fail(403, 'The batch belongs to another workspace.');
      role = 'guest';
    }
    if (!['reviewer', 'admin', 'guest'].includes(role) || (!batchId && role === 'guest')) fail(400, 'Invalid invitation role.');
    if (role === 'admin' && membership.role !== 'owner') fail(403, 'Only workspace owners can invite administrators.');
    const token = randomBytes(32).toString('base64url');
    const invitation = (await this.pool.query(`INSERT INTO medieval_invitation(id,workspace_id,batch_id,email,role,token_hash,invited_by,expires_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,email,workspace_id,batch_id,role,expires_at`,
    [randomUUID(), workspaceId, batchId, target, role, tokenHash(token), userId, new Date(Date.now() + 7 * 86400000)])).rows[0];
    return { ...invitation, token };
  }

  async pendingInvitations(email) {
    return (await this.pool.query(`SELECT i.id,i.workspace_id,i.batch_id,i.role,i.expires_at,w.name AS workspace_name,b.name AS batch_name
      FROM medieval_invitation i JOIN medieval_workspace w ON w.id = i.workspace_id
      LEFT JOIN medieval_batch b ON b.id = i.batch_id
      WHERE i.email = $1 AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at > now()
      ORDER BY i.created_at DESC`, [email.toLowerCase()])).rows;
  }

  async accept(user, { token, invitationId }) {
    if (!user.emailVerified) fail(403, 'Verify your email before accepting an invitation.');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const invite = (await client.query(`SELECT * FROM medieval_invitation
        WHERE ${token ? 'token_hash' : 'id'} = $1 FOR UPDATE`, [token ? tokenHash(String(token)) : String(invitationId ?? '')])).rows[0];
      if (!invite || invite.email !== user.email.toLowerCase() || invite.revoked_at || new Date(invite.expires_at) <= new Date()) fail(403, 'This invitation is invalid, expired, or addressed to another account.');
      if (!invite.accepted_at) {
        await client.query(`INSERT INTO medieval_membership(workspace_id,user_id,role) VALUES($1,$2,$3)
          ON CONFLICT(workspace_id,user_id) DO UPDATE SET role = CASE
            WHEN medieval_membership.role = 'owner' THEN 'owner'
            WHEN medieval_membership.role = 'admin' OR EXCLUDED.role = 'admin' THEN 'admin'
            WHEN medieval_membership.role = 'reviewer' OR EXCLUDED.role = 'reviewer' THEN 'reviewer'
            ELSE 'guest' END`, [invite.workspace_id, user.id, invite.role]);
        if (invite.batch_id) await client.query('INSERT INTO medieval_assignment(batch_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [invite.batch_id, user.id]);
        await client.query('UPDATE medieval_invitation SET accepted_at = now() WHERE id = $1', [invite.id]);
      }
      await client.query('COMMIT');
      return { workspaceId: invite.workspace_id, batchId: invite.batch_id };
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }

  async revokeInvitation(userId, invitationId) {
    const invite = (await this.pool.query('SELECT * FROM medieval_invitation WHERE id=$1', [invitationId])).rows[0];
    if (!invite) fail(404, 'Invitation not found.');
    await this.requireManager(userId, invite.workspace_id);
    await this.pool.query('UPDATE medieval_invitation SET revoked_at=now() WHERE id=$1', [invitationId]);
  }

  async removeAccess(userId, batchId, targetUserId) {
    await this.batch(userId, batchId, { manage: true });
    await this.pool.query('DELETE FROM medieval_assignment WHERE batch_id=$1 AND user_id=$2', [batchId,targetUserId]);
    await this.pool.query('UPDATE medieval_invitation SET revoked_at=now() WHERE batch_id=$1 AND email=(SELECT email FROM "user" WHERE id=$2)', [batchId,targetUserId]);
  }

  async members(userId, workspaceId) {
    await this.requireManager(userId, workspaceId);
    return (await this.pool.query(`SELECT u.id,u.name,u.email,m.role FROM medieval_membership m
      JOIN "user" u ON u.id=m.user_id WHERE m.workspace_id=$1 ORDER BY u.name`, [workspaceId])).rows;
  }

  async removeMember(userId, workspaceId, targetUserId) {
    const actor = await this.requireManager(userId, workspaceId);
    const target = (await this.pool.query('SELECT role FROM medieval_membership WHERE workspace_id=$1 AND user_id=$2',[workspaceId,targetUserId])).rows[0];
    if (!target) fail(404,'Member not found.');
    if (target.role === 'owner' || (target.role === 'admin' && actor.role !== 'owner')) fail(403,'Only the owner can remove administrators; owners cannot be removed.');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM medieval_membership WHERE workspace_id=$1 AND user_id=$2',[workspaceId,targetUserId]);
      await client.query('DELETE FROM medieval_assignment WHERE user_id=$1 AND batch_id IN (SELECT b.id FROM medieval_batch b JOIN medieval_project p ON p.id=b.project_id WHERE p.workspace_id=$2)',[targetUserId,workspaceId]);
      await client.query('UPDATE medieval_invitation SET revoked_at=now() WHERE workspace_id=$1 AND email=(SELECT email FROM "user" WHERE id=$2)',[workspaceId,targetUserId]);
      await client.query('COMMIT');
    } catch(error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }
}
