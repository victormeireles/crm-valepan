-- Backfill: identidade de distribuidor → companies; atendimento → public.clientes.
-- Relatório de pendentes: leads que ainda tiverem distributor_id após este script.

begin;

-- Mapa explícito nome CRM → public.clientes (tipo distribuidor).
create temporary table tmp_dist_map (
  crm_name text primary key,
  cliente_id uuid not null
) on commit drop;

insert into tmp_dist_map (crm_name, cliente_id) values
  ('TOP ALTO', 'bed5ea8c-fde1-4f41-95e6-fc6caf79142d'),
  ('WESLEY', 'cf14e470-227a-44c2-b885-92e7216b6475'),
  ('LOUCOS POR HAMBURGUER', '9df39c97-d935-4f16-a742-e618e1418877'),
  ('LOUCOS', '9df39c97-d935-4f16-a742-e618e1418877'),
  ('NEW SPACE', '0eac3f57-f81e-4bbf-98b3-f33b00f5ff69'),
  ('DELOVA', '6f080487-fa07-4ee9-bb3d-522e08f83e78'),
  ('CACHINHOS', '07aa4c3f-5cec-468b-b32d-5ef9bba74bd4'),
  ('CACHINHOS DOURADOS', '07aa4c3f-5cec-468b-b32d-5ef9bba74bd4'),
  ('FORTE ALIMENTOS', 'aea3a9a8-0b7c-4201-870e-b239f3063e37'),
  ('MEGAVALE', '59e5b43f-965e-43c4-b047-fee6d1b04462'),
  -- Ambíguo (Kouto Alimentos vs KOUTO SOKEAMA): escolhido KOUTO SOKEAMA.
  ('KOUTO', '6ad7b294-8e30-4e1f-8203-04a6e3502a38'),
  -- Match aproximado para PREMIUM.
  ('PREMIUM DISTRIBUIDORA', '8a620c76-6fe6-4a61-92d4-eae6f06efbb5');

-- A) Lead que É distribuidor: garantir companies.name e limpar distributor_id.
with identity_leads as (
  select
    l.id as lead_id,
    l.company_id,
    l.phone_e164,
    nullif(trim(co.name), '') as company_name,
    nullif(trim(ct.full_name), '') as contact_name,
    nullif(trim(d.name), '') as dist_name,
    (d.name ilike 'PENDENTE CARTEIRA · %') as is_placeholder
  from crm.leads l
  left join crm.distributors d on d.id = l.distributor_id
  left join crm.companies co on co.id = l.company_id
  left join crm.contacts ct on ct.id = l.contact_id
  where l.distributor_id is not null
    and lower(trim(coalesce(l.client_category, ''))) = 'distribuidor'
),
resolved as (
  select
    lead_id,
    company_id,
    coalesce(
      company_name,
      case when not is_placeholder then dist_name end,
      contact_name,
      nullif(trim(phone_e164), ''),
      'SEM NOME'
    ) as new_company_name
  from identity_leads
),
ins_companies as (
  insert into crm.companies (name)
  select r.new_company_name
  from resolved r
  where r.company_id is null
  returning id, name
),
linked as (
  update crm.leads l
  set
    company_id = c.id,
    updated_at = now()
  from resolved r
  join ins_companies c on c.name = r.new_company_name
  where l.id = r.lead_id
    and r.company_id is null
  returning l.id
)
update crm.companies co
set
  name = r.new_company_name,
  updated_at = now()
from resolved r
where co.id = r.company_id
  and nullif(trim(co.name), '') is null;

update crm.leads l
set
  distributor_id = null,
  updated_at = now()
where l.distributor_id is not null
  and lower(trim(coalesce(l.client_category, ''))) = 'distribuidor';

-- B) Lead cliente DE distribuidor (hamburgueria ou sem categoria): mapear FK.
update crm.leads l
set
  cliente_distribuidor_id = m.cliente_id,
  distributor_id = null,
  updated_at = now()
from crm.distributors d
join tmp_dist_map m on upper(trim(m.crm_name)) = upper(trim(d.name))
where l.distributor_id = d.id
  and l.cliente_distribuidor_id is null
  and (
    lower(trim(coalesce(l.client_category, ''))) = 'hamburgueria'
    or l.client_category is null
  )
  and d.name not ilike 'PENDENTE CARTEIRA · %';

-- Placeholders em leads não-distribuidor: virar nome de empresa e limpar vínculo.
with placeholder_leads as (
  select
    l.id as lead_id,
    l.company_id,
    l.phone_e164,
    nullif(trim(co.name), '') as company_name,
    nullif(trim(ct.full_name), '') as contact_name,
    nullif(trim(regexp_replace(d.name, '^PENDENTE CARTEIRA ·\s*', '', 'i')), '') as bare_name
  from crm.leads l
  join crm.distributors d on d.id = l.distributor_id
  left join crm.companies co on co.id = l.company_id
  left join crm.contacts ct on ct.id = l.contact_id
  where d.name ilike 'PENDENTE CARTEIRA · %'
),
resolved_ph as (
  select
    lead_id,
    company_id,
    coalesce(company_name, contact_name, bare_name, nullif(trim(phone_e164), ''), 'SEM NOME') as new_company_name
  from placeholder_leads
),
ins_ph as (
  insert into crm.companies (name)
  select r.new_company_name
  from resolved_ph r
  where r.company_id is null
  returning id, name
)
update crm.leads l
set
  company_id = coalesce(l.company_id, c.id),
  distributor_id = null,
  updated_at = now()
from resolved_ph r
left join ins_ph c on c.name = r.new_company_name and r.company_id is null
where l.id = r.lead_id;

-- TESTE e quaisquer restantes sem mapa: garantir empresa e limpar distributor_id.
with leftovers as (
  select
    l.id as lead_id,
    l.company_id,
    l.phone_e164,
    nullif(trim(co.name), '') as company_name,
    nullif(trim(ct.full_name), '') as contact_name,
    nullif(trim(d.name), '') as dist_name
  from crm.leads l
  join crm.distributors d on d.id = l.distributor_id
  left join crm.companies co on co.id = l.company_id
  left join crm.contacts ct on ct.id = l.contact_id
),
resolved_left as (
  select
    lead_id,
    company_id,
    coalesce(company_name, contact_name, dist_name, nullif(trim(phone_e164), ''), 'SEM NOME') as new_company_name
  from leftovers
),
ins_left as (
  insert into crm.companies (name)
  select r.new_company_name
  from resolved_left r
  where r.company_id is null
  returning id, name
)
update crm.leads l
set
  company_id = coalesce(l.company_id, c.id),
  distributor_id = null,
  updated_at = now()
from resolved_left r
left join ins_left c on c.name = r.new_company_name and r.company_id is null
where l.id = r.lead_id;

commit;
