-- Change requests sent from a site's editor or the admin page, shown to
-- operators on the management page and announced by email and push
-- (api/requests.js).
CREATE TABLE change_requests (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id     uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  user_id     text NOT NULL,               -- Neon Auth user id of the sender
  email       text,
  page        text,                        -- the site path it was sent from, if any
  body        text NOT NULL,
  status      text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  done_at     timestamptz
);
CREATE INDEX change_requests_open ON change_requests (status, created_at DESC);

-- Browsers an operator turned notifications on in (Web Push). A subscription
-- the push service reports gone is deleted when a send finds it.
CREATE TABLE push_subscriptions (
  endpoint    text PRIMARY KEY,
  user_id     text NOT NULL,
  keys        jsonb NOT NULL,              -- { p256dh, auth } from the browser
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Console-wide values the Lambda creates for itself, e.g. the Web Push (VAPID)
-- key pair, generated on first use so there is nothing to provision.
CREATE TABLE console_settings (
  name        text PRIMARY KEY,
  value       jsonb NOT NULL
);
