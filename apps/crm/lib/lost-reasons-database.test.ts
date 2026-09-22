import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

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
  await db.exec(sql("20260921120000_lost_reasons_catalog.sql"));
  await db.exec(sql("20260921160000_pipeline_substages_by_stage.sql"));
}, 30000);

afterAll(async () => {
  await db?.close();
});

describe.sequential("catalogo de motivos de perda", () => {
  it("nasce com os motivos comerciais padrao", async () => {
    const result = await db.query<{ name: string }>(`
      select name from crm.lost_reasons
      where active and stage_key = 'PERDIDO'
      order by sort_order, name
    `);
    expect(result.rows.map((row) => row.name)).toEqual([
      "Não inaugurou",
      "Sem pedido mínimo",
      "Não responde",
      "Sem interesse",
      "Não atendemos a região",
      "Não temos o pão",
      "Região não atendida",
      "Produto não disponível",
      "Já era cliente",
      "Volume insuficiente",
      "Preço",
      "Prazo",
      "Outro",
    ]);
  });

  it("nasce com status de negociacao e qualificacao", async () => {
    const result = await db.query<{ name: string }>(`
      select name from crm.lost_reasons
      where stage_key = 'NEGOCIAÇÃO' and active
      order by sort_order, name
    `);
    expect(result.rows.map((row) => row.name)).toEqual([
      "Pediu amostra",
      "Recebeu amostra",
      "Encaminhado para o distribuidor",
    ]);
  });

  it("permite o mesmo nome em etapas diferentes e recusa duplicata na mesma etapa", async () => {
    await db.exec(`insert into crm.lost_reasons(name, sort_order, stage_key) values ('Outro', 999, 'NEGOCIAÇÃO')`);
    await expect(db.exec(`insert into crm.lost_reasons(name, sort_order, stage_key) values ('  outro ', 1000, 'NEGOCIAÇÃO')`))
      .rejects.toThrow();
  });
});
