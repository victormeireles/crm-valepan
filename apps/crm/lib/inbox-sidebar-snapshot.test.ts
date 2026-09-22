import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const sql = (file: string) =>
  readFileSync(fileURLToPath(new URL(`../supabase/migrations/${file}`, import.meta.url)), "utf8");

let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key, raw_user_meta_data jsonb, email text);
    create function auth.uid() returns uuid language sql stable as
      'select nullif(current_setting(''request.jwt.claim.sub'', true), '''')::uuid';
  `);
  await db.exec(sql("20260416120000_init_crm_schema.sql").replace('create extension if not exists "pgcrypto";', ""));
  await db.exec(sql("20260424160000_lead_client_category.sql"));
  await db.exec(sql("20260428114500_contacts_avatar_url.sql"));
  await db.exec(sql("20260430113500_leads_chat_qualification_fields.sql"));
  await db.exec(sql("20260430115000_conversations_group_kind.sql"));
  await db.exec(`
    alter table crm.conversations add column if not exists last_read_at timestamptz;
    alter table crm.conversations add column if not exists classification text;
    alter table crm.conversations add column if not exists group_display_name text;
    alter table crm.conversations add column if not exists last_message_at timestamptz;
    alter table crm.conversations add column if not exists last_direction text;
    alter table crm.leads add column if not exists excluded_from_pipeline_at timestamptz;
    alter table crm.leads add column if not exists excluded_reason text;
    alter table crm.leads add column if not exists excluded_by uuid;
    alter table crm.messages add column if not exists event_kind text;
    alter table crm.messages add column if not exists event_status text;
    create or replace function crm.phone_search_digits(p_value text)
    returns text language sql immutable parallel safe security invoker
    set search_path = crm, public
    as $$ select regexp_replace(coalesce(p_value, ''), '\\D', '', 'g'); $$;
    update crm.pipeline_stages set name = 'LEADS' where name = 'Lead novo';
    update crm.pipeline_stages set name = 'QUALIFICAÇÃO' where name = 'Qualificação';
    update crm.pipeline_stages set name = 'NEGOCIAÇÃO' where name = 'Negociação';
    update crm.pipeline_stages set name = 'CONVERTIDO' where name = 'Convertido';
    update crm.pipeline_stages set name = 'PERDIDO' where name = 'Perdido';
  `);
  await db.exec(sql("20260919190000_inbox_sidebar_snapshot_page_first.sql"));
  await db.exec(sql("20260922180000_inbox_lists_by_stage.sql"));

  await db.exec(`
    insert into crm.contacts(full_name, phone_e164) values ('Ana Qualificar', '+5511111111111');
    insert into crm.leads(phone_e164, contact_id, client_category)
      select '+5511111111111', id, 'hamburgueria' from crm.contacts where phone_e164 = '+5511111111111';
    insert into crm.opportunities(lead_id, stage_id, title, updated_at)
      select lead.id, stage.id, 'Qualify', '2026-09-18T12:00:00Z'
      from crm.leads lead
      cross join crm.pipeline_stages stage
      where lead.phone_e164 = '+5511111111111' and stage.name = 'LEADS';
    insert into crm.conversations(lead_id, phone_e164, conversation_kind, last_message_at, last_direction)
      select id, phone_e164, 'lead', '2026-09-19T12:00:00Z', 'in' from crm.leads where phone_e164 = '+5511111111111';
    insert into crm.messages(conversation_id, direction, body, sent_at)
      select id, 'in', 'oi antigo', '2026-09-19T10:00:00Z' from crm.conversations where phone_e164 = '+5511111111111';
    insert into crm.messages(conversation_id, direction, body, sent_at)
      select id, 'in', 'ultima qualify', '2026-09-19T12:00:00Z' from crm.conversations where phone_e164 = '+5511111111111';

    insert into crm.leads(phone_e164, excluded_from_pipeline_at) values ('+5511111111112', '2026-09-18T00:00:00Z');
    insert into crm.conversations(lead_id, phone_e164, conversation_kind, last_message_at, last_direction)
      select id, phone_e164, 'lead', '2026-09-19T11:00:00Z', 'in' from crm.leads where phone_e164 = '+5511111111112';
    insert into crm.messages(conversation_id, direction, body, sent_at)
      select id, 'in', 'ultima archived', '2026-09-19T11:00:00Z' from crm.conversations where phone_e164 = '+5511111111112';

    insert into crm.leads(phone_e164) values ('+5511111111113');
    insert into crm.opportunities(lead_id, stage_id, title, updated_at)
      select lead.id, stage.id, 'Pipeline', '2026-09-18T12:00:00Z'
      from crm.leads lead
      cross join crm.pipeline_stages stage
      where lead.phone_e164 = '+5511111111113' and stage.name = 'NEGOCIAÇÃO';
    insert into crm.conversations(lead_id, phone_e164, conversation_kind, last_message_at, last_direction)
      select id, phone_e164, 'lead', '2026-09-19T13:00:00Z', 'out' from crm.leads where phone_e164 = '+5511111111113';
    insert into crm.messages(conversation_id, direction, body, sent_at)
      select id, 'out', 'ultima pipeline', '2026-09-19T13:00:00Z' from crm.conversations where phone_e164 = '+5511111111113';

    insert into crm.conversations(lead_id, phone_e164, conversation_kind, group_display_name, last_message_at, last_direction)
      values
        (null, '+5522222222221', 'group', 'Grupo antigo', '2026-09-19T09:00:00Z', 'in'),
        (null, '+5522222222222', 'group', 'Grupo novo', '2026-09-19T14:00:00Z', 'in');
    insert into crm.messages(conversation_id, direction, body, sent_at)
      select id, 'in', 'preview grupo antigo', '2026-09-19T09:00:00Z' from crm.conversations where phone_e164 = '+5522222222221';
    insert into crm.messages(conversation_id, direction, body, sent_at)
      select id, 'in', 'preview grupo novo', '2026-09-19T14:00:00Z' from crm.conversations where phone_e164 = '+5522222222222';

    insert into crm.leads(phone_e164) values ('+5511111111114');
    insert into crm.opportunities(lead_id, stage_id, title, updated_at)
      select lead.id, stage.id, 'Perdido', '2026-09-18T12:00:00Z'
      from crm.leads lead
      cross join crm.pipeline_stages stage
      where lead.phone_e164 = '+5511111111114' and stage.name = 'PERDIDO';
    insert into crm.conversations(lead_id, phone_e164, conversation_kind, last_message_at, last_direction)
      select id, phone_e164, 'lead', '2026-09-19T10:30:00Z', 'in' from crm.leads where phone_e164 = '+5511111111114';
    insert into crm.messages(conversation_id, direction, body, sent_at)
      select id, 'in', 'ultima perdido', '2026-09-19T10:30:00Z' from crm.conversations where phone_e164 = '+5511111111114';

    insert into crm.leads(phone_e164) values ('+5511111111115');
    insert into crm.opportunities(lead_id, stage_id, title, updated_at)
      select lead.id, stage.id, 'Cliente', '2026-09-18T12:00:00Z'
      from crm.leads lead
      cross join crm.pipeline_stages stage
      where lead.phone_e164 = '+5511111111115' and stage.name = 'CONVERTIDO';
    insert into crm.conversations(lead_id, phone_e164, conversation_kind, classification, last_message_at, last_direction)
      select id, phone_e164, 'lead', 'CLIENTE', '2026-09-19T15:00:00Z', 'out' from crm.leads where phone_e164 = '+5511111111115';
    insert into crm.messages(conversation_id, direction, body, sent_at)
      select id, 'out', 'ultima cliente', '2026-09-19T15:00:00Z' from crm.conversations where phone_e164 = '+5511111111115';
  `);
}, 30000);

afterAll(async () => {
  await db?.close();
});

describe("inbox_sidebar_snapshot", () => {
  it("mantém o preview da última mensagem só da página da aba", async () => {
    const groups = await db.query<{
      group_display_name: string | null;
      last_body_preview: string | null;
      groups_count: number;
      novos_count: number;
      leads_count: number;
      clientes_count: number;
      perdidos_count: number;
      tab_total: number;
    }>(
      `select group_display_name, last_body_preview, groups_count, novos_count, leads_count, clientes_count, perdidos_count, tab_total
       from crm.inbox_sidebar_snapshot('2026-08-01T03:00:00Z', 'groups', 0, 20, null)`,
    );

    expect(groups.rows.filter((row) => row.group_display_name).map((row) => ({
      name: row.group_display_name,
      preview: row.last_body_preview,
    }))).toEqual([
      { name: "Grupo novo", preview: "preview grupo novo" },
      { name: "Grupo antigo", preview: "preview grupo antigo" },
    ]);
    expect(groups.rows[0]).toMatchObject({
      groups_count: 2,
      novos_count: 1,
      leads_count: 1,
      clientes_count: 2,
      perdidos_count: 1,
      tab_total: 2,
    });

    const novos = await db.query<{ last_body_preview: string | null }>(
      `select last_body_preview from crm.inbox_sidebar_snapshot('2026-08-01T03:00:00Z', 'novos', 0, 20, null)
       where conversation_id is not null`,
    );
    expect(novos.rows).toEqual([{ last_body_preview: "ultima qualify" }]);

    const leads = await db.query<{ last_body_preview: string | null }>(
      `select last_body_preview from crm.inbox_sidebar_snapshot('2026-08-01T03:00:00Z', 'leads', 0, 20, null)
       where conversation_id is not null`,
    );
    expect(leads.rows).toEqual([{ last_body_preview: "ultima pipeline" }]);

    const clientes = await db.query<{ last_body_preview: string | null }>(
      `select last_body_preview from crm.inbox_sidebar_snapshot('2026-08-01T03:00:00Z', 'clientes', 0, 20, null)
       where conversation_id is not null`,
    );
    expect(clientes.rows).toEqual([
      { last_body_preview: "ultima cliente" },
      { last_body_preview: "ultima archived" },
    ]);

    const perdidos = await db.query<{ last_body_preview: string | null }>(
      `select last_body_preview from crm.inbox_sidebar_snapshot('2026-08-01T03:00:00Z', 'perdidos', 0, 20, null)
       where conversation_id is not null`,
    );
    expect(perdidos.rows).toEqual([{ last_body_preview: "ultima perdido" }]);

    await db.exec(sql("20260922180000_inbox_lists_by_stage.sql"));
    const reclassified = await db.query<{
      status: string;
      excluded_from_pipeline_at: string | null;
      classification: string | null;
      stage_name: string | null;
    }>(`
      select lead.status, lead.excluded_from_pipeline_at, conversation.classification, stage.name as stage_name
      from crm.leads lead
      join crm.conversations conversation on conversation.lead_id = lead.id
      left join crm.opportunities opportunity on opportunity.lead_id = lead.id
      left join crm.pipeline_stages stage on stage.id = opportunity.stage_id
      where lead.phone_e164 = '+5511111111112'
    `);
    expect(reclassified.rows).toEqual([{
      status: "cliente",
      excluded_from_pipeline_at: null,
      classification: "CLIENTE",
      stage_name: "CONVERTIDO",
    }]);
  });
});
