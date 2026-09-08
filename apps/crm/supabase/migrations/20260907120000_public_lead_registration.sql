begin;

-- Registra a participação sem substituir o cadastro comercial de contatos existentes.
create table crm.lead_registrations (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references crm.leads(id) on delete cascade,
  source text not null,
  full_name text not null,
  phone_e164 text not null,
  client_category text not null check (client_category in ('hamburgueria', 'distribuidor')),
  zip_code text not null check (zip_code ~ '^[0-9]{8}$'),
  notice_version text not null,
  created_at timestamptz not null default now(),
  unique (source, phone_e164)
);
create index lead_registrations_lead_source on crm.lead_registrations(lead_id, source);
alter table crm.lead_registrations enable row level security;
revoke all on crm.lead_registrations from anon, authenticated;
grant select on crm.lead_registrations to authenticated;
grant all on crm.lead_registrations to service_role;
create policy lead_registrations_visible_lead on crm.lead_registrations
  for select to authenticated using (crm.can_view_lead(lead_id));

-- Limite compartilhado entre instâncias do servidor, dimensionado para Wi-Fi de evento.
-- A chave contém somente HMAC do IP; o IP não é armazenado.
create table crm.lead_registration_rate_limits (
  request_key text not null,
  bucket timestamptz not null,
  requests integer not null default 1,
  primary key (request_key, bucket)
);
create index lead_registration_rate_limits_expiry on crm.lead_registration_rate_limits(bucket);
alter table crm.lead_registration_rate_limits enable row level security;
revoke all on crm.lead_registration_rate_limits from anon, authenticated;
grant all on crm.lead_registration_rate_limits to service_role;

create or replace function crm.register_public_lead(
  p_source text, p_name text, p_phone text, p_client_category text,
  p_zip_code text, p_request_key text, p_notice_version text
)
returns jsonb
language plpgsql security invoker set search_path = crm, pg_temp
as $$
declare
  v_lead crm.leads%rowtype;
  v_contact_id uuid;
  v_stage_id uuid;
  v_requests integer;
  v_registration_id uuid;
begin
  if p_source is distinct from 'ifood_event'
    or p_name is null or length(trim(p_name)) not between 2 and 120
    or p_phone is null or p_phone !~ '^\+55[1-9][0-9]([2-5][0-9]{7}|9[0-9]{8})$'
    or p_client_category is null or p_client_category not in ('hamburgueria', 'distribuidor')
    or p_zip_code is null or p_zip_code !~ '^[0-9]{8}$'
    or p_request_key is null or p_request_key !~ '^[a-f0-9]{64}$'
    or p_notice_version is distinct from '2026-09-07'
  then
    raise exception 'invalid_registration' using errcode = '22023';
  end if;

  delete from crm.lead_registration_rate_limits where bucket < now() - interval '1 hour';
  insert into crm.lead_registration_rate_limits as limits (request_key, bucket)
    values (p_request_key, date_trunc('minute', now()))
    on conflict (request_key, bucket) do update set requests = limits.requests + 1
    returning requests into v_requests;
  if v_requests > 120 then
    raise exception 'registration_rate_limit' using errcode = 'P0429';
  end if;

  -- Serializa reenvios do mesmo telefone; constraints também cobrem a ingestão WhatsApp.
  perform pg_advisory_xact_lock(hashtextextended(p_phone, 7102026));
  if exists (select 1 from crm.lead_registrations where source = p_source and phone_e164 = p_phone) then
    return '{"ok":true}'::jsonb;
  end if;

  select * into v_lead from crm.leads where phone_e164 = p_phone for update;
  if not found then
    insert into crm.contacts (phone_e164, full_name) values (p_phone, trim(p_name))
      on conflict (phone_e164) do nothing returning id into v_contact_id;
    if v_contact_id is null then
      select id into v_contact_id from crm.contacts where phone_e164 = p_phone;
    end if;
    insert into crm.leads (phone_e164, source, contact_id, client_category, zip_code, status)
      values (p_phone, p_source, v_contact_id, p_client_category, p_zip_code, 'open')
      on conflict (phone_e164) do nothing returning * into v_lead;
    if v_lead.id is null then
      select * into strict v_lead from crm.leads where phone_e164 = p_phone for update;
    end if;
  end if;

  if v_lead.excluded_from_pipeline_at is null
    and not exists (select 1 from crm.opportunities where lead_id = v_lead.id)
  then
    select id into v_stage_id from crm.pipeline_stages
      where upper(trim(name)) = 'LEADS' order by sort_order, created_at limit 1;
    if v_stage_id is null then
      raise exception 'entry_stage_not_configured' using errcode = 'P0001';
    end if;
    insert into crm.opportunities (lead_id, stage_id, owner_id, title)
      values (v_lead.id, v_stage_id, v_lead.owner_id, 'Evento iFood · ' || trim(p_name))
      on conflict (lead_id) where lead_id is not null do nothing;
  end if;

  insert into crm.lead_registrations (lead_id, source, full_name, phone_e164, client_category, zip_code, notice_version)
    values (v_lead.id, p_source, trim(p_name), p_phone, p_client_category, p_zip_code, p_notice_version)
    returning id into v_registration_id;
  insert into crm.activity_logs (entity_type, entity_id, action, payload)
    values ('lead', v_lead.id, 'registered_from_public_form', jsonb_build_object(
      'source', p_source, 'campaign', 'Evento iFood', 'registration_id', v_registration_id,
      'name', trim(p_name), 'phone', p_phone, 'client_category', p_client_category,
      'zip_code', p_zip_code, 'notice_version', p_notice_version
    ));
  return '{"ok":true}'::jsonb;
end;
$$;

revoke all on function crm.register_public_lead(text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function crm.register_public_lead(text, text, text, text, text, text, text) to service_role;

commit;
