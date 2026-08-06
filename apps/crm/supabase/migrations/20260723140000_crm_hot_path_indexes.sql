-- Índices alinhados aos filtros, ordenações e paginação das telas mais usadas.

-- Lista principal e listas por categoria: somente leads ativos, mais recentes primeiro.
create index if not exists idx_leads_active_updated_at
  on crm.leads (updated_at desc)
  where excluded_from_pipeline_at is null;

create index if not exists idx_leads_active_category_updated_at
  on crm.leads (client_category, updated_at desc)
  where excluded_from_pipeline_at is null;

-- Pipeline geral e filtro por responsável.
create index if not exists idx_opportunities_updated_at
  on crm.opportunities (updated_at desc);

create index if not exists idx_opportunities_owner_updated_at
  on crm.opportunities (owner_id, updated_at desc)
  where owner_id is not null;

-- Painel de tarefas do lead e agenda global de tarefas abertas.
create index if not exists idx_tasks_lead_done_due_at
  on crm.tasks (lead_id, done, due_at)
  where lead_id is not null;

create index if not exists idx_tasks_open_due_at
  on crm.tasks (due_at)
  where done = false;

-- Timeline do lead.
create index if not exists idx_notes_lead_created_at
  on crm.notes (lead_id, created_at desc)
  where lead_id is not null;

-- Dashboard: mensagens recentes são filtradas primeiro por data.
create index if not exists idx_messages_sent_at
  on crm.messages (sent_at desc, conversation_id);

-- Lista e KPI de amostras pendentes.
create index if not exists idx_sample_shipments_created_at
  on crm.sample_shipments (created_at desc);

create index if not exists idx_sample_shipments_not_sent
  on crm.sample_shipments (status)
  where status <> 'ENVIADO';

analyze crm.leads;
analyze crm.opportunities;
analyze crm.tasks;
analyze crm.notes;
analyze crm.messages;
analyze crm.sample_shipments;
