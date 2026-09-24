import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const migration = (file: string) =>
  readFileSync(fileURLToPath(new URL(`../../supabase/migrations/${file}`, import.meta.url)), "utf8");

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
  await db.exec(
    migration("20260416120000_init_crm_schema.sql")
      .replace('create extension if not exists "pgcrypto";', ""),
  );
  await db.exec(migration("20260416120200_leads_phone_unique.sql"));
  await db.exec(migration("20260422180000_zapi_lid_map.sql"));
  await db.exec(migration("20260423121000_grants_zapi_lid_map.sql"));
  await db.exec(migration("20260430115000_conversations_group_kind.sql"));
  await db.exec(migration("20260813180000_message_interactions_phase_three.sql"));
  await db.exec(migration("20260924170000_grant_message_favorites_access.sql"));

  await db.exec(`
    insert into crm.contacts (id, full_name, phone_e164) values
      ('00000000-0000-0000-0000-000000000101', 'Contato LID duplicado', 'lid:2100457140361'),
      ('00000000-0000-0000-0000-000000000102', 'Contato real', '+5521992595914'),
      ('00000000-0000-0000-0000-000000000103', 'Somente LID', 'lid:1234567890123');

    insert into crm.leads (id, phone_e164, contact_id) values
      ('00000000-0000-0000-0000-000000000201', 'lid:2100457140361', '00000000-0000-0000-0000-000000000101'),
      ('00000000-0000-0000-0000-000000000202', '+5521992595914', '00000000-0000-0000-0000-000000000102'),
      ('00000000-0000-0000-0000-000000000203', 'lid:1234567890123', '00000000-0000-0000-0000-000000000103');

    insert into crm.conversations (id, lead_id, phone_e164) values
      ('00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000201', 'lid:2100457140361'),
      ('00000000-0000-0000-0000-000000000302', '00000000-0000-0000-0000-000000000202', '+5521992595914'),
      ('00000000-0000-0000-0000-000000000303', '00000000-0000-0000-0000-000000000203', 'lid:1234567890123');

    insert into crm.messages (conversation_id, direction, body) values
      ('00000000-0000-0000-0000-000000000301', 'out', 'Mensagem enviada'),
      ('00000000-0000-0000-0000-000000000302', 'in', 'Mensagem recebida'),
      ('00000000-0000-0000-0000-000000000303', 'out', 'Mensagem antes da identificação');

    insert into crm.zapi_lid_map (lid_key, phone_e164) values
      ('lid:2100457140361', '+5521992595914'),
      ('lid:1234567890123', '+5521988887777');
  `);

  await db.exec(migration("20260924180000_merge_zapi_lid_conversations_and_grant_favorites.sql"));
}, 30_000);

afterAll(async () => {
  await db?.close();
});

describe("merge_zapi_lid_identity", () => {
  it("moves messages from a duplicate LID conversation to the real phone", async () => {
    const conversations = await db.query<{ phone_e164: string }>(`
      select phone_e164
      from crm.conversations
      where phone_e164 in ('lid:2100457140361', '+5521992595914')
      order by phone_e164
    `);
    expect(conversations.rows).toEqual([{ phone_e164: "+5521992595914" }]);

    const messages = await db.query<{ body: string | null }>(`
      select message.body
      from crm.messages message
      join crm.conversations conversation on conversation.id = message.conversation_id
      where conversation.phone_e164 = '+5521992595914'
      order by message.body
    `);
    expect(messages.rows).toEqual([
      { body: "Mensagem enviada" },
      { body: "Mensagem recebida" },
    ]);
  });

  it("renames the existing lead and conversation when no real identity exists", async () => {
    const identity = await db.query<{
      lead_phone: string;
      conversation_phone: string;
      contact_phone: string;
      body: string | null;
    }>(`
      select
        lead.phone_e164 as lead_phone,
        conversation.phone_e164 as conversation_phone,
        contact.phone_e164 as contact_phone,
        message.body
      from crm.leads lead
      join crm.contacts contact on contact.id = lead.contact_id
      join crm.conversations conversation on conversation.lead_id = lead.id
      join crm.messages message on message.conversation_id = conversation.id
      where lead.id = '00000000-0000-0000-0000-000000000203'
    `);
    expect(identity.rows).toEqual([{
      lead_phone: "+5521988887777",
      conversation_phone: "+5521988887777",
      contact_phone: "+5521988887777",
      body: "Mensagem antes da identificação",
    }]);
  });
});
