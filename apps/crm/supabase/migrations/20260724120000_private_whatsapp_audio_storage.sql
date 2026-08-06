begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'whatsapp-media',
  'whatsapp-media',
  false,
  16777216,
  array[
    'audio/ogg',
    'audio/opus',
    'audio/mpeg',
    'audio/mp4',
    'audio/x-m4a',
    'audio/wav',
    'audio/webm',
    'application/octet-stream'
  ]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

alter table crm.messages
  add column if not exists media_storage_path text,
  add column if not exists media_size_bytes bigint,
  add column if not exists media_storage_status text
    check (media_storage_status in ('stored', 'remote', 'failed', 'missing'));

comment on column crm.messages.media_storage_path is
  'Caminho privado do arquivo no bucket whatsapp-media.';
comment on column crm.messages.media_size_bytes is
  'Tamanho da mídia persistida, em bytes.';
comment on column crm.messages.media_storage_status is
  'Estado da persistência da mídia recebida do provedor.';

create index if not exists idx_messages_media_storage_path
  on crm.messages (media_storage_path)
  where media_storage_path is not null;

commit;
