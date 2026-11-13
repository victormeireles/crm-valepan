# Inbox Rail + Unread + Compact Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** No `/inbox`, trocar o dropdown de listas por uma rail com badges de conversas não lidas, chips Tudo/Não lidas, cards compactos e ação “Marcar como não lida”.

**Architecture:** Estender `crm.inbox_sidebar_snapshot` (merge Novos→Leads, filtro `p_unread`, contagens unread por tab). Actions `markConversationUnread` + refresh. UI em `inbox-sidebar.tsx` (rail + chips + card). Identidade Valepan (`--vp-wine`).

**Tech Stack:** Next.js (apps/crm), Supabase/Postgres SQL, Vitest + PGlite (`inbox-sidebar-snapshot.test.ts`), React client components.

**Spec:** `docs/superpowers/specs/2026-11-13-inbox-whatsapp-nav-unread-design.md`

## Global Constraints

- Contagens = **conversas** não lidas (não mensagens)
- Chips escopados à lista ativa da rail
- Cores de unread = Valepan vinho (não verde WhatsApp)
- Card: só avatar, nome, horário, preview 1 linha, bolinha
- Não redesenhar thread central nem ficha do lead
- Não usar CLI Vercel; migrations via SQL em `apps/crm/supabase/migrations/`
- TDD: teste falha → implementa → passa → commit por task

## File map

| File | Responsibility |
|------|----------------|
| `apps/crm/app/(dashboard)/inbox/inbox-location.ts` | Tabs (`leads`\|`groups`\|`clientes`\|`perdidos`), alias `novos`→`leads`, URL `unread`, helpers |
| `apps/crm/app/(dashboard)/inbox/inbox-location.test.ts` | Testes unitários de URL/tabs |
| `apps/crm/supabase/migrations/20261113120000_inbox_sidebar_leads_merge_unread.sql` | Snapshot: merge leads, `p_unread`, unread counts |
| `apps/crm/lib/inbox-sidebar-snapshot.test.ts` | Testes PGlite do snapshot |
| `apps/crm/lib/database.types.ts` | Args/Returns do RPC |
| `apps/crm/app/actions/inbox.ts` | `markConversationUnread`, `refreshInboxSidebar` com unread |
| `apps/crm/app/(dashboard)/inbox/mark-conversation-read.tsx` | Respeitar suppress após “marcar não lida” |
| `apps/crm/app/(dashboard)/inbox/page.tsx` | Default tab `leads`, passar unread counts + `unread` param |
| `apps/crm/app/(dashboard)/inbox/inbox-sidebar.tsx` | Rail, chips, card compacto, menu marcar não lida |
| `apps/crm/components/crm-icon.tsx` | Ícone `groups` (se faltar) |

---

### Task 1: `inbox-location` — tabs, alias e filtro unread

**Files:**
- Modify: `apps/crm/app/(dashboard)/inbox/inbox-location.ts`
- Create: `apps/crm/app/(dashboard)/inbox/inbox-location.test.ts`

**Interfaces:**
- Produces:
  - `export type InboxTab = "leads" | "groups" | "clientes" | "perdidos"`
  - `export type InboxUnreadCounts = Record<InboxTab, number>`
  - `inboxTabFromParam(value): InboxTab` — `"novos"` / `"pipeline"` → `"leads"`; default `"leads"`
  - `inboxUnreadFromParam(value): boolean` — `"1"` / `"true"` → true
  - `inboxShareHref({ tab, page, cid?, lookup?, q?, unread? })`
  - `sumInboxTabCounts(counts: InboxTabCounts): number` — sem `novos`
  - `formatUnreadBadge(n: number): string` — `""` se 0; `"99+"` se ≥100; senão String(n)

- [ ] **Step 1: Write failing tests**

```ts
// apps/crm/app/(dashboard)/inbox/inbox-location.test.ts
import { describe, expect, it } from "vitest";
import {
  formatUnreadBadge,
  inboxShareHref,
  inboxTabFromParam,
  inboxUnreadFromParam,
  sumInboxTabCounts,
} from "./inbox-location";

describe("inbox-location", () => {
  it("aliases novos/pipeline to leads and defaults to leads", () => {
    expect(inboxTabFromParam("novos")).toBe("leads");
    expect(inboxTabFromParam("pipeline")).toBe("leads");
    expect(inboxTabFromParam(null)).toBe("leads");
    expect(inboxTabFromParam("groups")).toBe("groups");
  });

  it("parses unread flag", () => {
    expect(inboxUnreadFromParam("1")).toBe(true);
    expect(inboxUnreadFromParam("true")).toBe(true);
    expect(inboxUnreadFromParam(null)).toBe(false);
  });

  it("includes unread in share href when set", () => {
    expect(inboxShareHref({ tab: "leads", page: 1, unread: true })).toBe(
      "/inbox?tab=leads&unread=1",
    );
    expect(inboxShareHref({ tab: "leads", page: 1 })).toBe("/inbox?tab=leads");
  });

  it("sums tab counts without novos", () => {
    expect(
      sumInboxTabCounts({ leads: 2, groups: 1, clientes: 3, perdidos: 4 }),
    ).toBe(10);
  });

  it("formats unread badge", () => {
    expect(formatUnreadBadge(0)).toBe("");
    expect(formatUnreadBadge(3)).toBe("3");
    expect(formatUnreadBadge(100)).toBe("99+");
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run (from `apps/crm`):

```bash
npx vitest run app/(dashboard)/inbox/inbox-location.test.ts
```

Expected: FAIL (tipos/funções ausentes ou ainda com `novos`).

- [ ] **Step 3: Implement**

Atualizar `inbox-location.ts`:

```ts
export type InboxTab = "leads" | "groups" | "clientes" | "perdidos";
export type InboxSearchScope = InboxTab | "all";
export type InboxTabCounts = Record<InboxTab, number>;
export type InboxUnreadCounts = Record<InboxTab, number>;

export function inboxTabFromParam(value: string | null | undefined): InboxTab {
  if (value === "groups" || value === "clientes" || value === "perdidos" || value === "leads") {
    return value;
  }
  if (value === "novos" || value === "pipeline" || value === "archived") {
    if (value === "archived") return "clientes";
    return "leads";
  }
  return "leads";
}

export function inboxUnreadFromParam(value: string | null | undefined): boolean {
  return value === "1" || value === "true";
}

export function formatUnreadBadge(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "";
  if (n >= 100) return "99+";
  return String(Math.floor(n));
}

export function sumInboxTabCounts(counts: InboxTabCounts): number {
  return counts.leads + counts.groups + counts.clientes + counts.perdidos;
}

export function inboxShareHref(input: {
  tab: InboxSearchScope;
  page: number;
  cid?: string | null;
  lookup?: boolean;
  q?: string | null;
  unread?: boolean;
}) {
  const params = new URLSearchParams({ tab: input.tab });
  if (input.page > 1) params.set("page", String(input.page));
  if (input.cid) params.set("cid", input.cid);
  if (input.lookup) params.set("lookup", "1");
  if (input.q?.trim()) params.set("q", input.q.trim());
  if (input.unread) params.set("unread", "1");
  return `/inbox?${params.toString()}`;
}

// isInboxTab / inboxSearchScopeFromParam / client hrefs: alinhar ao novo InboxTab;
// readInboxLocation: ler unread do hash ou searchParams (mesmo padrão de tab/page/cid).
```

Ajustar `isInboxTab` para **não** aceitar `"novos"` como tab viva (alias só em `inboxTabFromParam`).

- [ ] **Step 4: Run tests — expect PASS**

```bash
npx vitest run app/(dashboard)/inbox/inbox-location.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add apps/crm/app/(dashboard)/inbox/inbox-location.ts apps/crm/app/(dashboard)/inbox/inbox-location.test.ts
git commit -m "feat(inbox): tabs sem novos e helper de filtro unread"
```

---

### Task 2: Migration snapshot — merge Leads + unread

**Files:**
- Create: `apps/crm/supabase/migrations/20261113120000_inbox_sidebar_leads_merge_unread.sql`
- Modify: `apps/crm/lib/inbox-sidebar-snapshot.test.ts`
- Modify: `apps/crm/lib/database.types.ts` (Args/Returns)

**Interfaces:**
- Produces RPC `crm.inbox_sidebar_snapshot(..., p_unread boolean default false)` com colunas extras:
  - `leads_unread_count`, `groups_unread_count`, `clientes_unread_count`, `perdidos_unread_count` (bigint)
- `leads_count` = conversas com `is_novos OR is_lead` (merge)
- `p_tab` in (`leads`,`novos`,`pipeline`) → filtro `is_novos OR is_lead`
- `p_unread = true` → só linhas unread: `last_inbound_sent_at is not null and (last_read_at is null or last_inbound_sent_at > last_read_at)`
- Default `p_tab` default `'leads'`
- Manter `novos_count` no RETURNS (compat): pode continuar contando só `is_novos` **ou** espelhar 0; UI não usa. Preferência: manter `novos_count` como count(`is_novos`) para debug, sem tab UI.

- [ ] **Step 1: Extend PGlite test expectations (fail first)**

No `inbox-sidebar-snapshot.test.ts`, após carregar migrations existentes, **também** `await db.exec(sql("20261113120000_inbox_sidebar_leads_merge_unread.sql"));`.

Atualizar asserts:

```ts
// tab leads inclui estágio LEADS (qualify) + NEGOCIAÇÃO (pipeline)
const leads = await db.query<{ last_body_preview: string | null }>(
  `select last_body_preview from crm.inbox_sidebar_snapshot('2026-08-01T03:00:00Z', 'leads', 0, 20, null, false)
   where conversation_id is not null`,
);
expect(leads.rows.map((r) => r.last_body_preview).sort()).toEqual(
  ["ultima pipeline", "ultima qualify"].sort(),
);

// tab novos alias → mesmo conjunto
const novosAlias = await db.query<{ tab_total: number }>(
  `select tab_total from crm.inbox_sidebar_snapshot('2026-08-01T03:00:00Z', 'novos', 0, 20, null, false) limit 1`,
);
expect(novosAlias.rows[0]?.tab_total).toBe(2);

// unread counts + filtro: marcar qualify como unread
await db.exec(`
  update crm.conversations c set last_read_at = null
  from crm.leads l where c.lead_id = l.id and l.phone_e164 = '+5511111111111';
  update crm.conversations c set last_read_at = '2026-09-20T00:00:00Z'
  from crm.leads l where c.lead_id = l.id and l.phone_e164 = '+5511111111113';
`);
// garantir last_inbound_sent_at nas conversas (se a migration/base já popula via messages — senão update explícito no teste)

const meta = await db.query<{
  leads_count: number;
  leads_unread_count: number;
}>(
  `select leads_count, leads_unread_count
   from crm.inbox_sidebar_snapshot('2026-08-01T03:00:00Z', 'leads', 0, 20, null, false) limit 1`,
);
expect(meta.rows[0]?.leads_count).toBe(2);
expect(meta.rows[0]?.leads_unread_count).toBeGreaterThanOrEqual(1);

const unreadOnly = await db.query<{ last_body_preview: string | null }>(
  `select last_body_preview from crm.inbox_sidebar_snapshot('2026-08-01T03:00:00Z', 'leads', 0, 20, null, true)
   where conversation_id is not null`,
);
expect(unreadOnly.rows.every((r) => r.last_body_preview === "ultima qualify")).toBe(true);
```

Ajustar o assert antigo que esperava `novos_count: 1, leads_count: 1` para `leads_count: 2` (e `novos_count` conforme escolha da migration).

- [ ] **Step 2: Run test — expect FAIL**

```bash
npx vitest run lib/inbox-sidebar-snapshot.test.ts
```

Expected: FAIL (migration ausente / assinatura antiga).

- [ ] **Step 3: Write migration**

Criar `20261113120000_inbox_sidebar_leads_merge_unread.sql` como `create or replace function` baseado na última versão (`20261112191046_fix_inbox_sidebar_utf8_accents.sql`), com estas mudanças pontuais:

1. Assinatura: adicionar `p_unread boolean default false`; default `p_tab` → `'leads'`.
2. Em `flagged`, manter `is_novos` / `is_lead`; definir unread:

```sql
(
  classified.last_inbound_sent_at is not null
  and (
    classified.last_read_at is null
    or classified.last_inbound_sent_at > classified.last_read_at
  )
) as is_unread
```

3. Em `counts`:

```sql
count(*) filter (where is_novos or is_lead)::bigint as leads_count,
count(*) filter (where (is_novos or is_lead) and is_unread)::bigint as leads_unread_count,
count(*) filter (where is_group and is_unread)::bigint as groups_unread_count,
count(*) filter (where is_client and is_unread)::bigint as clientes_unread_count,
count(*) filter (where is_lost and is_unread)::bigint as perdidos_unread_count,
-- manter novos_count / groups_count / clientes_count / perdidos_count como hoje
```

4. No `where` da page:

```sql
where case p_tab
  when 'all' then true
  when 'leads' then (is_novos or is_lead)
  when 'novos' then (is_novos or is_lead)
  when 'pipeline' then (is_novos or is_lead)
  when 'groups' then is_group
  when 'clientes' then is_client
  when 'archived' then is_client
  when 'perdidos' then is_lost
  else (is_novos or is_lead)
end
and (not coalesce(p_unread, false) or is_unread)
```

5. RETURNS TABLE: acrescentar as 4 colunas `*_unread_count`; `grant execute` / `revoke` iguais ao arquivo base (atualizar overload se Postgres exigir drop da assinatura antiga — se só adicionar param com default, `create or replace` na mesma família de args pode falhar: usar `drop function if exists crm.inbox_sidebar_snapshot(timestamptz, text, integer, integer, text);` antes do create com 6 args).

6. Atualizar `database.types.ts` Args (`p_unread?: boolean`) e Returns (4 unread counts).

- [ ] **Step 4: Run tests — expect PASS**

```bash
npx vitest run lib/inbox-sidebar-snapshot.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add apps/crm/supabase/migrations/20261113120000_inbox_sidebar_leads_merge_unread.sql apps/crm/lib/inbox-sidebar-snapshot.test.ts apps/crm/lib/database.types.ts
git commit -m "feat(inbox): snapshot une leads e conta nao lidas por tab"
```

---

### Task 3: Actions — `markConversationUnread` + refresh

**Files:**
- Modify: `apps/crm/app/actions/inbox.ts`
- Modify: `apps/crm/app/(dashboard)/inbox/mark-conversation-read.tsx`

**Interfaces:**
- Produces:
  - `markConversationUnread(conversationId: string): Promise<{ ok: true } | { ok: false; error: string }>`
  - `refreshInboxSidebar({ tab, page, query?, unread? })` retorna também `unreadCounts: InboxUnreadCounts`
- Consumes: RPC com `p_unread`

- [ ] **Step 1: Add `markConversationUnread` next to `markConversationRead`**

```ts
export async function markConversationUnread(conversationId: string) {
  const id = conversationId.trim();
  if (!id) return { ok: false as const, error: "Conversa inválida." };

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Não autenticado" };

  const crm = crmTables(supabase);
  const { error } = await crm
    .from("conversations")
    .update({ last_read_at: null })
    .eq("id", id);

  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}
```

- [ ] **Step 2: Wire refresh**

Em `refreshInboxSidebar`:

```ts
export async function refreshInboxSidebar(input: {
  tab: InboxSearchScope;
  page: number;
  query?: string | null;
  unread?: boolean;
}) {
  // ...
  crm.rpc("inbox_sidebar_snapshot", {
    p_messages_visible_since: INBOX_MESSAGES_VISIBLE_SINCE,
    p_tab: input.tab,
    p_offset: (page - 1) * 20,
    p_limit: 20,
    p_query: query,
    p_unread: Boolean(input.unread),
  })
  // tabCounts sem novos:
  tabCounts: {
    leads: Number(meta?.leads_count ?? 0),
    groups: Number(meta?.groups_count ?? 0),
    clientes: Number(meta?.clientes_count ?? 0),
    perdidos: Number(meta?.perdidos_count ?? 0),
  },
  unreadCounts: {
    leads: Number(meta?.leads_unread_count ?? 0),
    groups: Number(meta?.groups_unread_count ?? 0),
    clientes: Number(meta?.clientes_unread_count ?? 0),
    perdidos: Number(meta?.perdidos_unread_count ?? 0),
  },
}
```

Corrigir **todos** os call sites de `tabCounts.novos` / `InboxTabCounts` no CRM (page, sidebar) nesta task ou na Task 4 — não deixar TypeScript quebrado.

- [ ] **Step 3: Suppress auto-read after mark unread**

Em `mark-conversation-read.tsx`:

```tsx
useEffect(() => {
  const onUnread = (event: Event) => {
    const id = (event as CustomEvent<{ conversationId?: string }>).detail?.conversationId;
    if (id) suppressedRef.current = id;
  };
  window.addEventListener("crm:conversation-unread", onUnread);
  return () => window.removeEventListener("crm:conversation-unread", onUnread);
}, []);

useEffect(() => {
  if (!conversationId) return;
  if (suppressedRef.current === conversationId) return; // não marcar lida
  // ... markConversationRead existente; no sucesso dispatch crm:conversation-read
}, [conversationId, fingerprint]);

// Ao trocar de conversa, limpar suppress se cid !== suppressed
useEffect(() => {
  if (suppressedRef.current && suppressedRef.current !== conversationId) {
    suppressedRef.current = null;
  }
}, [conversationId]);
```

- [ ] **Step 4: Typecheck / tests affected**

```bash
npx vitest run app/(dashboard)/inbox/inbox-location.test.ts lib/inbox-sidebar-snapshot.test.ts
npx tsc --noEmit -p tsconfig.json
```

Expected: PASS (ou só erros pré-existentes não introduzidos).

- [ ] **Step 5: Commit**

```bash
git add apps/crm/app/actions/inbox.ts apps/crm/app/(dashboard)/inbox/mark-conversation-read.tsx
git commit -m "feat(inbox): marcar conversa como nao lida e refresh com counts"
```

---

### Task 4: `page.tsx` — default leads + props unread

**Files:**
- Modify: `apps/crm/app/(dashboard)/inbox/page.tsx`

**Interfaces:**
- Consumes: `inboxTabFromParam`, `inboxUnreadFromParam`, snapshot com `p_unread` e unread counts
- Produces props para `InboxSidebar`: `unreadCounts`, `unreadOnly` (boolean)

- [ ] **Step 1: Parse searchParams**

```ts
searchParams: Promise<{ cid?: string; tab?: string; page?: string; q?: string; lookup?: string; unread?: string }>;
// ...
const unreadOnly = inboxUnreadFromParam(sp.unread);
const activeTab = /* existing search scope logic, default leads via inboxTabFromParam */;
```

Passar `p_unread: unreadOnly` no RPC do server render.

Mapear:

```ts
tabCounts: { leads, groups, clientes, perdidos }
unreadCounts: { leads: leads_unread_count, ... }
```

- [ ] **Step 2: Pass props to sidebar**

```tsx
<InboxSidebar
  ...
  unreadCounts={unreadCounts}
  unreadOnly={unreadOnly}
/>
```

- [ ] **Step 3: Smoke typecheck**

```bash
npx tsc --noEmit -p tsconfig.json
```

- [ ] **Step 4: Commit**

```bash
git add apps/crm/app/(dashboard)/inbox/page.tsx
git commit -m "feat(inbox): pagina usa tab leads e filtro unread"
```

---

### Task 5: UI — rail, chips, card compacto, menu

**Files:**
- Modify: `apps/crm/app/(dashboard)/inbox/inbox-sidebar.tsx`
- Modify: `apps/crm/components/crm-icon.tsx` (adicionar `groups` se necessário)

**Interfaces:**
- Consumes: `formatUnreadBadge`, `markConversationUnread`, `unreadCounts`, `unreadOnly`, `refreshInboxSidebar({ unread })`
- Rail tabs:  
  - leads → icon `chat`  
  - groups → icon `groups` (novo path SVG simples de 2–3 silhuetas)  
  - clientes → icon `archive`  
  - perdidos → icon `flag`

- [ ] **Step 1: Add `groups` icon to `crm-icon.tsx`**

Incluir `"groups"` em `CrmIconName` + path SVG (outline, stroke consistente com os demais).

- [ ] **Step 2: Replace dropdown with rail + chips**

Estrutura:

```tsx
<div className="flex h-full min-h-0 flex-1">
  <nav aria-label="Listas do inbox" className="flex w-14 shrink-0 flex-col items-center gap-1 border-r ... py-2">
    {RAIL.map(({ tab, label, icon }) => (
      <button
        key={tab}
        type="button"
        title={label}
        aria-label={label}
        aria-current={liveTab === tab ? "page" : undefined}
        onClick={() => loadList(tab, 1, "push", qRef.current, /* unread */ false)}
        className={/* ativo vinho */}
      >
        <CrmIcon name={icon} />
        {formatUnreadBadge(liveUnreadCounts[tab]) ? (
          <span className="absolute ... bg-[var(--vp-wine)] text-[var(--vp-paper-pure)]">
            {formatUnreadBadge(liveUnreadCounts[tab])}
          </span>
        ) : null}
      </button>
    ))}
  </nav>
  <div className="flex min-h-0 flex-1 flex-col">
    {/* search */}
    <div className="flex gap-1.5 px-3 pb-2" role="tablist" aria-label="Filtro de leitura">
      <button type="button" role="tab" aria-selected={!unreadOnly} onClick={() => setUnreadFilter(false)}>Tudo</button>
      <button type="button" role="tab" aria-selected={unreadOnly} onClick={() => setUnreadFilter(true)}>
        Não lidas{x ? ` ${x}` : ""}
      </button>
    </div>
    {/* list */}
  </div>
</div>
```

`x` = `liveUnreadCounts[liveTab]` quando `isInboxTab(liveTab)`.

Ao trocar rail: `unreadOnly → false`, page 1.  
`loadList` / URL: incluir `unread=1` via `inboxShareHref` / `pushInboxClientUrl` quando filtro ativo.  
`refreshInboxSidebar({ ..., unread: unreadOnly })`.  
Estado `liveUnreadCounts` atualizado no `applySidebarResult`.

- [ ] **Step 3: Compact card**

Remover: `CategoryBadge`, linha empresa/telefone, bloco de chips etapa/volume, bolinha no avatar.  
Layout:

```tsx
<a className="block px-3 py-2 pr-10">
  <div className="flex items-center gap-2.5">
    <ContactAvatar className="size-10" ... />
    <div className="min-w-0 flex-1">
      <div className="flex items-baseline gap-2">
        <span className="truncate text-sm font-bold">{c.identityName}</span>
        <ConversationElapsed ... />
      </div>
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-xs text-[var(--vp-ink-muted)]">{c.preview}</p>
        {c.unread && !readIds.has(c.id) ? (
          <span className="size-2.5 shrink-0 rounded-full bg-[var(--vp-wine)]" aria-label="Não lida" />
        ) : null}
      </div>
    </div>
  </div>
  {/* call status mínimo se ringing/missed — inline, sem inflar tags */}
</a>
```

- [ ] **Step 4: Menu “Marcar como não lida”**

```tsx
<button
  type="button"
  disabled={savingId === c.id}
  onClick={async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setSavingId(c.id);
    const res = await markConversationUnread(c.id);
    setSavingId(null);
    if (!res.ok) {
      setErrorById((prev) => ({ ...prev, [c.id]: res.error ?? "Erro ao marcar." }));
      return;
    }
    window.dispatchEvent(new CustomEvent("crm:conversation-unread", { detail: { conversationId: c.id } }));
    setReadIds((prev) => { const n = new Set(prev); n.delete(c.id); return n; });
    setLiveConversations((rows) => rows.map((r) => r.id === c.id ? { ...r, unread: true } : r));
    setLiveUnreadCounts((counts) => {
      if (!isInboxTab(liveTab)) return counts;
      return { ...counts, [liveTab]: counts[liveTab] + (/* se já era unread, 0 senão 1 */) };
    });
    setOpenMenuId(null);
    // se unreadOnly e a lista deve refletir: opcional reload silencioso
  }}
>
  Marcar como não lida
</button>
```

Incremento do badge: só se `!c.unread && !readIds.has(c.id)` era false antes — se já unread, não somar.

Mostrar item do menu só quando a conversa **está lida** (ou sempre, no-op se já unread — preferência: sempre visível; se já unread, disabled “Já não lida”).

- [ ] **Step 5: Manual / visual check**

Run `npm run dev` no `apps/crm`, abrir `/inbox`:

1. Rail 4 ícones; badge quando há unread  
2. Chips Tudo / Não lidas  
3. Cards baixos sem tags  
4. Marcar não lida → bolinha + badge; conversa aberta não “re-lê” até trocar cid  

- [ ] **Step 6: Commit**

```bash
git add apps/crm/app/(dashboard)/inbox/inbox-sidebar.tsx apps/crm/components/crm-icon.tsx
git commit -m "feat(inbox): rail, chips nao lidas e cards compactos"
```

---

### Task 6: Verificação final

- [ ] **Step 1: Run full relevant tests**

```bash
cd apps/crm
npx vitest run app/(dashboard)/inbox/inbox-location.test.ts lib/inbox-sidebar-snapshot.test.ts
npx tsc --noEmit -p tsconfig.json
```

Expected: PASS.

- [ ] **Step 2: Spec checklist**

- [ ] Rail Leads/Grupos/Clientes/Perdidos  
- [ ] Merge Novos→Leads  
- [ ] Badge = conversas não lidas  
- [ ] Chips Tudo / Não lidas x na lista ativa  
- [ ] Marcar não lida no menu  
- [ ] Bolinha à direita  
- [ ] Sem tags etapa/volume no card  
- [ ] Cor vinho  

- [ ] **Step 3: Commit vazio só se houver leftovers**; senão done.

---

## Self-review (plan vs spec)

| Spec requirement | Task |
|------------------|------|
| Rail 4 ícones + tooltip/aria | Task 5 |
| Badge unread conversas / 99+ | Task 1 `formatUnreadBadge` + Task 5 |
| Merge Novos+Leads | Task 2 |
| Alias `tab=novos` | Task 1 + 2 |
| Chips Tudo / Não lidas no escopo da rail | Task 5 + filter Task 2/3 |
| mark unread + não anular se aberta | Task 3 |
| Card compacto + bolinha | Task 5 |
| Snapshot unread counts | Task 2 |
| Fora de escopo (thread/ficha/verde) | Não há tasks |

Placeholder scan: nenhum TBD. Tipos `InboxUnreadCounts` / `p_unread` consistentes entre tasks 1–5.
