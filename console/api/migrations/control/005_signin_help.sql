-- "Can't sign in?" on the admin page is a request from someone with no login
-- and, often, no site to name: it has neither a user nor a site.
ALTER TABLE change_requests ALTER COLUMN site_id DROP NOT NULL;
ALTER TABLE change_requests ALTER COLUMN user_id DROP NOT NULL;
