import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const ACTOR_ID = "00000000-0000-0000-0000-000000000001";
const sql = (file: string) => readFileSync(
  fileURLToPath(new URL(`../supabase/migrations/${file}`, import.meta.url)),
  "utf8",
);

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
  await db.exec(sql("20260416120000_init_crm_schema.sql")
    .replace('create extension if not exists "pgcrypto";', ""));
  await db.exec(`
    update crm.pipeline_stages set name = 'LEADS' where name = 'Lead novo';
    insert into auth.users(id, email) values ('${ACTOR_ID}', 'vendedor@example.com');

    insert into crm.leads(phone_e164) values ('+5522992374109');
    insert into crm.opportunities(lead_id, stage_id, title, updated_at)
      select lead.id, stage.id, 'Historico sem responsavel', '2026-09-07T14:59:16Z'
      from crm.leads lead
      cross join crm.pipeline_stages stage
      where lead.phone_e164 = '+5522992374109'
        and stage.name = 'Negociação';
    insert into crm.activity_logs(entity_type, entity_id, action, actor_id)
      select 'opportunity', opportunity.id, 'stage_changed', '${ACTOR_ID}'
      from crm.opportunities opportunity
      where opportunity.title = 'Historico sem responsavel';
  `);
  await db.exec(sql("20260910200000_assign_classified_pipeline_owners.sql"));
}, 30000);

afterAll(async () => {
  await db?.close();
});

describe.sequential("responsavel de oportunidades classificadas", () => {
  it("repara um card historico usando o autor da movimentacao", async () => {
    const result = await db.query<{
      lead_owner_id: string;
      opportunity_owner_id: string;
      opportunity_updated_at: Date;
    }>(`
      select lead.owner_id lead_owner_id, opportunity.owner_id opportunity_owner_id,
        opportunity.updated_at opportunity_updated_at
      from crm.leads lead
      inner join crm.opportunities opportunity on opportunity.lead_id = lead.id
      where lead.phone_e164 = '+5522992374109'
    `);

    expect(result.rows[0]).toEqual({
      lead_owner_id: ACTOR_ID,
      opportunity_owner_id: ACTOR_ID,
      opportunity_updated_at: new Date("2026-09-07T14:59:16Z"),
    });
  });

  it("atribui novos cards ao usuario que os move para fora da entrada", async () => {
    await db.exec(`
      insert into crm.leads(phone_e164) values ('+5531999999999');
      insert into crm.opportunities(lead_id, stage_id, title)
        select lead.id, stage.id, 'Movimento atual'
        from crm.leads lead
        cross join crm.pipeline_stages stage
        where lead.phone_e164 = '+5531999999999'
          and stage.name = 'LEADS';
      set request.jwt.claim.sub = '${ACTOR_ID}';
      update crm.opportunities
      set stage_id = (select id from crm.pipeline_stages where name = 'Negociação')
      where title = 'Movimento atual';
      reset request.jwt.claim.sub;
    `);

    const result = await db.query<{ lead_owner_id: string; opportunity_owner_id: string }>(`
      select lead.owner_id lead_owner_id, opportunity.owner_id opportunity_owner_id
      from crm.leads lead
      inner join crm.opportunities opportunity on opportunity.lead_id = lead.id
      where lead.phone_e164 = '+5531999999999'
    `);

    expect(result.rows[0]).toEqual({
      lead_owner_id: ACTOR_ID,
      opportunity_owner_id: ACTOR_ID,
    });
  });
});
