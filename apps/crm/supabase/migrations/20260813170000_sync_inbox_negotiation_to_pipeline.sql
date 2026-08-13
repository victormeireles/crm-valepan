-- Corrige oportunidades cuja conversa já está classificada como NEGOCIAÇÃO,
-- mas que permaneceram na etapa anterior porque o inbox atualizava apenas a conversa.

begin;

update crm.opportunities o
set
  stage_id = negotiation.id,
  updated_at = now()
from crm.pipeline_stages negotiation
where upper(trim(negotiation.name)) = 'NEGOCIAÇÃO'
  and o.stage_id <> negotiation.id
  and exists (
    select 1
    from crm.conversations c
    where c.lead_id = o.lead_id
      and upper(trim(c.classification)) = 'NEGOCIAÇÃO'
  );

commit;
