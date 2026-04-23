# CRM Valepan — marketing redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrar o app `apps/crm` do tema neutro/azul para tokens e UI da superfície **marketing** Valepan (spec em `docs/superpowers/specs/2026-04-23-crm-valepan-marketing-redesign-design.md`), sem tema escuro e mantendo header superior.

**Architecture:** (1) Arquivo `valepan-tokens.css` com `:root` alinhado à skill design-system (fontes Manrope/Bebas + Material Symbols Outlined, paleta `--vp-*`, sombras quentes, motion). (2) `globals.css` importa tokens + Tailwind, remove `prefers-color-scheme` escuro, aplica aliases legados (`--foreground`, `--accent`, etc.) e estilos base (foco, `prefers-reduced-motion`). (3) Layout raiz com `next/font` opcional ou herança de CSS. (4) Header com nav cliente para estado ativo. (5) Demais TSX continuam usando `var(--border)` etc. onde aliases cobrirem; ajustes pontuais (chat, links) onde ainda houver cor fria literal.

**Tech Stack:** Next.js 16 (App Router), React 19, Tailwind CSS 4 (`@import "tailwindcss"`), TypeScript, npm workspaces. **Sem** Playwright/Vitest nas rotas do CRM — validação por `npm run typecheck`, `npm run lint` e smoke manual.

---

## Mapa de arquivos

| Caminho | Responsabilidade |
|---------|-------------------|
| `apps/crm/app/valepan-tokens.css` | **Criar** — imports Google Fonts + Material Symbols; bloco `:root` com tokens `--vp-*`, `--fg*`, `--bg*`, `--sh-*`, `--r-*`, `--ease-*`, `--container-*` (espelho da skill; sem usar `--vp-dash-*` nas classes do CRM). |
| `apps/crm/app/globals.css` | **Modificar** — importar `valepan-tokens.css` antes do Tailwind; segundo `:root` com aliases CRM; `body`; `:focus-visible`; `prefers-reduced-motion`; remover tema escuro antigo. |
| `apps/crm/app/layout.tsx` | **Modificar** — `className` no `body` com fonte Manrope (via `next/font/google` ou classe que use `var(--font-body)`). |
| `apps/crm/lib/dashboard-nav.ts` | **Criar** — array único de itens de nav (href + label) para DRY entre layout e nav cliente. |
| `apps/crm/app/(dashboard)/dashboard-nav.tsx` | **Criar** — `'use client'`, `usePathname`, links com estado ativo (vinho + indicador dourado). |
| `apps/crm/app/(dashboard)/layout.tsx` | **Modificar** — header Valepan; `max-w-[min(100%,var(--container-wide))]`; usar `dashboard-nav`; botão Sair estilizado; fundo papel. |
| `apps/crm/app/login/page.tsx` | **Modificar** — cartão central spec A. |
| `apps/crm/app/login/login-form.tsx` | **Modificar** — inputs, botão primário, título opcional Bebas. |
| `apps/crm/app/page.tsx` | **Modificar** — remover dependência de azul literal; usar tokens. |
| `apps/crm/app/(dashboard)/inbox/chat-thread.tsx` | **Modificar** — bolhas saída: vinho + texto dourado/claro; remover `text-blue-*`. |
| Restantes em `apps/crm/app/(dashboard)/**/*.tsx` | **Modificar** — apenas onde houver classes literais frias (`blue-`, `neutral-`, etc.); manter `var(--*)` se aliases forem suficientes. |

---

### Task 1: Baseline e tokens Valepan

**Files:**
- Create: `apps/crm/app/valepan-tokens.css`
- Modify: `apps/crm/app/globals.css`

- [ ] **Step 1: Baseline de tipo**

Run na raiz do monorepo:

```bash
npm run typecheck
```

Expected: conclui sem erros de TypeScript.

- [ ] **Step 2: Criar `valepan-tokens.css`**

Crie `apps/crm/app/valepan-tokens.css` com o conteúdo **exato** abaixo (fontes + `:root` completo; **não** incluir regras `html`, `h1`, `p` do final do arquivo original da skill — só tokens).

```css
/* Valepan marketing tokens — alinhado à skill design-system/colors_and_type.css */
@import url("https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Bebas+Neue&display=swap");
@import url("https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0");

:root {
  --vp-wine: #230004;
  --vp-wine-classic: #4a0b16;
  --vp-wine-container: #4d0011;
  --vp-wine-dark: #3a0a12;
  --vp-wine-soft: #7f2732;
  --vp-wine-tint: #9e3e48;
  --vp-wine-muted: #d56871;
  --vp-gold: #ffd573;
  --vp-gold-classic: #c7a64d;
  --vp-gold-deep: #775a00;
  --vp-gold-deeper: #5a4300;
  --vp-gold-pale: #ffdf98;
  --vp-gold-dim: #e9c262;
  --vp-gold-cream: #fff8e8;
  --vp-paper: #fff8f7;
  --vp-paper-pure: #ffffff;
  --vp-surface-low: #fdf1f2;
  --vp-surface: #f7ebec;
  --vp-surface-high: #f1e5e6;
  --vp-surface-highest: #ebe0e1;
  --vp-surface-dim: #e3d7d8;
  --vp-ink: #0d0d08;
  --vp-ink-body: #201a1b;
  --vp-ink-muted: #554243;
  --vp-ink-soft: #887272;
  --vp-ink-line: #dbc0c0;
  --vp-inverse-surface: #352f30;
  --vp-inverse-on-surf: #faeeef;
  --vp-error: #ba1a1a;
  --vp-error-container: #ffdad6;
  --vp-on-error-container: #93000a;
  --vp-whatsapp: #25d366;
  --vp-whatsapp-hover: #1fb855;
  --fg1: var(--vp-ink-body);
  --fg2: var(--vp-ink-muted);
  --fg3: var(--vp-ink-soft);
  --fg-inverse: var(--vp-paper);
  --bg1: var(--vp-paper);
  --bg2: var(--vp-surface);
  --bg-elevated: var(--vp-paper-pure);
  --bg-inverse: var(--vp-wine);
  --brand: var(--vp-wine);
  --brand-contrast: var(--vp-gold);
  --border-strong: rgba(35, 0, 4, 0.18);
  --font-body: "Manrope", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --font-display: "Bebas Neue", "Manrope", sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  --font-h1: var(--font-display);
  --font-h2: var(--font-display);
  --font-h3: var(--font-body);
  --fs-display: clamp(48px, 8vw, 96px);
  --fs-h1: clamp(40px, 6vw, 72px);
  --fs-h2: clamp(32px, 5vw, 56px);
  --fs-h3: clamp(24px, 3vw, 40px);
  --fs-h4: clamp(20px, 2.5vw, 28px);
  --fs-lg: 1.125rem;
  --fs-body: 1rem;
  --fs-sm: 0.875rem;
  --fs-xs: 0.75rem;
  --fs-xxs: 0.6875rem;
  --lh-tight: 1.1;
  --lh-snug: 1.25;
  --lh-body: 1.6;
  --tracking-eyebrow: 0.28em;
  --tracking-caps: 0.06em;
  --tracking-display: -0.02em;
  --sp-1: 0.25rem;
  --sp-2: 0.5rem;
  --sp-3: 0.75rem;
  --sp-4: 1rem;
  --sp-5: 1.25rem;
  --sp-6: 1.5rem;
  --sp-8: 2rem;
  --r-sm: 0.5rem;
  --r-lg: 1rem;
  --r-xl: 1.25rem;
  --r-2xl: 1.5rem;
  --r-pill: 9999px;
  --sh-sm: 0 4px 14px rgba(35, 0, 4, 0.08);
  --sh-md: 0 10px 30px rgba(35, 0, 4, 0.1);
  --sh-lg: 0 10px 40px rgba(35, 0, 4, 0.12);
  --sh-xl: 0 20px 60px rgba(35, 0, 4, 0.15);
  --sh-gold: 0 8px 24px rgba(199, 166, 77, 0.3);
  --ease-out-quint: cubic-bezier(0.22, 1, 0.36, 1);
  --ease-in-out-cubic: cubic-bezier(0.645, 0.045, 0.355, 1);
  --dur-fast: 0.2s;
  --dur-base: 0.3s;
  --container-max: 1200px;
  --container-wide: 1400px;
  --header-height: 80px;
}
```

- [ ] **Step 3: Reescrever `globals.css`**

Substitua o conteúdo de `apps/crm/app/globals.css` por:

```css
@import "./valepan-tokens.css";
@import "tailwindcss";

/* Aliases usados pelos componentes atuais (var(--border), etc.) */
:root {
  --background: var(--vp-paper);
  --foreground: var(--vp-ink-body);
  --card: var(--vp-surface-low);
  --muted: var(--vp-ink-muted);
  --border: var(--vp-ink-line);
  --accent: var(--vp-wine);
}

body {
  background: var(--background);
  color: var(--foreground);
  font-family: var(--font-body);
  line-height: var(--lh-body);
}

.material-symbols-outlined {
  font-family: "Material Symbols Outlined";
  font-weight: normal;
  font-style: normal;
  font-size: 24px;
  line-height: 1;
  letter-spacing: normal;
  text-transform: none;
  display: inline-block;
  white-space: nowrap;
  word-wrap: normal;
  direction: ltr;
  font-variation-settings: "FILL" 0, "wght" 400, "GRAD" 0, "opsz" 24;
}

:focus-visible {
  outline: 2px solid var(--vp-gold-deep);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

Remova qualquer `@media (prefers-color-scheme: dark)` e o `:root` antigo com `#fafafa` / azul.

- [ ] **Step 4: Verificar tipos e lint**

```bash
npm run typecheck
npm run lint
```

Expected: ambos passam.

- [ ] **Step 5: Commit**

```bash
git add apps/crm/app/valepan-tokens.css apps/crm/app/globals.css
git commit -m "feat(crm): tokens Valepan marketing e aliases globais"
```

---

### Task 2: Fonte Manrope no layout raiz

**Files:**
- Modify: `apps/crm/app/layout.tsx`

- [ ] **Step 1: Importar Manrope via next/font**

Altere `apps/crm/app/layout.tsx` para aplicar Manrope ao `body` (Bebas continua disponível via CSS `var(--font-display)` para títulos pontuais).

```tsx
import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";

const manrope = Manrope({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-manrope-next",
  display: "swap",
});

export const metadata: Metadata = {
  title: "CRM Valepan",
  description: "CRM comercial integrado ao WhatsApp",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className={manrope.variable}>
      <body className={`min-h-screen antialiased ${manrope.className}`}>{children}</body>
    </html>
  );
}
```

O `globals.css` mantém `font-family: var(--font-body)` no `body`; o `manrope.className` no `body` sobrepõe com a família correta do Next.js (evita depender de `--font-manrope-next` no CSS).

- [ ] **Step 2: typecheck + commit**

```bash
npm run typecheck
git add apps/crm/app/layout.tsx
git commit -m "feat(crm): Manrope via next/font no layout raiz"
```

---

### Task 3: Nav compartilhada e header dashboard

**Files:**
- Create: `apps/crm/lib/dashboard-nav.ts`
- Create: `apps/crm/app/(dashboard)/dashboard-nav.tsx`
- Modify: `apps/crm/app/(dashboard)/layout.tsx`

- [ ] **Step 1: Constante de nav**

Crie `apps/crm/lib/dashboard-nav.ts`:

```ts
export const dashboardNavLinks = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/inbox", label: "Inbox" },
  { href: "/leads", label: "Leads" },
  { href: "/pipeline", label: "Funil" },
  { href: "/tasks", label: "Tarefas" },
  { href: "/distributors", label: "Distribuidores" },
  { href: "/samples", label: "Amostras" },
] as const;
```

- [ ] **Step 2: Componente cliente de links**

Crie `apps/crm/app/(dashboard)/dashboard-nav.tsx`:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { dashboardNavLinks } from "@/lib/dashboard-nav";

function linkActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function DashboardNav() {
  const pathname = usePathname() ?? "";

  return (
    <nav className="flex flex-wrap gap-1 text-sm">
      {dashboardNavLinks.map((n) => {
        const active = linkActive(pathname, n.href);
        return (
          <Link
            key={n.href}
            href={n.href}
            className={`rounded-md px-2 py-1 transition-colors duration-200 ${
              active
                ? "bg-[var(--vp-surface)] font-medium text-[var(--vp-wine)] ring-1 ring-[var(--vp-gold-classic)]/40"
                : "text-[var(--muted)] hover:bg-[var(--vp-surface-low)] hover:text-[var(--foreground)]"
            }`}
          >
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 3: Atualizar `layout.tsx` do dashboard**

Em `apps/crm/app/(dashboard)/layout.tsx`:

1. Remova o array `nav` local e importe `DashboardNav` de `./dashboard-nav`.
2. Troque o `<nav className="flex...">` com o map por `<DashboardNav />`.
3. Ajuste o header para fundo `bg-[var(--background)]`, borda inferior `border-[color:var(--border-strong)]` ou `border-b border-[var(--vp-wine)]/15`, container `mx-auto flex min-h-[var(--header-height)] max-w-[min(100%,var(--container-wide))] ...`, marca com `text-[var(--vp-wine)]` e peso forte (Manrope).
4. Botão Sair: `border-[var(--border-strong)] text-[var(--foreground)] hover:bg-[var(--vp-surface-low)]` (outline quente).

- [ ] **Step 4: typecheck + commit**

```bash
npm run typecheck
git add apps/crm/lib/dashboard-nav.ts "apps/crm/app/(dashboard)/dashboard-nav.tsx" "apps/crm/app/(dashboard)/layout.tsx"
git commit -m "feat(crm): header Valepan e nav com estado ativo"
```

---

### Task 4: Login (cartão simples + Bebas leve)

**Files:**
- Modify: `apps/crm/app/login/page.tsx`
- Modify: `apps/crm/app/login/login-form.tsx`

- [ ] **Step 1: `login/page.tsx`**

Use fundo papel e área central; envolva `{children}` ou o conteúdo com um wrapper alinhado ao spec (sem splash radial).

Exemplo de estrutura para o `main`:

```tsx
<main className="mx-auto flex min-h-screen max-w-md flex-col justify-center bg-[var(--background)] p-8">
  {/* card */}
</main>
```

- [ ] **Step 2: `login-form.tsx`**

1. Cartão: `rounded-[var(--r-xl)] border border-[var(--border)] bg-[var(--card)] p-6 shadow-[var(--sh-md)]`.
2. Título: classe com `font-[family-name:var(--font-display)]` ou `style={{ fontFamily: "var(--font-display)" }}` + tamanho moderado (ex.: `text-3xl tracking-wide text-[var(--vp-wine)]`) — Bebas só aqui.
3. Inputs: `border-[var(--border)] bg-[var(--vp-paper-pure)]`, focus nativo já coberto por `:focus-visible` global.
4. Botão submit: `rounded-[var(--r-lg)] bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--vp-gold)]` (ou `text-white` se preferir contraste máximo; o spec prefere vinho/dourado — use dourado no texto).
5. Remova classes que dependam do azul antigo.

- [ ] **Step 3: typecheck + commit**

```bash
npm run typecheck
git add "apps/crm/app/login/page.tsx" "apps/crm/app/login/login-form.tsx"
git commit -m "feat(crm): login com cartão Valepan e Bebas no título"
```

---

### Task 5: Página raiz `app/page.tsx`

**Files:**
- Modify: `apps/crm/app/page.tsx`

- [ ] **Step 1: Substituir acentos frios**

Troque `bg-[var(--accent)]` em botão primário para combinar com marca: fundo vinho já vem de `--accent`; texto do botão `text-[var(--vp-gold)]`. Borda secundária: `border-[var(--border-strong)]`.

- [ ] **Step 2: typecheck + commit**

```bash
npm run typecheck
git add apps/crm/app/page.tsx
git commit -m "fix(crm): landing raiz alinhada aos tokens Valepan"
```

---

### Task 6: Inbox — bolhas e metadados (remover azul)

**Files:**
- Modify: `apps/crm/app/(dashboard)/inbox/chat-thread.tsx`

- [ ] **Step 1: Classes das bolhas “out”**

Onde hoje está `bg-[var(--accent)]` com `text-white`, use:

```tsx
"max-w-[min(88%,440px)] rounded-2xl rounded-br-sm bg-[var(--vp-wine)] px-3 py-2 text-sm text-[var(--vp-gold)] shadow-[var(--sh-sm)]"
```

- [ ] **Step 2: Metadados da mensagem**

Substitua `text-blue-100`, `text-blue-50` por tons compatíveis com bolha escura, por exemplo `text-[var(--vp-gold-pale)]` / `text-[var(--vp-gold)]/90`.

- [ ] **Step 3: typecheck + commit**

```bash
npm run typecheck
git add "apps/crm/app/(dashboard)/inbox/chat-thread.tsx"
git commit -m "fix(crm): bolhas de chat com paleta vinho e dourado"
```

---

### Task 7: Varredura de cores literais e hovers de tabela

**Files:**
- Modify (somente se `rg` encontrar ocorrências): todos os `.tsx` sob `apps/crm/app/(dashboard)/` e `apps/crm/app/login/`

- [ ] **Step 1: Buscar resíduos**

Na raiz do repo:

```bash
rg "blue-|neutral-|slate-|gray-|#2563eb|#3b82f6|text-white" apps/crm/app --glob "*.tsx"
```

- [ ] **Step 2: Corrigir cada ocorrência**

Substitua por equivalentes `--vp-*` ou `var(--…)` já definidos. Para `text-white` em botão primário vinho, prefira `text-[var(--vp-gold)]` alinhado ao spec.

- [ ] **Step 3: Opcional — hover de linha em tabelas**

Em `leads/page.tsx`, `samples/page.tsx`, etc., adicione `hover:bg-[var(--vp-surface-low)]` nas `<tr>` se ainda não houver feedback de linha.

- [ ] **Step 4: typecheck + lint + commit**

```bash
npm run typecheck
npm run lint
git add apps/crm/app
git commit -m "fix(crm): remove cores frias literais e ajusta hovers"
```

---

### Task 8: Smoke manual e build de produção

**Files:** nenhum (validação).

- [ ] **Step 1: Build**

```bash
npm run build
```

Expected: build do workspace conclui (exige env Supabase válido se o script de sync rodar — mesmo comportamento atual do projeto).

- [ ] **Step 2: Smoke checklist (manual)**

Com `npm run dev` (ou script equivalente do monorepo):

1. `/login` — cartão, foco visível, botão.
2. Após login: header, nav ativa ao mudar de rota.
3. `/leads` — tabela legível, links em vinho.
4. Um formulário (ex.: nova tarefa ou lead).
5. `/inbox` — lista + thread, bolhas saída vinho/dourado.
6. `/pipeline` — colunas e cartões sem cinza frio dominante.

- [ ] **Step 3: Commit final apenas se houver ajustes pendentes**

Se o smoke revelar gaps, corrija e:

```bash
git add apps/crm/app
git commit -m "fix(crm): ajustes pós-smoke do redesign marketing"
```

---

## Self-review (plano × spec)

| Requisito no spec | Onde no plano |
|-------------------|---------------|
| Tokens `--vp-*` marketing | Task 1 |
| Sem tema escuro | Task 1 (remoção explícita) |
| Sem uso de UI `--vp-dash-*` no CRM | Task 1 (tokens omitidos para uso; nenhuma tarefa adiciona classes dash) |
| Header superior, largura ~1200–1400 | Task 3 |
| Manrope H1–H3; Bebas pontual | Tasks 1–2 + 4 |
| Login cartão A | Task 4 |
| Foco dourado | Task 1 |
| `prefers-reduced-motion` | Task 1 |
| Material Symbols Outlined | Task 1 imports + classe helper |
| Inbox / chat sem azul | Task 6–7 |
| Smoke + typecheck | Tasks 1, 4, 7, 8 |

**Placeholder scan:** nenhum TBD no plano. **Consistência:** `--accent` é vinho para compat com TSX existentes; botões devem usar texto dourado onde antes era `text-white` em fundo vinho (Tasks 4–6).

---

## Execução

Plano salvo em `docs/superpowers/plans/2026-04-23-crm-valepan-marketing-redesign.md`. Duas formas de executar:

**1. Subagent-Driven (recomendado)** — um subagente por task, revisão entre tasks, iteração rápida. Sub-skill: `superpowers:subagent-driven-development`.

**2. Inline Execution** — executar tasks nesta sessão com checkpoints. Sub-skill: `superpowers:executing-plans`.

Qual abordagem você prefere para a implementação?
