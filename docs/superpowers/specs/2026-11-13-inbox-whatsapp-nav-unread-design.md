# Inbox: rail de listas, não lidas e cards compactos

**Data:** 2026-11-13  
**Status:** aguardando revisão do usuário antes do plano de implementação  
**Referência UX:** WhatsApp Web (layout/padrões), identidade visual Valepan (vinho)

## Objetivo

Facilitar o acompanhamento de leads no `/inbox`: troca rápida entre listas, destaque de conversas não lidas e lista mais densa — sem redesenhar o thread central nem a ficha do lead.

## Decisões fechadas

| Tema | Decisão |
|------|----------|
| Abordagem | Rail de ícones + chips `Tudo` / `Não lidas` + cards compactos |
| Merge de listas | `Novos` + `Leads` → uma lista **Leads** |
| Contagem nos badges/chip | Número de **conversas** não lidas (não mensagens) |
| Escopo dos chips | Dentro da lista ativa da rail |
| Marcar como não lida | Menu ▾ do card |
| Cor dos indicadores | Valepan (`--vp-wine`), não verde WhatsApp |
| Conteúdo do card | Avatar, nome, horário, preview (1 linha), bolinha de não lida |

## Arquitetura de UI

### Rail (navegação de listas)

- Faixa estreita (~56px) à esquerda da lista de conversas, **dentro** do painel do inbox (não substitui o nav global do CRM).
- Ícones (cima → baixo): **Leads** · **Grupos** · **Clientes** · **Perdidos**.
- Ativo: fundo suave + vinho; cada ícone com `aria-label` + tooltip.
- Badge numérico no ícone = conversas não lidas daquela lista; oculto se 0; `99+` se ≥ 100.
- Trocar ícone: página → 1; chip → **Tudo** (evita filtro “Não lidas” vazio sem contexto).

### Header da lista

- Remove o dropdown `CrmMenuSelect` de Novos/Leads/Grupos/…
- Mantém busca (“Buscar conversa”).
- Abaixo da busca: chips **Tudo** | **Não lidas x** (`x` = não lidas da lista ativa).
- Chip ativo em vinho; busca ∩ filtro de chip.

### Card compacto

- Linha 1: nome (truncate) + horário à direita.
- Linha 2: preview (1 linha, truncate).
- Bolinha de não lida à direita, abaixo do horário (sem contador de mensagens).
- **Removido:** chips de etapa/volume, linha empresa/telefone, `CategoryBadge` no card (ficam na ficha à direita).
- **Mantido:** menu ▾; indicadores de ligação (mínimos); horário em destaque quando “aguardando resposta”.
- Item selecionado: barra vinho + fundo suave (altura menor).

## Modelo de “não lida”

- **Não lida:** existe inbound e `last_inbound_sent_at > last_read_at` (ou `last_read_at` nulo) — regra já usada no snapshot.
- **Abrir conversa:** `markConversationRead` (comportamento atual).
- **Marcar como não lida:** nova action `markConversationUnread` no menu do card; força estado unread (ex. `last_read_at = null`).
- Se a conversa estiver aberta ao marcar não lida, **não** reaplicar leitura imediata na mesma sessão (evitar anular o gesto).
- Badges da rail e `x` do chip usam a mesma definição; atualização otimista + refresh live existente.

## Dados e API

- Reutilizar `crm.conversations.last_read_at`.
- Estender `crm.inbox_sidebar_snapshot` (caminho preferido; um round-trip):
  - Tab `leads` = estágio LEADS **+** Qualificação/Negociação (merge de `is_novos` + `is_lead`).
  - Contagens de não lidas **por tab** para badges + chip.
  - Filtro opcional só não lidas (`unread`) com paginação (20/página) preservada.
- `markConversationUnread`: persistir unread de forma explícita (preferência: `last_read_at = null`).
- UI: tab padrão `leads`; `tab=novos` (e aliases legados) → `leads`.
- `InboxTab` / `InboxTabCounts`: remover `novos` da UI; manter compatibilidade de URL.

## Componentes / arquivos prováveis

- `inbox-sidebar.tsx` — rail, chips, card compacto, menu “Marcar como não lida”
- `inbox-location.ts` — tabs, URL/hash, filtro unread
- `app/actions/inbox.ts` — `markConversationUnread`, refresh com unread counts/filtro
- Snapshot SQL + types em `database.types.ts`
- `mark-conversation-read.tsx` — coordenar com “marcar não lida” na conversa aberta

## Erros e empty states

- Falha ao marcar não lida: feedback no menu; UI não fica “mentirosa”.
- Filtro “Não lidas” vazio: “Nenhuma conversa não lida.”
- Lista vazia geral: mensagem atual (“Nenhuma conversa ainda.” / busca).

## Testes

- Merge Novos+Leads na tab `leads` e contagens.
- Unread count por tab; filtro `unread`; badge/chip coerentes.
- `markConversationUnread` + não re-marcar lida se conversa aberta na sessão.
- Alias `tab=novos` → `leads`.

## Fora de escopo

- Contador de mensagens não lidas por conversa
- Tema/cores WhatsApp
- Redesign do thread central ou da ficha do lead
- Novos chips além de Tudo / Não lidas
- Mudança do nav global do CRM

## Critérios de sucesso

1. Operador troca Leads/Grupos/Clientes/Perdidos pela rail sem dropdown.
2. Vê quantas conversas não lidas há em cada lista (badge) e filtra com “Não lidas x”.
3. Cards cabem bem mais itens na viewport (sem tags de etapa/volume).
4. Bolinha indica não lida; menu permite remarcar como não lida.
5. Identidade Valepan preservada (vinho, tipografia/tokens existentes).
