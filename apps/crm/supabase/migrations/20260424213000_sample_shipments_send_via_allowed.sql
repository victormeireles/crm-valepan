-- Opções fixas para envio (MAIÚSCULAS)
alter table crm.sample_shipments
  drop constraint if exists sample_shipments_send_via_allowed;

update crm.sample_shipments
set send_via = null
where send_via is not null
  and send_via not in (
    'CACHINHOS',
    'DELOVA',
    'KOUTO',
    'LOUCOS',
    'MR',
    'NEW SPACE',
    'NOE',
    'TOP ALTO'
  );

alter table crm.sample_shipments
  add constraint sample_shipments_send_via_allowed
  check (
    send_via is null
    or send_via in (
      'CACHINHOS',
      'DELOVA',
      'KOUTO',
      'LOUCOS',
      'MR',
      'NEW SPACE',
      'NOE',
      'TOP ALTO'
    )
  );
