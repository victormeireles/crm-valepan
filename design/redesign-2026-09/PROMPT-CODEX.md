# Prompt para o Codex — implementar 1a do Funil e do Chat

Baixe o zip deste projeto e coloque a pasta dentro do repo, por exemplo em `design/redesign-2026-09/`.
Depois cole o prompt abaixo no Codex (ele referencia os arquivos por esse caminho — ajuste se você usar outro).

---

## Prompt (copie daqui para baixo)

```
Contexto: repo crm-valepan (monorepo, app em apps/crm, Next.js App Router + Tailwind v4 + Supabase).
Vou implementar um redesign das duas telas que uso de verdade: /pipeline (Funil) e /inbox (Chat).

As referências visuais estão em design/redesign-2026-09/ (HTML estático, abre no navegador):
- "Funil Redesign.dc.html" → use SOMENTE o bloco com id="1a" (título "Funil com semáforo de SLA")
- "Chat Redesign.dc.html" → use SOMENTE o bloco com id="1a" (título "Chat em 3 painéis")
- "Funil Atual.dc.html" e "Chat Atual.dc.html" → recriação do que existe hoje, use para comparar
- "apps/crm/app/valepan-tokens.css" dentro do zip é uma cópia dos tokens que já existem no repo; não duplique, use os tokens do repo

Regras gerais:
- Não introduza biblioteca de UI nova, nem CSS framework novo. Tailwind + as CSS vars de apps/crm/app/valepan-tokens.css.
- Use os tokens existentes (--vp-wine, --vp-gold, --vp-gold-classic, --vp-paper, --vp-paper-pure, --vp-surface, --vp-surface-low, --vp-ink-body, --vp-ink-muted, --vp-ink-soft, --vp-ink-line, --vp-error, --sh-sm/md/lg, --font-display, --font-body). Nada de cor hexadecimal nova.
- Ícones: Material Symbols Outlined (já carregado em valepan-tokens.css e com a classe .material-symbols-outlined em globals.css). Não desenhe SVG novo.
- Mantenha o header do dashboard (apps/crm/app/(dashboard)/layout.tsx + dashboard-nav.tsx) e o drag-and-drop com @dnd-kit que já existe.
- Português do Brasil em toda a UI. Números em formato pt-BR.
- Faça em etapas, uma PR/commit por etapa, rodando `npm run typecheck` e `npm run lint` a cada etapa.

================================================================
ETAPA 1 — Dados derivados (base para as duas telas)
================================================================
Crie helpers em packages/shared ou apps/crm/lib (siga a convenção existente em apps/crm/lib/pipeline-signals.ts):

1. Tempo de espera do cliente ("esperando há"):
   - fonte: view crm.v_lead_last_message (last_direction, last_sent_at) já usada em pipeline/page.tsx,
     e crm.v_conversation_last_message (last_inbound_sent_at, last_direction) já usada em inbox/page.tsx.
   - regra: se last_direction = 'in', esperando = now - last_sent_at. Se 'out', não está esperando; mostrar
     "você respondeu há X". Formate com apps/crm/lib/format-relative.ts (formatRelativeShort) ou estenda-o.
2. Volume semanal em kg por lead:
   - kgSemana = leads.weekly_bread_consumption * (leads.bread_weight_grams ?? 90) / 1000, arredondado.
   - se weekly_bread_consumption for nulo, retorne null e a UI mostra "volume não informado".
   - exponha também soma por etapa e total do funil.
3. Estado da próxima ação, a partir de opportunities.next_action_at:
   - "sem_acao" (null) | "vencida" (< now) | "hoje" | "futura". Labels: "Sem próxima ação",
     "Follow-up vencido DD/MM", "Ligar hoje", "DD/MM".
   Escreva testes vitest para os três helpers (já existe setup de vitest no repo).

================================================================
ETAPA 2 — /pipeline (Funil), referência id="1a"
================================================================
Arquivos: apps/crm/app/(dashboard)/pipeline/page.tsx, pipeline-board.tsx, pipeline-filters.tsx,
pipeline-owner-summary.tsx, pipeline-signal-badges.tsx.

2.1 Cabeçalho da página
- Título em --font-display, ~40px, cor --vp-wine: "Funil comercial".
- Subtítulo em 13px --vp-ink-muted: "{N} oportunidades abertas · {kg} kg/semana em jogo · atualizado agora".
- À direita, os pills de vendedor que já existem em pipeline-filters.tsx, mas compactos: avatar dourado
  (iniciais) + primeiro nome + contagem. "Todos" selecionado = fundo --vp-wine, texto --vp-gold.

2.2 Faixa de 4 KPIs clicáveis (novo componente pipeline-kpi-strip.tsx)
- Grid de 4 colunas, cartões --vp-paper-pure, radius 14, border 1px --vp-ink-line, borda esquerda 4px colorida,
  sombra --sh-sm, ícone Material 26px + número 28px/800 + label 12px caixa alta tracking .08em.
- Cartões: "Cliente esperando resposta" (borda --vp-error, ícone mark_chat_unread, filtra signal=awaiting_reply),
  "Follow-up vencido" (borda --vp-gold-classic, ícone event_busy, novo filtro signal=followup_overdue),
  "Parados 7+ dias" (borda --vp-ink-soft, ícone hourglass_bottom, signal=stale),
  "Volume no funil" (borda --vp-wine, ícone bakery_dining, mostra kg/sem total, não filtra).
- Cada cartão é um botão que aplica/remove o filtro na URL (mesma mecânica de pushParams em pipeline-filters.tsx)
  e fica com aparência de selecionado quando o filtro está ativo.

2.3 Filtros
- Substitua os 4 <select> soltos por chips com caret (borda 1px dotted rgba(35,0,4,.35), radius pill):
  "Região: todas", "Tipo de cliente: todos", "Etapa: abertas", "Volume: qualquer" — cada um abre um menu
  simples (details/summary ou popover) com as opções que já existem hoje. O campo de busca vira input pill
  no header do dashboard (buscar lead, empresa ou telefone) mantendo o debounce de 300ms atual.
- Mantenha "Limpar filtros" e o texto explicativo dos sinais, mas em 11px --vp-ink-soft ao final da faixa.

2.4 Colunas
- 6 colunas, gap 12px, radius 14, fundo --vp-surface-low, padding 10px.
- Header da coluna: nome da etapa em 11px/800 caixa alta tracking .1em cor --vp-wine + contagem 13px/800 à direita;
  abaixo "{kg} kg/sem" em 11px --vp-ink-muted; abaixo barra de 3px (fundo rgba(35,0,4,.1), preenchimento
  --vp-gold-classic proporcional ao kg da etapa sobre o maior kg entre as etapas).
- Remova o input de busca por coluna (a busca global cobre o caso). Mantenha paginação de 20 cartões com "Ver mais".

2.5 Cartão (o ponto central do redesign)
- --vp-paper-pure, radius 12, border 1px --vp-ink-line, padding 11px 12px 10px, sombra suave, gap 8px entre cartões.
- Semáforo: borda esquerda de 3px — --vp-error se o cliente está esperando, --vp-gold-classic se follow-up vencido,
  --vp-ink-soft se parado 7+ dias, --vp-ink-line caso normal.
- Linha 1: nome 14px/700 (truncado) + badge quadrada de categoria (letra) 22px à direita.
- Linha 2: empresa/distribuidor 12px --vp-ink-muted (usa displayCompanyName atual).
- Chips: região (UF · bairro/cidade quando houver) e "{kg} kg/sem", fundo --vp-surface, 10px/700, radius pill.
- Bloco de espera: fundo rgba(35,0,4,.045), radius 8, ícone schedule + "Cliente esperando há 6h" /
  "Você respondeu há 3d" / "Sem interação há 9d" em 11px/700.
- Bloco de próxima ação: ícone flag cor --vp-gold-deep + label do estado (etapa 1). "Sem próxima ação" e
  "Follow-up vencido" em destaque (peso 700, cor --vp-ink-body).
- Rodapé separado por 1px --vp-surface-high: avatar dourado + nome do responsável 11px, e dois botões de 28px
  (chat → /inbox?cid={conversationId}; event → abre o mesmo fluxo de criar tarefa/next_action_at já existente).
- Mantenha o botão "Encerrar" e o diálogo de resultado/motivo atuais, mas dentro do menu "more_horiz" do rodapé
  para não competir com as ações principais.
- O handle de arrastar (⠿) sai; o cartão inteiro passa a ser arrastável (dnd-kit listeners no <li>), com os
  botões do rodapé chamando stopPropagation.

2.6 Mobile (<768px)
- Colunas viram carrossel horizontal com snap (uma etapa por vez) e a faixa de KPIs vira scroll horizontal.
- Toque no cartão abre a oportunidade; mudar etapa via menu, não via drag.
- Alvos de toque mínimos de 44px.

================================================================
ETAPA 3 — /inbox (Chat), referência id="1a"
================================================================
Arquivos: apps/crm/app/(dashboard)/inbox/page.tsx, inbox/layout.tsx, inbox-sidebar.tsx, chat-thread.tsx,
send-message-form.tsx, lead-qualification-modal.tsx, inbox-tasks-panel.tsx.

3.1 Layout em 3 painéis
- Grid: 316px | 1fr | 348px, gap 16px, padding 16px 20px 20px, altura fixa como hoje (inbox/layout.tsx),
  scroll só dentro dos painéis. Abaixo de 1280px o painel direito colapsa em botão "Ficha" que abre um
  drawer sobre a conversa; abaixo de 900px vira pilha (lista → conversa) como hoje.

3.2 Painel 1 — fila
- Abas viram 3 pills numa barra pill (fundo rgba(35,0,4,.06), pill ativo --vp-wine/texto --vp-gold):
  "Esperando {n}" (NOVA aba padrão: conversas com last_direction='in', ordenadas pelo tempo de espera desc),
  "Qualificar {n}" (tab=qualify atual), "Funil {n}" (tab=pipeline atual). Arquivados e Grupos vão para um
  menu "more_horiz" ao lado da busca.
- Item da lista: avatar 40px, nome 14px/700, tempo de espera à direita em 11px/700 cor --vp-error quando
  esperando (senão --vp-ink-soft), empresa 12px --vp-ink-muted, preview 2 linhas 12px, e dois chips
  (etapa e kg/sem). Mantenha ponto de não lido, badge "Ligando" e o prefetch/otimismo de seleção atuais.

3.3 Painel 2 — conversa
- Header: avatar 44px, nome 17px/700, linha "empresa · telefone · cidade" 12px, e à direita chip de SLA
  ("Esperando há 6h", fundo rgba(186,26,26,.10), texto --vp-error) + botões redondos de 34px (call, archive).
- Thread: mantenha chat-thread.tsx (realtime, fixadas, reações, "carregar anteriores", separador de novas
  desde a última leitura). Ajustes visuais: separadores de dia como pill central, bolha de saída
  --vp-wine com texto --vp-gold-cream, bolha de entrada --vp-paper-pure com borda --vp-ink-line,
  radius 16 com o canto inferior do lado do autor em 4px, padding 11px 14px, max-width min(76%, 460px),
  meta (hora · Lida) em 10px alinhada à direita.
- Respostas rápidas (NOVO): linha rolável de chips acima do composer, rótulo "RESPOSTAS RÁPIDAS" 10px/800.
  Fase 1: constante em apps/crm/lib/inbox/quick-replies.ts com 5 templates ("Tabela de preços",
  "Enviar amostra", "Prazo de entrega", "Pedido mínimo", "Catálogo completo"), cada um com texto pré-escrito
  que é inserido no textarea (não envia sozinho) e aceita {{primeiro_nome}}.
  Fase 2 (deixe TODO): tabela crm.message_templates com título, corpo, ativo, ordem.
- Composer: mantenha o form atual (anexos, emoji, reply, Enter envia) com botão "Enviar" pill de 50px
  --vp-wine/--vp-gold e placeholder "Escreva para {primeiro nome} — Enter envia, Shift+Enter quebra linha".

3.4 Painel 3 — ficha do lead (novo componente inbox-lead-panel.tsx)
- Cartão --vp-paper-pure, borda esquerda 3px --vp-gold-classic. Header: eyebrow "FICHA DO LEAD" 10px/800
  tracking .18em cor --vp-gold-classic + nome da empresa 15px/700 --vp-wine.
- Bloco "Qualificação": 5 linhas editáveis inline (Etapa, Tipo de cliente, Cidade, Volume, Responsável),
  cada uma um controle de 1 clique (select/autocomplete) que salva na hora via server action — reaproveite a
  lógica de lead-qualification-modal.tsx e city-autocomplete-input.tsx, mas sem abrir modal. Mostre estado
  "salvando…" e erro inline.
- Bloco "Próxima ação": se next_action_at for null, cartão de alerta (borda rgba(199,166,77,.5),
  fundo rgba(199,166,77,.12)) com "Nenhuma ação agendada" + botões "Agendar hoje" e "Escolher data".
  Se existir, mostra data + quem agendou e permite concluir/reagendar.
- Bloco "Tarefas": as tarefas do lead que já vêm em inbox-tasks-panel.tsx, inline, com checkbox.
- Bloco "Histórico": timeline curta (amostra enviada, mudança de etapa, criação do lead) — reaproveite o que
  timeline-entry.tsx já monta em /leads/[id].
- Rodapé fixo: botão largo --vp-wine/--vp-gold "Mover para {próxima etapa}" que aplica a etapa seguinte do funil.

================================================================
ETAPA 4 — checagens
================================================================
- Compare cada tela renderizada com o HTML de referência (id="1a") lado a lado: hierarquia, pesos, espaçamentos.
- Verifique: nenhum cartão do funil sem indicação de espera e de próxima ação; a aba "Esperando" nunca
  esconde conversa com last_direction='in'; salvar qualificação no painel não recarrega a página inteira.
- Acessibilidade: foco visível (outline 2px --vp-gold-deep já global), aria-pressed nos filtros/KPIs,
  aria-live no "salvando…", contraste do texto dourado sobre wine mantido.
- Rode npm run typecheck, npm run lint e npm test.
```

---

## O que o Codex precisa saber e já está no repo

- `opportunities.next_action_at` e `opportunities.updated_at` existem — a próxima ação não precisa de migração.
- `leads.weekly_bread_consumption` e `leads.bread_weight_grams` existem — o kg/semana é derivado, sem migração.
- `v_lead_last_message` e `v_conversation_last_message` já entregam direção e horário da última mensagem — o tempo de espera vem daí.
- Única coisa realmente nova em banco: `crm.message_templates` para as respostas rápidas (fase 2, opcional).
