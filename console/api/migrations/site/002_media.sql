-- The media library (core/media.js): every file the site uploaded, named and
-- foldered. The file itself is in the site's bucket; `src` is its address and
-- never changes, so renaming or moving a file leaves every page using it whole.

CREATE TABLE IF NOT EXISTS media (
  id            uuid PRIMARY KEY,
  src           text NOT NULL UNIQUE,
  object_key    text,                          -- the bucket key, for deleting the file
  name          text NOT NULL,
  folder        text NOT NULL DEFAULT '',      -- "Retreats/2026"; '' is the top
  content_type  text NOT NULL DEFAULT '',
  bytes         bigint,
  width         integer,
  height        integer,
  created_at    timestamptz NOT NULL DEFAULT now(),
  created_by    text
);
CREATE INDEX IF NOT EXISTS media_folder ON media(folder, created_at DESC);

-- Folders made before anything is put in them.
CREATE TABLE IF NOT EXISTS media_folders (
  path  text PRIMARY KEY
);
