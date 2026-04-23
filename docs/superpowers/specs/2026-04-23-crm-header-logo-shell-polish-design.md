# CRM Valepan — logótipo no header e refinamento do shell

**Data:** 2026-04-23  
**Status:** aprovado (variante B, recomendação do brainstorming)  
**Relaciona com:** `2026-04-23-crm-valepan-marketing-redesign-design.md` (superfície marketing; este documento **refina** marca e layout do header/shell).

## Objetivo

Incluir a **identidade gráfica oficial Valepan** no CRM (logótipo da skill design-system) e elevar a **hierarquia visual** do header e da área de conteúdo, alinhado a **ui-ux-pro-max** (nav ativa clara, alvos de toque, ritmo de espaçamento, elevação quente), **sem** introduzir a superfície EasyDash (laranja/teal).

## Decisão travada: variante **B** (header uma linha)

- **Uma linha** no desktop: ícone oficial + lockup textual “CRM” (Manrope forte), navegação inline com **mais espaçamento**, **separador visual** discreto antes da zona utilizador + Sair.
- **Não** usar duas linhas com logo full no header principal (evita consumo excessivo de altura útil).
- **Logo full** (`valepan-logo-full.svg`) pode ser usado em **momentos de marca** pontuais (ex.: cartão de login), não obrigatório neste spec.

## Assets e cópia no repositório

- Origem (referência): skill design-system  
  - `assets/logo/valepan-logo.svg` — símbolo (uso principal no header)  
  - `assets/logo/valepan-logo-full.svg` — wordmark completo (opcional login/marketing interno)
- **Implementação:** copiar os SVG para `apps/crm/public/brand/` (ou `public/brand/` relativo ao app) com os **mesmos nomes**, para builds e CI **não** dependerem de `~/.cursor/skills/...`.
- O link da marca (ícone + “CRM”) aponta para `/dashboard`.

## Header do dashboard (`(dashboard)/layout.tsx` + nav)

### Estrutura

1. **Bloco esquerdo:** `Link` envolvendo **imagem** do ícone (`valepan-logo.svg`) com altura **36–40px**, largura proporcional; área clicável mínima **≥44×44px** (padding se necessário). Ao lado, texto **“CRM”** em Manrope **font-semibold ou extrabold**, cor `--vp-wine`, tamanho legível (ex. `text-lg`), alinhado ao centro vertical do ícone.
2. **Nav:** `DashboardNav` com **maior `gap`** entre itens (ex. `gap-2` ou `gap-3`), **padding vertical** nos links (~`py-2.5` ou equivalente) para aproximar **44px** de altura de toque onde possível.
3. **Estado ativo:** preferir **indicador inferior dourado** (pseudo `after` ou `border-b-2` em `--vp-gold-classic`) **ou** pill em `--vp-surface` — substituir ou suavizar o anel fino atual se o resultado for mais limpo; manter contraste WCAG no texto ativo.
4. **Separador:** `border-l` ou divisor vertical em `--vp-ink-line` / opacidade baixa entre nav e zona direita.
5. **Zona direita:** utilizador + papel em **sub-bloco** (`rounded-lg`, `bg-[var(--vp-surface-low)]`, `px-3 py-2`) ou equivalente; **Sair** continua **secundário** (outline quente), sem competir com primários da página.

### Superfície e elevação

- Fundo do header: `--vp-paper` (igual corpo ou leve contraste com `--vp-surface-low` se necessário para separar).
- **Sombra quente** discreta sob o header: token `--sh-sm` (ou `box-shadow` equivalente ao README da skill), **não** sombra neutra fria.
- Borda inferior: manter `border-strong` **ou** confiar só na sombra — **uma** das duas para não duplicar peso visual (implementação escolhe o mais limpo em mock/real).

## Área de conteúdo

- Manter `max-w-[min(100%,var(--container-wide))]`.
- Aumentar **padding vertical** da região dos `children` (ex. `py-8` em desktop, `py-6` em mobile) para ritmo tipo marketing, sem reduzir legibilidade de tabelas.

## Login (opcional nesta fase)

- Se incluir logo full no login: centralizado acima ou dentro do cartão, largura máxima ~200–240px, sem quebrar o spec anterior do cartão simples.

## Fora de escopo

- Micro-barra superior extra (variante C).
- Nova paleta ou tema escuro.
- Ícones Material em **todos** os itens de nav (opcional fase posterior).
- Refactor de dados ou rotas.

## Ficheiros previstos (implementação futura)

- **Criar:** `apps/crm/public/brand/valepan-logo.svg` (+ opcional `valepan-logo-full.svg`)
- **Modificar:** `apps/crm/app/(dashboard)/layout.tsx`, `apps/crm/app/(dashboard)/dashboard-nav.tsx`, opcionalmente `apps/crm/app/login/login-form.tsx` / `login/page.tsx` para logo full.

## Testes

- Smoke: dashboard, leads, inbox — header alinhado, nav ativa, toque/clique em logo e Sair.
- Verificação rápida de contraste no sub-bloco da direita.

## Próximo passo

Após revisão deste spec, criar plano de implementação em `docs/superpowers/plans/` (skill **writing-plans**) com tarefas atómicas (copiar assets → layout → nav → smoke).
