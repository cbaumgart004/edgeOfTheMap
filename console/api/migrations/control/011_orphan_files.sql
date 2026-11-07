-- Files a site's library let go of that are still in a bucket: deleting the
-- object failed (most likely the API role lacks s3:DeleteObject), so the file
-- is only cost now. Manage lists them under Usage to remove or dismiss
-- (api/manage.js, /orphans). One row per object; a later failure updates it.
CREATE TABLE orphan_files (
  bucket     text NOT NULL,
  key        text NOT NULL,
  site_id    uuid REFERENCES sites (id) ON DELETE SET NULL,
  error      text,
  failed_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (bucket, key)
);
