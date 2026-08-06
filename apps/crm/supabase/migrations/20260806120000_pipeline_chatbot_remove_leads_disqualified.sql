-- Substitui opções legadas por CHATBOT na classificação do funil.

begin;

insert into crm.pipeline_stages (name, sort_order, is_final)
select 'CHATBOT', 5, false
where not exists (
  select 1 from crm.pipeline_stages where name = 'CHATBOT'
);

update crm.pipeline_stages
set sort_order = 5, is_final = false
where name = 'CHATBOT';

-- Leads que ainda estejam na etapa legada voltam para a entrada ativa.
update crm.opportunities o
set
  stage_id = coalesce(
    (select id from crm.pipeline_stages where name = 'ENTRADA' limit 1),
    (select id from crm.pipeline_stages where name = 'CHATBOT' limit 1)
  ),
  updated_at = now()
where o.stage_id in (
  select id from crm.pipeline_stages where name = 'LEADS'
);

-- Mantém o histórico e o motivo dos desqualificados usando o resultado PERDIDO.
update crm.opportunities o
set
  stage_id = (select id from crm.pipeline_stages where name = 'PERDIDO' limit 1),
  lost_reason = coalesce(o.lost_reason, 'Desqualificado'),
  updated_at = now()
where o.stage_id in (
  select id from crm.pipeline_stages where name = 'DESQUALIFICADO'
)
and exists (
  select 1 from crm.pipeline_stages where name = 'PERDIDO'
);

delete from crm.pipeline_stages
where name in ('LEADS', 'DESQUALIFICADO');

commit;
