alter table crm.leads
  add column if not exists zip_code text,
  add column if not exists weekly_bread_consumption integer,
  add column if not exists bread_type text,
  add column if not exists bread_weight_grams integer;

alter table crm.leads
  drop constraint if exists leads_weekly_bread_consumption_nonnegative;

alter table crm.leads
  add constraint leads_weekly_bread_consumption_nonnegative
  check (
    weekly_bread_consumption is null
    or weekly_bread_consumption >= 0
  );

alter table crm.leads
  drop constraint if exists leads_bread_weight_grams_nonnegative;

alter table crm.leads
  add constraint leads_bread_weight_grams_nonnegative
  check (
    bread_weight_grams is null
    or bread_weight_grams >= 0
  );
