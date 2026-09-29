-- Where a company's pieces live, as named fields rather than free notes:
-- registrar, DNS host, AWS ids, email forwards, each with the address that
-- opens it. The keys are api/manage.js PROFILE_FIELDS. Identities and URLs
-- only, never secrets; manage.js refuses text shaped like one.
ALTER TABLE sites ADD COLUMN profile jsonb NOT NULL DEFAULT '{}'::jsonb;
