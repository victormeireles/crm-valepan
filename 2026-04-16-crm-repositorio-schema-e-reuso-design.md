# Design — CRM Valepan (repo novo, mesmo stack, schema PostgreSQL separado)

**Data:** 2026-04-16  
**Status:** proposta de arquitetura e bootstrap (cópia para novo repositório)  
**Decisão de produto:** repositório Git **novo e separado** (não um segundo app neste monorepo).

---

## 1. Contexto e objetivo

Reutilizar ao máximo a **stack e os padrões** do monorepo `valepan-pedidos` (Next.js, TypeScript, Tailwind, Supabase, NextAuth, pacote shared, Turbo) num **projeto CRM** independente. O **banco de dados do CRM** deve ficar em **outro schema PostgreSQL** (ex.: `crm`) no **mesmo projeto Supabase** da Valepan, isolando tabelas e políticas do schema `public` usado pelo sistema de pedidos.

Este documento é o **guia técnico de alinhamento** entre o PRD de produto e a estrutura de código.

---

## 2. Abordagens consideradas

### A) Monorepo espelhado (`apps/crm` + `packages/shared`) — **recomendada**

- **O quê:** novo repositório com a mesma forma do atual: `apps/crm` (ou `apps/web`), `packages/shared`, `turbo.json`, workspaces npm.
- **Prós:** máxima familiaridade para o time; `@crm/shared` (ou nome escolhido) com utils/validators/UI genéricos sem duplicar o padrão Valepan; CI e scripts análogos.
- **Contras:** é preciso **copiar** (não dependência git) o que for útil do `packages/shared` atual e renomear o escopo npm; atualizações entre repos não são automáticas.

### B) Monorepo mínimo (apenas app + dependências diretas, sem pacote shared)

- **Prós:** menos pastas no início.
- **Contras:** tende a duplicar `cn`, validators e componentes; diverge rápido do padrão Valepan — **não recomendado** se o objetivo é reuso.

### C) Shared como submodule ou pacote npm privado desde o dia 1

- **Prós:** uma única fonte para `@valepan/shared`.
- **Contras:** exige registry privado, versionamento e processo de release; para MVP costuma atrasar — **adiar** até haver necessidade real de sincronizar automaticamente.

**Recomendação:** **A** — novo monorepo espelhado + **fork/cópia inicial** do `packages/shared` renomeado (ex. `@valepan/crm-shared` ou `@crm/shared`), importando apenas o que for genérico; regras de negócio do CRM ficam no app.

---

## 3. Desenho técnico

### 3.1. Repositório novo (layout sugerido)

```
crm-valepan/   (nome exemplo)
├── apps/
│   └── crm/                 # Next.js App Router (espelha apps/valepan)
│       ├── app/
│       ├── lib/             # supabase clients, auth, managers CRM
│       ├── supabase/        # config.toml, migrations, seed
│       └── package.json
├── packages/
│   └── shared/              # fork inicial de packages/shared (nome npm próprio)
├── docs/
├── package.json             # workspaces: apps/*, packages/*
├── turbo.json
└── ...
```

**Scripts e ferramentas alinhados ao projeto atual:** Node/npm workspaces, Turbo, ESLint, TypeScript, Vitest onde fizer sentido, Supabase CLI no app.

### 3.2. Banco: schema PostgreSQL `crm` (mesmo projeto Supabase)

- **Um** projeto Supabase; **dois namespaces lógicos:** `public` (pedidos legado) e `crm` (novo).
- Todas as tabelas do CRM: `crm.<tabela>` (ou `CREATE SCHEMA crm` + defaults nas migrations).
- **PostgREST / API:** em `supabase/config.toml`, incluir `crm` em `schemas` sob `[api]` para que o cliente Supabase enxergue as tabelas do CRM (além de `public`/`graphql_public` conforme padrão do projeto).
- `**search_path`:** migrations devem definir explicitamente schema nas policies e objetos, ou fixar `search_path` em funções; evitar ambiguidade com `public`.
- **RLS:** toda tabela nova em `crm` com RLS habilitado e policies na **mesma migration** que cria a tabela (padrão do repositório Valepan).
- **Auth:** usuários continuam no esquema de auth do Supabase; vínculos `crm.profiles` / `crm.usuarios` (ou equivalente) referenciam `auth.users` — detalhar no plano de implementação.

### 3.3. Tipos TypeScript e cliente Supabase

- Gerar tipos a partir do schema `crm` (script semelhante a `type:generate` do app atual), garantindo que os types reflitam **apenas** o CRM ou unindo com cuidado se um único `Database` exportar vários schemas.
- Preferir **prefixo de schema** nas queries no código (`schema('crm')` / `.from()` com views no `public` **só** se houver view de compatibilidade — padrão preferido: tabelas em `crm` referenciadas explicitamente).

### 3.4. Variáveis de ambiente

- Reutilizar `SUPABASE_URL`, `SUPABASE_ANON_KEY`, chaves de serviço onde aplicável; **não** é obrigatório novo projeto Supabase.
- Documentar no README do CRM que o **isolamento é por schema**, não por URL.

### 3.5. O que reaproveitar do `valepan-pedidos`


| Área                                     | Reuso                                                                 |
| ---------------------------------------- | --------------------------------------------------------------------- |
| `packages/shared`                        | Cópia + renome; manter regra: só utilitários/validators/UI genéricos  |
| Padrão NextAuth + Supabase adapter       | Sim, adaptando tabelas/sessão ao modelo `crm`                         |
| Estrutura `lib/supabase` (server/client) | Sim                                                                   |
| Integração WhatsApp                      | Reaproveitar **padrões** (webhook, filas), não copiar domínio pedidos |
| Omie / pedidos                           | Não                                                                   |


### 3.6. Documentos irmãos

- **PRD:** `2026-04-16-crm-comercial-prd.md` — visão de produto revisada e alinhada a fases.
- **Checklist:** `2026-04-16-crm-novo-repo-checklist.md` — passos objetivos ao criar o repo vazio.

---

## 4. Riscos e mitigação


| Risco                                               | Mitigação                                                                  |
| --------------------------------------------------- | -------------------------------------------------------------------------- |
| Confundir schema Postgres com projeto Supabase novo | Documentar explicitamente: **mesmo projeto**, schema `crm`.                |
| PostgREST não expõe `crm`                           | Ajustar `config.toml` e regenerar tipos.                                   |
| Policies RLS incorretas entre schemas               | Testar com usuários reais; migrations revisadas em staging.                |
| Divergência entre dois `shared`                     | Congelar escopo do pacote CRM; eventual extrair pacote npm interno depois. |


---

## 5. Testes e qualidade (alto nível)

- Testes unitários em lógica pura (validators no shared).
- Testes de integração opcionais no MVP para webhooks WhatsApp e criação de lead.
- Checklist manual: login, CRUD lead, timeline, mudança de etapa com regras.

---

## 6. Fora deste documento

- Detalhe de cada tela e priorização fina de backlog → PRD e plano de implementação (`writing-plans`).
- SQL completo das tabelas → migrations no repositório CRM.

---

## 7. Aprovação

Após validação deste desenho e dos arquivos `.md` associados, o próximo passo é o **plano de implementação** (tarefas ordenadas no repo novo), não a codificação neste repositório.