begin;

alter table crm.messages
  add column if not exists media_kind text
    check (media_kind in ('image', 'video', 'audio', 'document')),
  add column if not exists media_url text,
  add column if not exists media_mime_type text,
  add column if not exists media_file_name text;

comment on column crm.messages.media_kind is
  'Tipo de mídia da mensagem (image, video, audio, document).';
comment on column crm.messages.media_url is
  'URL pública/temporária da mídia enviada via WhatsApp.';
comment on column crm.messages.media_mime_type is
  'MIME type informado pelo provedor (ex.: image/jpeg).';
comment on column crm.messages.media_file_name is
  'Nome do arquivo quando disponível (principalmente documentos).';

-- Backfill leve para mensagens de envio já salvas com marcador textual.
update crm.messages
set
  media_kind = coalesce(
    media_kind,
    case
      when body ilike '[FOTO enviado]%' then 'image'
      when body ilike '[VÍDEO enviado]%' or body ilike '[VIDEO enviado]%' then 'video'
      when body ilike '[AUDIO enviado]%' or body ilike '[ÁUDIO enviado]%' then 'audio'
      when body ilike '[DOCUMENTO enviado]%' then 'document'
      else null
    end
  ),
  media_file_name = coalesce(
    media_file_name,
    nullif(trim(regexp_replace(coalesce(body, ''), '^\[[^\]]+\]\s*', '')), '')
  )
where media_kind is null or media_file_name is null;

create index if not exists idx_messages_media_kind on crm.messages (media_kind);

commit;
