-- Types a site's owner defines for themselves (schema/custom.js), merged over
-- the shipped schema when the site loads. Separate from sites.schema so a
-- reload of the shipped schema (Manage, Save) never loses them.
ALTER TABLE sites ADD COLUMN custom_schema jsonb NOT NULL DEFAULT '{}'::jsonb;
