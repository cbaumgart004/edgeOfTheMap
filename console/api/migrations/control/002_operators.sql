-- Edge of the Map operators: who may use the management page on
-- admin.theedgeofthemap.com (every site, every login). Separate from
-- site_members, which only says who edits one site.
CREATE TABLE operators (
  user_id   text PRIMARY KEY,                -- Neon Auth user id
  added_at  timestamptz NOT NULL DEFAULT now()
);

-- Bootstrap: when this runs, the only owners are Edge of the Map's own logins,
-- so they become the first operators. Later operators are added by an operator.
INSERT INTO operators (user_id) SELECT DISTINCT user_id FROM site_members WHERE role = 'owner';

-- The repository each site deploys from, shown on the management page.
ALTER TABLE sites ADD COLUMN repo text;
