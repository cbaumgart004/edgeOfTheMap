-- Edge of the Map's own project: which sites exist and who may edit them
-- (StoryShaped ADR-0007). Logins themselves live in Neon Auth's neon_auth schema.

CREATE TABLE sites (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug               text NOT NULL UNIQUE,
  name               text NOT NULL,
  schema             jsonb NOT NULL,
  console_version    text NOT NULL,
  console_integrity  text NOT NULL,          -- sha384-... of console.js at that version
  allowed_origins    text[] NOT NULL,        -- CORS allowlist and where the loader may run
  connection_param   text NOT NULL,          -- SSM SecureString *name*, never the value
  media_bucket       text NOT NULL,
  media_base_url     text NOT NULL,          -- public URL prefix photos are served from
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE site_members (
  site_id  uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  user_id  text NOT NULL,                    -- Neon Auth user id, the JWT's sub
  role     text NOT NULL CHECK (role IN ('owner', 'editor')),
  PRIMARY KEY (site_id, user_id)
);
CREATE INDEX site_members_user ON site_members(user_id);
