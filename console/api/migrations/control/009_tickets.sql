-- Change requests become tickets worked like Azure DevOps work items
-- (api/requests.js): a state of New, Active, Resolved or Closed, an operator
-- assigned, and a thread of comments. A comment or state change can tell the
-- person who asked, by email and push.
ALTER TABLE change_requests DROP CONSTRAINT change_requests_status_check;
UPDATE change_requests SET status = CASE status WHEN 'done' THEN 'closed' ELSE 'new' END;
ALTER TABLE change_requests ALTER COLUMN status SET DEFAULT 'new';
ALTER TABLE change_requests ADD CONSTRAINT change_requests_status_check
  CHECK (status IN ('new', 'active', 'resolved', 'closed'));
ALTER TABLE change_requests ADD COLUMN assigned_to text;      -- operator's Neon Auth user id
ALTER TABLE change_requests ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
DROP INDEX change_requests_open;
CREATE INDEX change_requests_status ON change_requests (status, created_at DESC);
CREATE INDEX change_requests_user ON change_requests (user_id, created_at DESC);

-- The thread under a ticket. Operators write; the requester reads their own.
CREATE TABLE change_request_comments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id  uuid NOT NULL REFERENCES change_requests(id) ON DELETE CASCADE,
  user_id     text,                         -- Neon Auth user id of the writer
  email       text,
  body        text NOT NULL,
  notified    boolean NOT NULL DEFAULT false, -- the requester was told
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX change_request_comments_request ON change_request_comments (request_id, created_at);
