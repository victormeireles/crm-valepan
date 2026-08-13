-- O cadastro da tela Leads usa o status "em negociação", separado da
-- classificação da conversa. Corrige registros existentes desse caminho.

begin;

update crm.opportunities o
set
  stage_id = negotiation.id,
  updated_at = now()
from crm.pipeline_stages negotiation
join crm.leads l on true
where upper(trim(negotiation.name)) = 'NEGOCIAÇÃO'
  and l.id = o.lead_id
  and lower(trim(l.status)) = 'em negociação'
  and o.stage_id <> negotiation.id;

commit;
