begin;

-- Reúne a conversa aberta com o identificador privado (LID) à conversa do
-- telefone real. A função também reaproveita o lead LID quando ainda não há um
-- lead canônico, evitando criar uma segunda ficha no primeiro retorno recebido.
create or replace function crm.merge_zapi_lid_identity(
  p_lid_key text,
  p_phone_e164 text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lid_conversation_id uuid;
  v_phone_conversation_id uuid;
  v_lid_lead_id uuid;
  v_phone_lead_id uuid;
  v_lid_contact_id uuid;
  v_phone_contact_id uuid;
begin
  if p_lid_key !~ '^lid:[0-9]{8,}$'
     or p_phone_e164 !~ '^\+[1-9][0-9]{7,14}$' then
    return null;
  end if;

  select c.id, c.lead_id
  into v_lid_conversation_id, v_lid_lead_id
  from crm.conversations c
  where c.channel = 'whatsapp' and c.phone_e164 = p_lid_key
  for update;

  select c.id, c.lead_id
  into v_phone_conversation_id, v_phone_lead_id
  from crm.conversations c
  where c.channel = 'whatsapp' and c.phone_e164 = p_phone_e164
  for update;

  if v_lid_lead_id is null then
    select l.id, l.contact_id
    into v_lid_lead_id, v_lid_contact_id
    from crm.leads l
    where l.phone_e164 = p_lid_key
    for update;
  else
    select l.contact_id
    into v_lid_contact_id
    from crm.leads l
    where l.id = v_lid_lead_id
    for update;
  end if;

  if v_phone_lead_id is null then
    select l.id
    into v_phone_lead_id
    from crm.leads l
    where l.phone_e164 = p_phone_e164
    for update;
  end if;

  if v_phone_lead_id is null and v_lid_lead_id is not null then
    select c.id
    into v_phone_contact_id
    from crm.contacts c
    where c.phone_e164 = p_phone_e164
    for update;

    if v_lid_contact_id is not null and v_phone_contact_id is null then
      update crm.contacts
      set phone_e164 = p_phone_e164,
          updated_at = now()
      where id = v_lid_contact_id;
    elsif v_phone_contact_id is not null then
      update crm.leads
      set contact_id = v_phone_contact_id
      where id = v_lid_lead_id;
    end if;

    update crm.leads
    set phone_e164 = p_phone_e164,
        updated_at = now()
    where id = v_lid_lead_id;
    v_phone_lead_id := v_lid_lead_id;
  end if;

  if v_lid_conversation_id is null then
    return v_phone_conversation_id;
  end if;

  if v_phone_conversation_id is null then
    update crm.conversations
    set phone_e164 = p_phone_e164,
        lead_id = coalesce(v_phone_lead_id, lead_id),
        updated_at = now()
    where id = v_lid_conversation_id;
    return v_lid_conversation_id;
  end if;

  if v_lid_conversation_id = v_phone_conversation_id then
    return v_phone_conversation_id;
  end if;

  update crm.messages
  set conversation_id = v_phone_conversation_id
  where conversation_id = v_lid_conversation_id;

  update crm.conversations
  set lead_id = coalesce(v_phone_lead_id, lead_id),
      updated_at = now()
  where id = v_phone_conversation_id;

  delete from crm.conversations
  where id = v_lid_conversation_id;

  return v_phone_conversation_id;
end;
$$;

revoke all on function crm.merge_zapi_lid_identity(text, text) from public;
grant execute on function crm.merge_zapi_lid_identity(text, text) to service_role;

-- Corrige os pares já identificados antes desta versão, inclusive mensagens
-- enviadas que ficaram separadas do retorno recebido pelo mesmo contato.
do $$
declare
  identity_pair record;
begin
  for identity_pair in
    select distinct m.lid_key, m.phone_e164
    from crm.zapi_lid_map m
    where exists (
      select 1
      from crm.conversations c
      where c.channel = 'whatsapp' and c.phone_e164 = m.lid_key
    )
  loop
    perform crm.merge_zapi_lid_identity(identity_pair.lid_key, identity_pair.phone_e164);
  end loop;
end;
$$;

commit;
