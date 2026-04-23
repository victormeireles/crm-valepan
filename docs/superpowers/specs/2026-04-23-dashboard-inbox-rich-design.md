# CRM Valepan — dashboard e inbox mais ricos (dados + UI)

**Data:** 2026-04-23  
**Status:** proposta de desenho (aguarda revisão antes de implementação)  
**Relação:** complementa `2026-04-23-crm-valepan-marketing-redesign-design.md` (tokens e shell); assume identidade marketing Valepan já aplicada ou em curso.

## Objetivo

Enriquecer **dashboard** e **inbox** com **métricas orientadas a negócio** e **UI mais informativa**, além do redesenho visual — abordagem **B** (queries/dados extra + refinamento de interface).

## Princípios

- Indicadores **acionáveis** (o utilizador percebe o que fazer a seguir).
- Definições **explícitas** no produto (tooltips ou texto curto no cartão) para evitar ambiguidade.
- **Performance:** preferir uma vista SQL ou RPC agregada a N+1 no cliente quando a lista crescer.

## Definições de negócio (travadas para implementação)

### 1. Leads sem resposta

**Significado:** conversas em que a **última mensagem** da thread é **entrada** (`direction = 'in'`), ou seja, o cliente falou por último e ainda não houve resposta da equipa naquela conversa.

- **Âmbito:** todas as conversas do tenant (RLS existente em `crm.messages` / `crm.conversations`).
- **Métrica principal no dashboard:** número de **leads distintos** que têm **pelo menos uma** conversa nesse estado (um lead com duas conversas “sem resposta” conta **uma** vez).
- **Rótulo sugerido:** «Leads sem resposta» com subtítulo ou tooltip: «Última mensagem do cliente, sem resposta nossa».

**Implementação recomendada:** vista materializada ou vista normal `crm.v_conversation_last_message` com colunas `(conversation_id, lead_id, last_direction, last_sent_at, last_body_preview)` derivada de `DISTINCT ON (conversation_id) … ORDER BY sent_at DESC` em `crm.messages` + join a `crm.conversations`. O dashboard conta `COUNT(DISTINCT lead_id) WHERE last_direction = 'in'`.

### 2. Leads novos (evolutivo)

**Significado:** contagem de linhas em `crm.leads` criadas numa **janela de 7 dias corridos** (timezone da aplicação ou UTC — documentar na implementação; default **UTC** para consistência com `timestamptz`).

- **Cartão principal:** total de leads com `created_at >= now() - interval '7 days'`.
- **Comparação evolutiva:** total no **período anterior** de 7 dias (`created_at` entre `now() - 14 days` e `now() - 7 days`).
- **Apresentação:** número grande + linha secundária «vs. período anterior: +N / −N / igual» e, se couber sem poluir, **percentagem** só quando o denominador > 0 (evitar divisão por zero).

**Rótulo sugerido:** «Novos leads (7 dias)» com tooltip: «Leads criados nos últimos 7 dias; comparação com os 7 dias anteriores».

### 3. Outros indicadores (mesma onda, prioridade média)

| Indicador | Definição | Notas |
|-----------|-----------|--------|
| Conversas ativas (7 dias) | `COUNT(DISTINCT conversation_id)` com mensagem `sent_at >= now() - 7 days` | Complementa volume de tráfego sem confundir com “novos leads”. |
| Tarefas em atraso | `crm.tasks` com `done = false` e `due_at < now()` | Já alinhado ao modelo; filtrar por `assignee_id` = utilizador atual se a política de produto for “minhas tarefas”. |

Os cartões atuais (leads, oportunidades, conversas, tarefas, amostras) **mantêm-se**; estes são **adições** ou substituições apenas se o layout ficar sobrecarregado (preferir **segunda linha** de KPIs ou grelha 2×N).

## Dashboard — UI

- **Secção** «Resumo» ou «Hoje» com hierarquia: título de página (H1) + subtítulo curto opcional.
- **Primeira linha:** KPIs existentes redesenhados (tokens Valepan).
- **Segunda linha:** «Leads sem resposta», «Novos leads (7 dias)», opcional «Conversas ativas (7d)» ou «Tarefas em atraso».
- **Bloco opcional (terceira faixa):** lista «Últimos leads» — 5 linhas: nome/contacto (join `contacts` quando existir), telefone mascarado ou E.164, `created_at` relativo, link para `/leads/[id]` ou conversa se houver padrão único.

## Inbox — UI e dados (alinhado à mesma entrega)

- **Lista:** por linha mostrar **pré-visualização** do texto da última mensagem (truncar ~80 caracteres), **hora/data** (`last_sent_at`), e **indicador** «aguarda resposta» quando `last_direction = 'in'` (ponto ou badge discreto em tom vinho/dourado conforme tokens).
- **Cabeçalho da thread:** nome do contacto/lead + telefone; estado «Aguarda a sua resposta» quando aplicável.
- **Corpo bruto do webhook:** colapsado em `<details>` (resumo «Payload técnico»), aberto só para debug.

A lista pode reutilizar a mesma fonte de verdade que o cartão «sem resposta» (vista `last_message` por conversa), evitando duplicar lógica.

## Camada de dados e segurança

- Nova migração: `crm.v_conversation_last_message` (ou nome equivalente) com `security invoker` e políticas herdadas das tabelas base, **ou** RPC `crm.dashboard_inbox_summary` que devolve JSON agregado — a equipa escolhe na implementação; o spec exige **uma** fonte única para “última mensagem por conversa”.
- Queries do dashboard em **Server Component** ou route handler com cliente **service role** já padronizado no projeto — seguir o padrão existente em `apps/crm` (não expor chaves no cliente).

## Fora de escopo

- Notificações push ou e-mail.
- SLA configurável por utilizador (ex.: “sem resposta há 48h”) — pode ser fase 2; nesta fase basta “última mensagem é inbound”.
- Gráficos sparkline no MVP (a comparação «7d vs 7d anterior» é só número + texto).

## Ordem de implementação sugerida

1. Migração + vista (ou RPC) de última mensagem por conversa.  
2. Queries dashboard + cartões novos + bloco «Últimos leads» opcional.  
3. Inbox: enriquecer query da lista; componentes lista + thread + `details`.  
4. Smoke: dashboard, inbox, RLS com utilizador comercial de teste.

## Critérios de aceite

- Definições acima refletidas nos números (validar com 2–3 conversas de teste: última `in` vs `out`).
- Dashboard não degrada perceptivelmente (objetivo: < 3 round-trips agregados ou 1 RPC).
- Inbox: utilizador identifica de relance conversas que precisam de resposta.

---

**Próximo passo:** revisão por ti; após «ok», `writing-plans` + PR de implementação.
