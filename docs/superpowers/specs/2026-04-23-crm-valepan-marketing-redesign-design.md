# CRM Valepan — redesign visual (superfície marketing)

**Data:** 2026-04-23  
**Status:** aprovado para implementação (desenho validado em sessão de brainstorming)  
**Fonte de identidade:** skill `design-system` (README + `colors_and_type.css`) — superfície **marketing** Valepan; **não** usar a paleta `--vp-dash-*` neste produto.

## Objetivo

Substituir o visual genérico atual do app `apps/crm` (neutros frios, acento azul, `system-ui`) por uma experiência **coerente com a marca Valepan**: papel quente, vinho, dourado, tipografia Manrope/Bebas onde definido, ícones Material Symbols Outlined, foco e sombras conforme a skill — **sem** tema escuro e **mantendo** o padrão de navegação por **header superior**.

## Decisões travadas

| Tema | Decisão |
|------|---------|
| Superfície | Marketing (bordô, dourado, papel, superfícies quentes) |
| Claro / escuro | **Somente claro** — sem variante escura nem `prefers-color-scheme` alternativo para o CRM |
| Casco | **Header superior** existente, redesenhado com tokens e estados Valepan |
| Tipografia | **Manrope** em H1–H3 de tela e corpo; **Bebas** só em login (opcional leve), home, empty states e faixas — não em todo título de lista |
| Login | **Cartão simples** central em papel/superfície, borda quente, formulário focado (sem splash radial pesado) |
| Abordagem técnica | **Tokens primeiro**, migração de telas em **ondas** (casca + login + primitivos → páginas internas) |

## Arquitetura visual

### Tokens

- Introduzir variáveis da skill no projeto (espelhar ou importar o subconjunto necessário de `colors_and_type.css`: `--vp-paper`, `--vp-wine-*`, `--vp-gold-*`, `--vp-surface*`, `--vp-ink-*`, `--vp-ink-line`, sombras quentes, `--vp-error*` onde aplicável).
- O CRM passa a referenciar **exclusivamente** tokens `--vp-*` de marketing (e semânticos derivados), não a escala cinza/azul atual de `:root` em `globals.css`.
- **Fora de escopo:** uso de `--vp-dash-*` no shell ou páginas do CRM (evita misturar duas identidades).

### Integração Tailwind (apps/crm)

- Alinhar `@theme` / uso de `var(--vp-…)` ao padrão já usado no app (Tailwind v4 com `@import "tailwindcss"`).
- Mapear utilitários ou classes componentes para que **não** restem cores literais frias (`#fafafa`, azul `#2563eb`, etc.) fora de casos excepcionais documentados (ex.: integração WhatsApp se exigir verde de marca de terceiros).

## Componentes e superfícies

### Header

- Largura útil alinhada à skill (**container ~1200px**, região ampla até ~1400px onde fizer sentido com o layout atual `max-w-6xl` — **ajustar de propósito** para bater com a skill, não deixar divergência acidental).
- Fundo `--vp-paper`, borda inferior quente (vinho em baixa opacidade ou `--vp-ink-line`).
- Altura confortável (~72–80px), alinhamento vertical do logo + nav + usuário.
- Links de nav: `--vp-ink-muted` default; hover com superfície `--vp-surface-low`; ativo com texto vinho e/ou indicador dourado fino.
- Botão **Sair** e secundários: outline quente; ações primárias com preenchimento marca (vinho/dourado conforme padrão de CTA da skill).

### Login

- Fundo global papel.
- Cartão central: superfície elevada da escada (`--vp-surface` / `--vp-surface-high`), `border-radius` 16–20px, sombra quente discreta, borda `--vp-ink-line`.
- Inputs com borda quente; foco com **outline** dourado escuro (`#775a00`, offset 2–3px) como na skill.
- Título do bloco de login: opcional **Bebas** curto para fio de marca; labels e campos em Manrope.

### Páginas internas (dashboard, leads, pipeline, tarefas, distribuidores, amostras, inbox)

- Conteúdo sobre papel; cartões e painéis usando degraus de superfície para hierarquia.
- **Tabelas:** cabeçalho em superfície mais alta; linhas com bordas quentes; hover de linha com `--vp-surface-low`.
- **Formulários:** bordas quentes; erro com `--vp-error` / `--vp-error-container` conforme tokens da skill.
- **Cards / KPIs:** raios e sombras no patamar da skill (sem sombras pretas puras em fundo claro).

### Ícones

- **Material Symbols Outlined** (opsz 24, wght 400, FILL 0, GRAD 0), alinhado ao README da skill.

## Movimento e acessibilidade

- Easing e durações: micro ~200ms; overlays/modais um pouco mais longos; curvas da skill (`cubic-bezier(0.22, 1, 0.36, 1)` onde aplicável).
- `prefers-reduced-motion: reduce`: reduzir ou desativar animações decorativas (shimmer, etc.) se forem adicionadas.
- **Foco:** sempre visível; não remover outline sem substituto que atenda contraste.

## Conteúdo e idioma

- Interface já em **português (Brasil)**; manter tom **funcional** nas telas operacionais (a skill distingue marketing caloroso vs. dashboard “clipped”; aqui prevalece clareza, com voz de marca leve onde couber — sem corporativês vazios).

## Testes e validação

- Smoke manual: login, dashboard, uma lista, um formulário, inbox (se existir), pipeline.
- Checklist opcional de contraste em botões vinho/dourado e links ativos.

## Fora de escopo (neste spec)

- Tema escuro ou alternância claro/escuro.
- Redesign de **fluxos de negócio** ou novas features (apenas camada visual e tokens).
- CTA flutuante WhatsApp estilo site (não exigido; inbox continua sendo ferramenta, não landing).

## Próximo passo (fora deste arquivo)

Após revisão explícita deste spec pelo autor do produto, criar o **plano de implementação** com a skill **writing-plans** em `docs/superpowers/plans/2026-04-23-crm-valepan-marketing-redesign.md`, com tarefas ordenadas (tokens → layout global → login → páginas por onda).

## Referências

- Skill design-system: `README.md` e `colors_and_type.css` (paleta marketing, tipo, foco, sombras, raios).
- Código alvo principal: `apps/crm/app/globals.css`, `apps/crm/app/layout.tsx`, `apps/crm/app/(dashboard)/layout.tsx`, `apps/crm/app/login/*`, páginas e componentes sob `apps/crm/app/(dashboard)/`.
