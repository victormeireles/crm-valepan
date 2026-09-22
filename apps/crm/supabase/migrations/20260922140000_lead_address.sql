-- Endereço do lead. O CEP continua em zip_code; cidade e UF da empresa
-- só são copiadas quando o lead ainda não tem esses campos.

alter table crm.leads
  add column if not exists street text,
  add column if not exists neighborhood text,
  add column if not exists city text,
  add column if not exists state text;

update crm.leads
set zip_code = regexp_replace(zip_code, '\D', '', 'g')
where zip_code is not null
  and regexp_replace(zip_code, '\D', '', 'g') ~ '^[0-9]{8}$'
  and zip_code is distinct from regexp_replace(zip_code, '\D', '', 'g');

alter table crm.leads
  drop constraint if exists leads_zip_code_digits;

alter table crm.leads
  add constraint leads_zip_code_digits
  check (zip_code is null or zip_code ~ '^[0-9]{8}$');

update crm.leads as lead
set
  city = nullif(trim(company.city), ''),
  state = case
    when company.state ~ '^[A-Za-z]{2}$' then upper(company.state)
    else lead.state
  end
from crm.companies as company
where lead.company_id = company.id
  and lead.city is null
  and nullif(trim(company.city), '') is not null;

update crm.leads as lead
set state = upper(company.state)
from crm.companies as company
where lead.company_id = company.id
  and lead.state is null
  and company.state ~ '^[A-Za-z]{2}$';

alter table crm.leads
  drop constraint if exists leads_state_uf;

alter table crm.leads
  add constraint leads_state_uf
  check (state is null or state ~ '^[A-Z]{2}$');
