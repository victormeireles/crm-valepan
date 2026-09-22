begin;

-- Outbound attachments are uploaded with short-lived signed tokens after the
-- user is authenticated by the CRM. Let the project's global Storage limit
-- govern size (the application still caps the WhatsApp channel at 100 MB) and
-- allow the same document/media formats already accepted by the composer.
update storage.buckets
set
  file_size_limit = null,
  allowed_mime_types = null
where id = 'whatsapp-media';

commit;
