-- Operator notes per site on the management page: registrar, DNS host, app ids,
-- email forwards. Never secrets; api/manage.js refuses text that looks like one.
ALTER TABLE sites ADD COLUMN notes text;
