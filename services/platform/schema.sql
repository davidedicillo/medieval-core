CREATE TABLE IF NOT EXISTS medieval_workspace (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS medieval_membership (
  workspace_id TEXT NOT NULL REFERENCES medieval_workspace(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'reviewer', 'guest')),
  PRIMARY KEY (workspace_id, user_id)
);
CREATE TABLE IF NOT EXISTS medieval_project (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES medieval_workspace(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS medieval_batch (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES medieval_project(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'archived')),
  audience TEXT NOT NULL DEFAULT 'invited' CHECK (audience IN ('workspace', 'invited')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS medieval_assignment (
  batch_id TEXT NOT NULL REFERENCES medieval_batch(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  PRIMARY KEY (batch_id, user_id)
);
CREATE TABLE IF NOT EXISTS medieval_invitation (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES medieval_workspace(id) ON DELETE CASCADE,
  batch_id TEXT REFERENCES medieval_batch(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'reviewer', 'guest')),
  token_hash TEXT NOT NULL UNIQUE,
  invited_by TEXT NOT NULL REFERENCES "user"(id),
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS medieval_membership_user ON medieval_membership(user_id);
CREATE INDEX IF NOT EXISTS medieval_invitation_email ON medieval_invitation(email);
CREATE INDEX IF NOT EXISTS medieval_project_workspace ON medieval_project(workspace_id);
CREATE INDEX IF NOT EXISTS medieval_batch_project ON medieval_batch(project_id);
