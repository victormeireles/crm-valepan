# Z-API Disconnect Email Alert Implementation Plan

> **For agentic workers:** implement task-by-task. Steps use checkbox syntax.

**Goal:** Enviar um e-mail via Resend na primeira detecção de desconexão da Z-API comercial, e só voltar a alertar após reconectar.

**Architecture:** Helper de alerta + claim atômico no Postgres; webhook Connected/Disconnected; falhas HTTP Z-API com texto de desconexão.

**Tech Stack:** Next.js (apps/crm), Supabase (schema crm), Resend HTTP API, Vitest

## Global Constraints

- Não usar CLI da Vercel neste repo
- Não spammar: um e-mail até `ConnectedCallback`
- Sem secrets commitados

---

### Task 1: Migration + types

- [x] Criar `crm.zapi_connection_alerts` + RPCs `claim_zapi_disconnect_alert` / `clear_zapi_disconnect_alert`
- [x] Atualizar `database.types.ts`

### Task 2: Módulo de alerta

- [x] `isZapiDisconnectedError`, `notifyZapiDisconnected`, `clearZapiDisconnectedAlert`, `getZapiConnectionEvent`
- [x] Testes unitários da detecção

### Task 3: Integração

- [x] Webhook `/api/webhooks/zapi`
- [x] `lib/zapi/send.ts` nos throws HTTP
- [x] Garantir env `RESEND_*` no app CRM
