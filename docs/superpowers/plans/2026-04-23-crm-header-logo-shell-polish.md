# CRM — logo no header e shell refinado — Implementation Plan

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aplicar o spec `docs/superpowers/specs/2026-04-23-crm-header-logo-shell-polish-design.md` (variante B): logos em `public/brand/`, header com ícone + “CRM”, nav com mais toque e indicador ativo dourado, separador, zona utilizador em cartão, sombra quente, mais padding no conteúdo; login opcional com logo full.

**Architecture:** Assets estáticos em `apps/crm/public/brand/*.svg`; header continua server component com `Image`/`img` para SVG; `DashboardNav` cliente com classes Tailwind e tokens `--vp-*`.

**Tech Stack:** Next.js App Router, Tailwind, ficheiros em `public/`.

---

### Task 1: Assets

**Files:**
- Create: `apps/crm/public/brand/valepan-logo.svg`
- Create: `apps/crm/public/brand/valepan-logo-full.svg`

- [ ] Copiar os dois SVG a partir da skill design-system (caminho no spec).
- [ ] `git add apps/crm/public/brand && git commit -m "feat(crm): logos Valepan em public/brand"`

---

### Task 2: `dashboard-nav.tsx`

**Files:** Modify `apps/crm/app/(dashboard)/dashboard-nav.tsx`

- [ ] `nav`: `gap-2 md:gap-3`, `flex-wrap`, `text-sm`.
- [ ] Links: `py-2.5 px-3`, `rounded-md`; ativo: `font-semibold text-[var(--vp-wine)] border-b-2 border-[var(--vp-gold-classic)]` (sem `ring`); inativo: `border-b-2 border-transparent text-[var(--muted)] hover:bg-[var(--vp-surface-low)] hover:text-[var(--foreground)]`.
- [ ] `npm run typecheck`

---

### Task 3: `(dashboard)/layout.tsx`

**Files:** Modify `apps/crm/app/(dashboard)/layout.tsx`

- [ ] `header`: fundo `--background`, `shadow-[var(--sh-sm)]`, **sem** `border-b` duplicado.
- [ ] `Link` `/dashboard`: `inline-flex min-h-11 items-center gap-2.5 rounded-md p-1`, `<img src="/brand/valepan-logo.svg" alt="Valepan" class="h-9 w-auto" width={40} height={37} />` (ajustar width/height ao viewBox se necessário — SVG viewBox pode ser lido) — usar `h-9` (36px) conforme spec.
- [ ] Texto **“CRM”** ao lado: `text-lg font-extrabold text-[var(--vp-wine)]`.
- [ ] Layout: grupo esquerdo `flex flex-wrap items-center gap-5` com marca + `<DashboardNav />`; grupo direito com `border-l border-[var(--border)] pl-4 md:pl-5`, dentro `rounded-lg bg-[var(--vp-surface-low)] px-3 py-2 flex flex-wrap items-center gap-3` com utilizador + formulário Sair.
- [ ] Área `children`: `py-6 md:py-8` (manter `px-4`).
- [ ] `npm run typecheck`

---

### Task 4 (opcional): Login

**Files:** Modify `apps/crm/app/login/login-form.tsx`

- [ ] Acima do cartão: `<img src="/brand/valepan-logo-full.svg" alt="Valepan" class="mx-auto mb-6 h-auto w-[200px] max-w-full" />` (ou dentro do cartão no topo).
- [ ] `npm run typecheck`

---

### Task 5: Smoke

- [ ] Abrir `/dashboard`, `/leads`, verificar nav ativa, logo clicável, Sair.
- [ ] Commit final se alterações no login.

---

## Self-review

Cobertura alinhada ao spec: assets, header B, nav, separador, sub-bloco, sombra, padding conteúdo, login opcional.
