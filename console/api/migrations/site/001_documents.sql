-- Each customer's own project: every document the site schema describes.
-- One table for every type, with the fields in JSONB (platform plan §3.1).

CREATE TABLE IF NOT EXISTS documents (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type            text NOT NULL,
  slug            text NOT NULL,
  status          text NOT NULL CHECK (status IN ('draft', 'published', 'changed')),
  version         integer NOT NULL CHECK (version > 0),
  data            jsonb NOT NULL,              -- the working draft
  published_data  jsonb,                       -- what visitors see; null until published
  published_at    timestamptz,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      text,
  UNIQUE (type, slug)
);
CREATE INDEX IF NOT EXISTS documents_type ON documents(type, updated_at DESC);
CREATE INDEX IF NOT EXISTS documents_published ON documents(type) WHERE published_data IS NOT NULL;

CREATE TABLE IF NOT EXISTS document_revisions (
  id           bigserial PRIMARY KEY,
  document_id  uuid NOT NULL,                  -- no FK: revisions outlive a deleted document
  version      integer NOT NULL,
  data         jsonb NOT NULL,
  author       text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS document_revisions_doc ON document_revisions(document_id, version DESC);
