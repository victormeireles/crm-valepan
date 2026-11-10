-- Estado de alerta por e-mail quando a instância Z-API comercial desconecta.
-- claim atômico evita spam em serverless (várias falhas de envio em paralelo).

begin;

create table if not exists crm.zapi_connection_alerts (
  instance_id text primary key,
  alert_sent_at timestamptz,
  last_source text,
  last_detail text,
  updated_at timestamptz not null default now()
);

comment on table crm.zapi_connection_alerts is
  'Controla se já enviamos e-mail de desconexão da Z-API; alert_sent_at null = pode alertar.';

grant select, insert, update, delete on table crm.zapi_connection_alerts to service_role;

create or replace function crm.claim_zapi_disconnect_alert(
  p_instance_id text,
  p_source text,
  p_detail text
)
returns boolean
language plpgsql
security definer
set search_path = crm, public
as $$
declare
  claimed boolean := false;
begin
  if p_instance_id is null or length(trim(p_instance_id)) = 0 then
    return false;
  end if;

  insert into crm.zapi_connection_alerts as a (
    instance_id,
    alert_sent_at,
    last_source,
    last_detail,
    updated_at
  )
  values (
    trim(p_instance_id),
    now(),
    nullif(trim(coalesce(p_source, '')), ''),
    nullif(trim(coalesce(p_detail, '')), ''),
    now()
  )
  on conflict (instance_id) do update
    set
      alert_sent_at = excluded.alert_sent_at,
      last_source = excluded.last_source,
      last_detail = excluded.last_detail,
      updated_at = now()
    where a.alert_sent_at is null
  returning true into claimed;

  return coalesce(claimed, false);
end;
$$;

create or replace function crm.clear_zapi_disconnect_alert(p_instance_id text)
returns void
language plpgsql
security definer
set search_path = crm, public
as $$
begin
  if p_instance_id is null or length(trim(p_instance_id)) = 0 then
    return;
  end if;

  insert into crm.zapi_connection_alerts as a (
    instance_id,
    alert_sent_at,
    last_source,
    last_detail,
    updated_at
  )
  values (
    trim(p_instance_id),
    null,
    'connected',
    null,
    now()
  )
  on conflict (instance_id) do update
    set
      alert_sent_at = null,
      last_source = 'connected',
      last_detail = null,
      updated_at = now();
end;
$$;

revoke all on function crm.claim_zapi_disconnect_alert(text, text, text) from public;
revoke all on function crm.clear_zapi_disconnect_alert(text) from public;
grant execute on function crm.claim_zapi_disconnect_alert(text, text, text) to service_role;
grant execute on function crm.clear_zapi_disconnect_alert(text) to service_role;

commit;
