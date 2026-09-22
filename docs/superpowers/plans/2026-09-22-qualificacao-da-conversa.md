# Qualificação automática a partir da conversa

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** No mesmo job que classifica etapa e subetapa, preencher volume semanal, endereço, tipo de cliente e CNPJ quando o cliente informar isso no chat e o campo ainda estiver vazio.

**Architecture:** A IA devolve fatos crus no mesmo JSON da classificação. Funções puras convertem caixa e período para pães/semana, validam CNPJ e escolhem o endereço. O CEP chama `lookupCep` em `apps/crm/lib/cep-lookup.ts`. A UF pelo DDD é regra de código, fora do modelo. O job grava só campo vazio, com o client admin, sem passar pela action autenticada.

**Tech Stack:** TypeScript, Vitest, job `runPipelineAdvanceJob`, OpenAI JSON schema já usado em `pipeline-advance-openai.ts`, ViaCEP via `lookupCep`.

## Global Constraints

- Volume gravado é sempre pães por semana, inteiro, em `leads.weekly_bread_consumption`.
- Caixa = 48 pães, antes de converter o período.
- Dia × 7. Semana × 1. Mês = `Math.round(quantidade * 7 / 30)`.
- Não sobrescrever campo que já tem valor.
- Sem CEP e sem cidade no chat e no lead: preencher só `state` pelo DDD do `phone_e164`. Não inventar cidade.
- Com CEP válido: gravar o CEP e completar logradouro, bairro, cidade e UF com `lookupCep`. Se a ViaCEP falhar, gravar só o CEP.
- Com cidade e sem CEP: gravar cidade e, se a UF veio explícita ou for inequívoca, gravar a UF. Não usar DDD para completar a UF nesse caso.
- Tipo de cliente só entra em `hamburgueria`, `distribuidor` ou `parceiros`. Hamburgueria, restaurante, lanchonete, food truck e dark kitchen viram `hamburgueria`. "Compro de um revendedor" não é distribuidor. Sem evidência, deixar vazio. Não gravar `outros`.
- CNPJ vai em `companies.document`. Já existe e a ficha de qualificação já edita esse campo. Validar com `isValidCpfCnpj` e gravar só CNPJ (14 caracteres). CPF não entra.
- DDD, conta de volume e validação de CNPJ não ficam a cargo do modelo.

---

### Task 1: Converter volume para pães por semana

**Files:**
- Create: `apps/crm/lib/weekly-bread-volume.ts`
- Test: `apps/crm/lib/weekly-bread-volume.test.ts`

**Interfaces:**
- Produces: `weeklyBreadCount(lines: VolumeLine[]): number | null`
- `VolumeLine = { amount: number; unit: "paes" | "caixas"; period: "dia" | "semana" | "mes" }`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { weeklyBreadCount } from "./weekly-bread-volume";

describe("weeklyBreadCount", () => {
  it("mantém pães por semana", () => {
    expect(weeklyBreadCount([{ amount: 600, unit: "paes", period: "semana" }])).toBe(600);
  });

  it("multiplica caixa por 48", () => {
    expect(weeklyBreadCount([{ amount: 6, unit: "caixas", period: "semana" }])).toBe(288);
  });

  it("converte dia e mês para semana", () => {
    expect(weeklyBreadCount([{ amount: 100, unit: "paes", period: "dia" }])).toBe(700);
    expect(weeklyBreadCount([{ amount: 2, unit: "caixas", period: "dia" }])).toBe(672);
    expect(weeklyBreadCount([{ amount: 1000, unit: "paes", period: "mes" }])).toBe(233);
  });

  it("soma linhas e arredonda faixa já resolvida pelo chamador", () => {
    expect(
      weeklyBreadCount([
        { amount: 75, unit: "paes", period: "semana" },
        { amount: 15, unit: "paes", period: "semana" },
      ]),
    ).toBe(90);
  });

  it("rejeita quantidade inválida", () => {
    expect(weeklyBreadCount([])).toBeNull();
    expect(weeklyBreadCount([{ amount: 0, unit: "paes", period: "semana" }])).toBeNull();
    expect(weeklyBreadCount([{ amount: -1, unit: "caixas", period: "semana" }])).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- weekly-bread-volume.test.ts` from `apps/crm`
Expected: FAIL, module not found

- [ ] **Step 3: Write minimal implementation**

```ts
export type VolumeLine = {
  amount: number;
  unit: "paes" | "caixas";
  period: "dia" | "semana" | "mes";
};

export function weeklyBreadCount(lines: VolumeLine[]): number | null {
  const weekly = lines
    .filter((line) => Number.isFinite(line.amount) && line.amount > 0)
    .map((line) => {
      const breads = line.unit === "caixas" ? line.amount * 48 : line.amount;
      if (line.period === "dia") return breads * 7;
      if (line.period === "mes") return breads * 7 / 30;
      return breads;
    });
  if (weekly.length === 0) return null;
  return Math.round(weekly.reduce((sum, value) => sum + value, 0));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- weekly-bread-volume.test.ts` from `apps/crm`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/crm/lib/weekly-bread-volume.ts apps/crm/lib/weekly-bread-volume.test.ts
git commit -m "feat: converte volume do chat para pães por semana"
```

---

### Task 2: UF pelo DDD do telefone

**Files:**
- Create: `apps/crm/lib/brazil-ddd.ts`
- Test: `apps/crm/lib/brazil-ddd.test.ts`

**Interfaces:**
- Produces: `ufFromPhone(phoneE164: string | null | undefined): string | null`
- Tabela fechada: 11–19 SP; 21, 22, 24 RJ; 27, 28 ES; 31, 32, 33, 34, 35, 37, 38 MG; 41–46 PR; 47–49 SC; 51, 53, 54, 55 RS; 61 DF; 62, 64 GO; 65, 66 MT; 67 MS; 68 AC; 69 RO; 92, 97 AM; 95 RR; 91, 93, 94 PA; 96 AP; 63 TO; 71, 73, 74, 75, 77 BA; 79 SE; 82 AL; 81, 87 PE; 83 PB; 84 RN; 85, 88 CE; 86, 89 PI; 98, 99 MA. Qualquer outro DDD retorna null.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { ufFromPhone } from "./brazil-ddd";

describe("ufFromPhone", () => {
  it("lê o DDD depois do +55", () => {
    expect(ufFromPhone("+5521999998888")).toBe("RJ");
    expect(ufFromPhone("+5511988887777")).toBe("SP");
    expect(ufFromPhone("+5548999990000")).toBe("SC");
    expect(ufFromPhone("+5561999990000")).toBe("DF");
  });

  it("aceita o número só com dígitos", () => {
    expect(ufFromPhone("5531988887777")).toBe("MG");
  });

  it("não inventa UF", () => {
    expect(ufFromPhone("+5510999998888")).toBeNull();
    expect(ufFromPhone(null)).toBeNull();
    expect(ufFromPhone("+14155552671")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- brazil-ddd.test.ts` from `apps/crm`
Expected: FAIL, module not found

- [ ] **Step 3: Write minimal implementation**

Mapa constante `DDD_UF: Record<string, string>` com cada DDD da lista (11 SP … 99 MA). `ufFromPhone` tira não-dígitos, exige prefixo `55` e pelo menos mais 10 dígitos, e devolve `DDD_UF[ddd] ?? null`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- brazil-ddd.test.ts` from `apps/crm`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/crm/lib/brazil-ddd.ts apps/crm/lib/brazil-ddd.test.ts
git commit -m "feat: infere UF pelo DDD do telefone"
```

---

### Task 3: Montar o patch da ficha sem sobrescrever

**Files:**
- Create: `apps/crm/lib/lead-facts-from-chat.ts`
- Test: `apps/crm/lib/lead-facts-from-chat.test.ts`

**Interfaces:**
- Consumes: `weeklyBreadCount`, `ufFromPhone`, `isValidCpfCnpj`, `normalizeCpfCnpj`, `parseLeadAddress`
- Produces:

```ts
export type ChatFacts = {
  volumes: VolumeLine[];
  cep: string | null;
  city: string | null;
  state: string | null;
  clientCategory: "hamburgueria" | "distribuidor" | "parceiros" | null;
  cnpj: string | null;
};

export type LeadFactSnapshot = {
  weeklyBreadConsumption: number | null;
  zipCode: string | null;
  street: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  clientCategory: string | null;
  cnpj: string | null;
};

export type LeadFactPatch = {
  weeklyBreadConsumption?: number;
  zipCode?: string;
  street?: string | null;
  neighborhood?: string | null;
  city?: string;
  state?: string;
  clientCategory?: "hamburgueria" | "distribuidor" | "parceiros";
  cnpj?: string;
};

export function leadFactPatch(input: {
  current: LeadFactSnapshot;
  facts: ChatFacts;
  phoneE164: string | null;
  cepAddress?: { street: string | null; neighborhood: string | null; city: string; state: string } | null;
}): LeadFactPatch;
```

`cepAddress` é o retorno já resolvido de `lookupCep`. Esta função não chama rede.

Regras do patch:

- Volume: se `current.weeklyBreadConsumption` é null e `weeklyBreadCount(facts.volumes)` não é null, incluir o número.
- CEP: se `current.zipCode` é null e `parseLeadAddress({ zipCode: facts.cep })` é ok, incluir `zipCode`. Se `cepAddress` veio, preencher street, neighborhood, city e state somente onde o atual é null.
- Cidade sem CEP: se não entrou CEP e `current.city` é null e `facts.city` tem texto, incluir city. Incluir `facts.state` só se for UF de 2 letras e `current.state` é null.
- DDD: se o patch não tem CEP nem city, e `current.zipCode`, `current.city` e `current.state` são null, incluir `state: ufFromPhone(phone)`.
- Categoria: se `current.clientCategory` é null e o fato é um dos três valores, incluir.
- CNPJ: se `current.cnpj` é null, normalizar e incluir só quando `isValidCpfCnpj` e o documento tem 14 caracteres.

- [ ] **Step 1: Write the failing test** cobrindo caixa→288, CEP com endereço da ViaCEP, cidade sem CEP, DDD quando não há cidade nem CEP, DDD ignorado quando há cidade, categoria de lanchonete já normalizada para `hamburgueria`, CNPJ válido, CNPJ inválido e campo já preenchido intocado.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lead-facts-from-chat.test.ts` from `apps/crm`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation** de `leadFactPatch` com as regras acima.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- lead-facts-from-chat.test.ts` from `apps/crm`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/crm/lib/lead-facts-from-chat.ts apps/crm/lib/lead-facts-from-chat.test.ts
git commit -m "feat: monta patch de qualificação sem sobrescrever a ficha"
```

---

### Task 4: Pedir os fatos no mesmo JSON da classificação

**Files:**
- Modify: `apps/crm/lib/pipeline-advance-openai.ts`
- Modify: `apps/crm/lib/pipeline-advance.ts` (`parseModelAdvanceBatchJson` e o tipo de saída)
- Test: `apps/crm/lib/pipeline-advance.test.ts`

**Interfaces:**
- Consumes: o schema atual `pipeline_advance_batch`
- Produces: cada item do batch também traz `facts`, parseado para `ChatFacts`

O modelo não faz a conta. O prompt pede:

- `volumes`: lista `{ amount, unit: paes|caixas, period: dia|semana|mes }`. Faixa vira a média. Várias linhas somam depois no código. "Quinta a domingo" não é período. Número solto na resposta do roteiro semanal entra como `paes` + `semana`. Sem quantidade, lista vazia.
- `cep`: 8 dígitos ou vazio. Não confundir com CNPJ.
- `city` e `state`: cidade dita pelo cliente. `state` só se a pessoa disse a UF ou a cidade torna a UF óbvia (Teresópolis → RJ). Cidade ambígua deixa `state` vazio.
- `client_category`: `hamburgueria` para hamburgueria, restaurante, lanchonete, food truck e dark kitchen; `distribuidor` só se a pessoa é o distribuidor; `parceiros` se for parceiro; senão vazio.
- `cnpj`: só o número dito como CNPJ, senão vazio.

Schema strict, campos obrigatórios, enums fechados. `parseModelAdvanceBatchJson` descarta categoria fora do enum, período/unidade inválidos e quantidade não positiva. O parser de etapa atual continua igual quando `facts` vier vazio.

- [ ] **Step 1: Write the failing test** com um JSON de batch que inclui facts e outro que omite categoria inválida.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- pipeline-advance.test.ts` from `apps/crm`
Expected: FAIL no caso novo

- [ ] **Step 3: Estender o schema, o prompt e o parser.**

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- pipeline-advance.test.ts` from `apps/crm`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/crm/lib/pipeline-advance-openai.ts apps/crm/lib/pipeline-advance.ts apps/crm/lib/pipeline-advance.test.ts
git commit -m "feat: pede volume, endereço, categoria e CNPJ na classificação"
```

---

### Task 5: Gravar o patch no job

**Files:**
- Modify: `apps/crm/lib/pipeline-advance-job.ts`
- Create: `apps/crm/lib/apply-lead-facts.ts`

**Interfaces:**
- Consumes: `leadFactPatch`, `lookupCep`, `ChatFacts`
- Produces: `applyLeadFacts(crm, input: { leadId: string; phoneE164: string | null; facts: ChatFacts }): Promise<{ applied: boolean }>`

`applyLeadFacts`:

1. Lê o lead (`weekly_bread_consumption`, `zip_code`, `street`, `neighborhood`, `city`, `state`, `client_category`, `company_id`, `phone_e164`) e, se houver company, `document`, `city`, `state`.
2. Se `facts.cep` tiver 8 dígitos e o lead não tiver CEP, chama `lookupCep`. Falha da ViaCEP não aborta o resto.
3. Monta o patch. Se estiver vazio, retorna `applied: false`.
4. Atualiza no lead só as chaves presentes no patch.
5. CNPJ, cidade ou UF novos: se já existe company, atualiza `document` / `city` / `state` só onde a company está vazia. Se não existe company e há CNPJ, cria company com nome `Empresa ${phone}` e o documento, no mesmo padrão de `updateConversationLeadQualification`.

No `runPipelineAdvanceJob`:

- Conversas que hoje pulam a IA pela regra automática também entram no lote quando o lead tem algum destes campos vazio: volume, CEP, cidade, UF, categoria, CNPJ. A sugestão de etapa dessas conversas continua sendo a regra, não o modelo. Os `facts` são aplicados.
- Depois de parsear a saída, chamar `applyLeadFacts` para cada conversa do lote. Erro ao gravar um lead conta em `errors` e não impede os outros.
- Incluir `qualified` no `PipelineAdvanceJobResult` e no log.

- [ ] **Step 1: Write the failing test** de `applyLeadFacts` com client fake: lead vazio recebe volume, CEP resolvido e CNPJ; lead com volume preenchido não muda o volume; ViaCEP com erro grava o CEP e segue.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- apply-lead-facts.test.ts` from `apps/crm`
Expected: FAIL

- [ ] **Step 3: Implementar `applyLeadFacts` e ligar no job.**

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- apply-lead-facts.test.ts pipeline-advance.test.ts` from `apps/crm`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/crm/lib/apply-lead-facts.ts apps/crm/lib/apply-lead-facts.test.ts apps/crm/lib/pipeline-advance-job.ts
git commit -m "feat: preenche a ficha no job de classificação da conversa"
```
