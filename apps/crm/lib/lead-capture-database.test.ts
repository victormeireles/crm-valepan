import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Executa as migrations reais em PostgreSQL embarcado, sem acessar o CRM remoto.
const sql = (file: string) => readFileSync(fileURLToPath(new URL(`../supabase/migrations/${file}`, import.meta.url)), "utf8");
let db: PGlite;
const capture = (phone = "+5511987654321", category = "hamburgueria", document: string | null = null) => db.query(
  "select crm.register_public_lead($1,$2,$3,$4,$5,$6,$7,$8)",
  ["ifood_event", "Ana Souza", phone, category, "01310100", "a".repeat(64), "2026-09-07", document],
);
const count = async (table: string) => Number((await db.query<{ n: number }>(`select count(*)::int n from crm.${table}`)).rows[0].n);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key, raw_user_meta_data jsonb, email text);
    create function auth.uid() returns uuid language sql stable as
      'select nullif(current_setting(''request.jwt.claim.sub'', true), '''')::uuid';
  `);
  await db.exec(sql("20260416120000_init_crm_schema.sql").replace('create extension if not exists "pgcrypto";', ""));
  await db.exec(sql("20260416120200_leads_phone_unique.sql"));
  await db.exec(sql("20260424160000_lead_client_category.sql"));
  await db.exec(sql("20260428160000_leads_network_type.sql"));
  await db.exec(sql("20260430113500_leads_chat_qualification_fields.sql"));
  await db.exec(`
    alter table crm.leads add column excluded_from_pipeline_at timestamptz;
    create unique index opportunities_one_per_lead on crm.opportunities(lead_id) where lead_id is not null;
    update crm.pipeline_stages set name = 'LEADS' where name = 'Lead novo';
    create view crm.v_conversation_last_message as
      select c.lead_id, c.id conversation_id, m.direction last_direction, m.sent_at last_sent_at
      from crm.conversations c join crm.messages m on m.conversation_id = c.id;
  `);
  await db.exec(sql("20260902170000_restrict_seller_lead_visibility.sql"));
  await db.exec(sql("20260907120000_public_lead_registration.sql"));
  await db.exec(sql("20260907121000_pipeline_public_registrations.sql"));
  await db.exec(sql("20260908120000_public_lead_cpf_cnpj.sql"));
}, 30000);
afterAll(async () => { await db?.close(); });

describe.sequential("gravação pública transacional", () => {
  it("cria contato, lead, oportunidade, campanha e histórico, incluindo o CEP", async () => {
    await capture();
    expect(await count("leads")).toBe(1);
    expect(await count("contacts")).toBe(1);
    expect(await count("opportunities")).toBe(1);
    expect(await count("lead_registrations")).toBe(1);
    expect(await count("activity_logs")).toBe(1);
    const lead = (await db.query("select source, zip_code, client_category, owner_id from crm.leads")).rows[0];
    expect(lead).toMatchObject({ source: "ifood_event", zip_code: "01310100", client_category: "hamburgueria", owner_id: null });
  });
  it("reenvio e chamadas simultâneas não duplicam cadastro ou histórico", async () => {
    await Promise.all([capture(), capture(), capture()]);
    expect(await count("leads")).toBe(1);
    expect(await count("contacts")).toBe(1);
    expect(await count("opportunities")).toBe(1);
    expect(await count("lead_registrations")).toBe(1);
    expect(await count("activity_logs")).toBe(1);
  });
  it("lead sem WhatsApp aparece no funil sem sinais falsos de mensagem", async () => {
    const cards = await db.query("select * from crm.pipeline_filtered_cards(now() - interval '1 year')");
    expect(cards.rows).toHaveLength(1);
    expect(cards.rows[0]).toMatchObject({ conversation_id: null, last_direction: null, last_sent_at: null });
    expect((await db.query("select * from crm.pipeline_filtered_cards(now() - interval '1 year', null, 'awaiting_reply')")).rows).toHaveLength(0);
    expect((await db.query("select * from crm.pipeline_filtered_cards(now() - interval '1 year', null, null, null, 'distribuidor')")).rows).toHaveLength(0);
  });
  it("preserva dados comerciais e etapa de quem já existe, registrando a participação", async () => {
    await db.exec(`
      insert into crm.contacts(phone_e164, full_name) values ('+5521987654321', 'Nome já confirmado');
      insert into crm.leads(phone_e164, source, contact_id, client_category, zip_code, status)
        select phone_e164, 'whatsapp', id, 'distribuidor', '20040002', 'cliente' from crm.contacts where phone_e164 = '+5521987654321';
      insert into crm.opportunities(lead_id, stage_id, title)
        select l.id, ps.id, 'Negociação existente' from crm.leads l cross join crm.pipeline_stages ps
        where l.phone_e164 = '+5521987654321' and ps.name = 'Negociação';
    `);
    await capture("+5521987654321");
    const record = (await db.query(`select l.source, l.status, l.zip_code, l.client_category, c.full_name, ps.name stage
      from crm.leads l join crm.contacts c on c.id = l.contact_id join crm.opportunities o on o.lead_id = l.id
      join crm.pipeline_stages ps on ps.id = o.stage_id where l.phone_e164 = '+5521987654321'`)).rows[0];
    expect(record).toMatchObject({ source: "whatsapp", status: "cliente", zip_code: "20040002", client_category: "distribuidor", full_name: "Nome já confirmado", stage: "Negociação" });
    expect(await count("lead_registrations")).toBe(2);
    const registrations = await db.query("select full_name, client_category, zip_code from crm.lead_registrations where phone_e164 = '+5521987654321'");
    expect(registrations.rows[0]).toMatchObject({ full_name: "Ana Souza", client_category: "hamburgueria", zip_code: "01310100" });
  });
  it("salva distribuidores como leads de distribuição", async () => {
    await capture("+5531987654321", "distribuidor");
    expect((await db.query("select * from crm.pipeline_filtered_cards(now() - interval '1 year', null, null, null, 'distribuidor')")).rows).toHaveLength(2);
  });
  it("não reabre contatos arquivados", async () => {
    await db.exec("insert into crm.leads(phone_e164, excluded_from_pipeline_at) values ('+5541987654321', now())");
    await capture("+5541987654321");
    const rows = await db.query("select * from crm.pipeline_filtered_cards(now() - interval '1 year') where phone_e164 = '+5541987654321'");
    expect(rows.rows).toHaveLength(0);
    expect((await db.query("select * from crm.opportunities where lead_id = (select id from crm.leads where phone_e164 = '+5541987654321')")).rows).toHaveLength(0);
  });
  it("falha intermediária desfaz todas as gravações", async () => {
    const initial = await count("contacts");
    await db.exec("update crm.pipeline_stages set name = 'Entrada indisponível' where name = 'LEADS'");
    await expect(capture("+5561987654321")).rejects.toThrow("entry_stage_not_configured");
    expect(await count("contacts")).toBe(initial);
    expect((await db.query("select id from crm.leads where phone_e164 = '+5561987654321'")).rows).toHaveLength(0);
    await db.exec("update crm.pipeline_stages set name = 'LEADS' where name = 'Entrada indisponível'");
  });
  it("anônimos e vendedores não podem chamar a função de gravação nem ler a tabela de limite", async () => {
    const permissions = (await db.query(`select
      has_function_privilege('anon', 'crm.register_public_lead(text,text,text,text,text,text,text)', 'execute') anon_execute,
      has_function_privilege('authenticated', 'crm.register_public_lead(text,text,text,text,text,text,text)', 'execute') seller_execute,
      has_function_privilege('anon', 'crm.register_public_lead(text,text,text,text,text,text,text,text)', 'execute') anon_document_execute,
      has_function_privilege('authenticated', 'crm.register_public_lead(text,text,text,text,text,text,text,text)', 'execute') seller_document_execute,
      has_function_privilege('service_role', 'crm.register_public_lead(text,text,text,text,text,text,text,text)', 'execute') service_document_execute,
      has_table_privilege('anon', 'crm.lead_registrations', 'select') anon_read,
      has_table_privilege('authenticated', 'crm.lead_registration_rate_limits', 'select') seller_rate_read
    `)).rows[0];
    expect(permissions).toEqual({ anon_execute: false, seller_execute: false, anon_document_execute: false, seller_document_execute: false, service_document_execute: true, anon_read: false, seller_rate_read: false });
  });
  it("participações seguem a visibilidade dos leads para a equipe", async () => {
    await db.exec("set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001'; set role authenticated");
    try {
      const registrations = await db.query("select phone_e164 from crm.lead_registrations order by phone_e164");
      expect(registrations.rows).toEqual([{ phone_e164: "+5511987654321" }, { phone_e164: "+5531987654321" }]);
    } finally { await db.exec("reset role"); }
  });
  it("salva CPF normalizado, preserva o primeiro valor e não o expõe no histórico geral", async () => {
    const initialLeads = await count("leads");
    const result = await capture("+5511987654321", "hamburgueria", "529.982.247-25");
    expect(result.rows[0]).toEqual({ register_public_lead: { ok: true } });
    await capture("+5511987654321", "hamburgueria", "11.222.333/0001-81");
    await capture("+5511987654321", "hamburgueria", null);
    expect((await db.query("select cpf_cnpj from crm.lead_registrations where phone_e164 = '+5511987654321'")).rows[0]).toEqual({ cpf_cnpj: "52998224725" });
    expect(await count("leads")).toBe(initialLeads);
    const history = JSON.stringify((await db.query("select * from crm.activity_logs")).rows);
    expect(history).not.toContain("52998224725");
    expect(history).not.toContain("529.982.247-25");
  });
  it.each([
    ["+5521987654321", "11.222.333/0001-81", "11222333000181"],
    ["+5531987654321", "12.abc.345/01de-35", "12ABC34501DE35"],
  ])("salva CNPJ numérico ou alfanumérico: %s", async (phone, document, normalized) => {
    await capture(phone, "distribuidor", document);
    expect((await db.query("select cpf_cnpj from crm.lead_registrations where phone_e164 = $1", [phone])).rows[0]).toEqual({ cpf_cnpj: normalized });
  });
  it("permite cadastro sem documento e mantém a chamada anterior compatível", async () => {
    await capture("+5541987654321", "hamburgueria", "  ");
    expect((await db.query("select cpf_cnpj from crm.lead_registrations where phone_e164 = '+5541987654321'")).rows[0]).toEqual({ cpf_cnpj: null });
    const result = await db.query("select crm.register_public_lead($1,$2,$3,$4,$5,$6,$7)", ["ifood_event", "Ana Souza", "+5541987654321", "hamburgueria", "01310100", "a".repeat(64), "2026-09-07"]);
    expect(result.rows[0]).toEqual({ register_public_lead: { ok: true } });
  });
  it.each(["52998224726", "11222333000180", "12ABC34501DE34", "00000000000", "00000000000000", "123"])("rejeita documento inválido sem criar lead: %s", async (document) => {
    const initialContacts = await count("contacts");
    await expect(capture("+5561987654321", "hamburgueria", document)).rejects.toThrow("invalid_cpf_cnpj");
    expect(await count("contacts")).toBe(initialContacts);
    expect((await db.query("select id from crm.leads where phone_e164 = '+5561987654321'")).rows).toHaveLength(0);
  });
  it("a restrição do banco impede documento inválido mesmo fora do formulário", async () => {
    await expect(db.exec("update crm.lead_registrations set cpf_cnpj = '52998224726' where phone_e164 = '+5511987654321'")).rejects.toThrow();
  });
  it("bloqueia excesso de envios sem gravar um lead adicional", async () => {
    await db.exec("update crm.lead_registration_rate_limits set requests = 120 where bucket = date_trunc('minute', now())");
    await expect(capture("+5571987654321")).rejects.toThrow("registration_rate_limit");
    expect((await db.query("select id from crm.leads where phone_e164 = '+5571987654321'")).rows).toHaveLength(0);
  });
});
