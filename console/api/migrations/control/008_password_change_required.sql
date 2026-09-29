-- Logins created by an operator with a temporary password (api/manage.js,
-- addUser). While a row exists the admin page shows only "Choose your own
-- password", and /api/handoff opens no editor. The row goes when the user
-- changes it (/api/me/password-changed).
CREATE TABLE password_change_required (
  user_id   text PRIMARY KEY,                -- Neon Auth user id
  added_at  timestamptz NOT NULL DEFAULT now()
);
