-- Keep the CRM's authenticated SELECT contract while applying lead visibility.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

ALTER VIEW crm.v_conversation_last_message SET (security_invoker = true);
ALTER VIEW crm.v_lead_last_message SET (security_invoker = true);

-- Some timeline source tables have broad authenticated policies. Filter the
-- complete union by the same lead predicate used by crm.leads and conversations.
CREATE OR REPLACE VIEW crm.timeline_events WITH (security_invoker = true) AS
SELECT e.kind, e.event_id, e.at, e.lead_id, e.opportunity_id, e.data
FROM (
  SELECT
    'message'::text AS kind,
    m.id AS event_id,
    m.sent_at AS at,
    l.id AS lead_id,
    (
      SELECT o.id FROM crm.opportunities o
      WHERE o.lead_id = l.id ORDER BY o.updated_at DESC LIMIT 1
    ) AS opportunity_id,
    jsonb_build_object(
      'direction', m.direction, 'body', m.body, 'conversation_id', m.conversation_id
    ) AS data
  FROM crm.messages m
  JOIN crm.conversations c ON c.id = m.conversation_id
  JOIN crm.leads l ON l.id = c.lead_id
  UNION ALL
  SELECT
    'note'::text, n.id, n.created_at, n.lead_id, n.opportunity_id,
    jsonb_build_object('body', n.body, 'author_id', n.author_id)
  FROM crm.notes n
  WHERE n.lead_id IS NOT NULL
  UNION ALL
  SELECT
    'task'::text, t.id, t.created_at, t.lead_id, t.opportunity_id,
    jsonb_build_object(
      'title', t.title, 'due_at', t.due_at, 'done', t.done,
      'task_kind', t.task_kind, 'completed_at', t.completed_at
    )
  FROM crm.tasks t
  WHERE t.lead_id IS NOT NULL
  UNION ALL
  SELECT
    'sample'::text, s.id, s.created_at, s.lead_id,
    (
      SELECT o.id FROM crm.opportunities o
      WHERE o.lead_id = s.lead_id ORDER BY o.updated_at DESC LIMIT 1
    ) AS opportunity_id,
    jsonb_build_object(
      'status', s.status, 'contact_name', s.contact_name, 'bread_type', s.bread_type
    ) AS data
  FROM crm.sample_shipments s
  WHERE s.lead_id IS NOT NULL
  UNION ALL
  SELECT
    'activity'::text, a.id, a.created_at,
    COALESCE(CASE WHEN a.entity_type = 'lead' THEN a.entity_id END, opp_entity.lead_id) AS lead_id,
    CASE
      WHEN a.entity_type = 'opportunity' THEN a.entity_id
      WHEN a.entity_type = 'lead' THEN opp_lead.id
      ELSE NULL
    END AS opportunity_id,
    jsonb_build_object(
      'action', a.action, 'entity_type', a.entity_type, 'entity_id', a.entity_id,
      'payload', a.payload, 'actor_id', a.actor_id, 'actor_name', prof.full_name
    ) AS data
  FROM crm.activity_logs a
  LEFT JOIN crm.opportunities opp_entity
    ON a.entity_type = 'opportunity' AND opp_entity.id = a.entity_id
  LEFT JOIN LATERAL (
    SELECT o.id FROM crm.opportunities o
    WHERE o.lead_id = a.entity_id ORDER BY o.updated_at DESC LIMIT 1
  ) opp_lead ON a.entity_type = 'lead'
  LEFT JOIN crm.profiles prof ON prof.id = a.actor_id
  WHERE a.action NOT IN (
    'note_added', 'follow_up_scheduled', 'outbound_whatsapp',
    'outbound_whatsapp_contact', 'outbound_whatsapp_attachment'
  )
  AND COALESCE(CASE WHEN a.entity_type = 'lead' THEN a.entity_id END, opp_entity.lead_id) IS NOT NULL
) e
WHERE crm.can_view_flavia_sales_lead(e.lead_id);

-- CREATE OR REPLACE VIEW retains existing grants, but assert the CRM contract.
DO $check$
BEGIN
  IF NOT has_table_privilege('authenticated', 'crm.timeline_events', 'SELECT')
    OR NOT has_table_privilege('authenticated', 'crm.v_conversation_last_message', 'SELECT')
    OR NOT has_table_privilege('authenticated', 'crm.v_lead_last_message', 'SELECT') THEN
    RAISE EXCEPTION 'CRM view SELECT contract missing';
  END IF;
END
$check$;
COMMIT;
