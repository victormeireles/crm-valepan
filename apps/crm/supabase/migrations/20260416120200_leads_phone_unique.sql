-- Um lead por telefone (V1)
create unique index if not exists idx_leads_phone_unique on crm.leads (phone_e164);
