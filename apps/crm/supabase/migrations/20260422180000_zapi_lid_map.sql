-- Mapeia lid:… (webhook só com @lid) para o E.164 real após phone-exists (ex.: envio pelo Inbox).
create table if not exists crm.zapi_lid_map (
  lid_key text primary key,
  phone_e164 text not null,
  updated_at timestamptz not null default now()
);

create index if not exists idx_zapi_lid_map_phone_e164 on crm.zapi_lid_map (phone_e164);

comment on table crm.zapi_lid_map is 'Associação WhatsApp LID (lid:123) → phone_e164 do CRM; preenchida via GET phone-exists ao enviar para um número conhecido.';
