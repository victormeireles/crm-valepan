# Checklist — Bootstrap do repositório CRM (copiar/adaptar)

Use este arquivo como roteiro ao criar o **repositório novo** (opção A). Marque os itens conforme for concluindo.

---

## Repositório e tooling

- [ ] Criar repositório Git vazio; definir nome do app (ex.: `apps/crm`).
- [ ] Copiar estrutura base do monorepo atual: `package.json` (workspaces), `turbo.json`, `.gitignore` adequado ao Next.js.
- [ ] Definir **nome do pacote shared** (ex.: `@crm/shared`) e atualizar `packages/shared/package.json`.
- [ ] Copiar `packages/shared` a partir de `valepan-pedidos`, removendo o que não for necessário e ajustando exports.
- [ ] Inicializar `apps/crm` com Next.js alinhado às versões do projeto de referência (Next 15.x, React 19, Tailwind 4, TypeScript 5).
- [ ] Configurar ESLint / `tsconfig` paths (`@/` → app, workspace → shared).

## Supabase e schema `crm`

- [ ] Rodar `supabase init` dentro de `apps/crm` (ou pasta acordada) se ainda não existir.
- [ ] No `config.toml`, adicionar o schema **`crm`** à lista `api.schemas` (exposição PostgREST).
- [ ] Criar migration inicial: `CREATE SCHEMA IF NOT EXISTS crm;` e convenções de nomenclatura.
- [ ] Criar tabelas do MVP **somente** em `crm.*`; habilitar RLS e policies na mesma migration.
- [ ] Configurar seed mínimo (opcional) para desenvolvimento.
- [ ] Documentar variáveis: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, secrets de serviço, URLs do app.

## Auth e aplicação

- [ ] Integrar NextAuth v5 + adapter Supabase conforme padrão do app de referência; mapear usuários para tabela/perfil no schema `crm` se necessário.
- [ ] Implementar clientes Supabase server/browser com cookies (SSR) como no app atual.
- [ ] Garantir que queries usem explicitamente o schema `crm` onde aplicável.

## Domínio CRM (MVP do PRD)

- [ ] Modelo mínimo: empresas, contatos, leads, conversas/mensagens (se inbox no MVP), etapas de funil, tarefas, timeline.
- [ ] Regra: número novo no WhatsApp → lead automático (implementação após webhook estável).
- [ ] Dashboard básico apenas após núcleo operacional estável.

## Qualidade

- [ ] `npm run lint` / `npm run build` no monorepo.
- [ ] Testes críticos (Vitest) para regras puras e, se possível, um fluxo de criação de lead.

---

## Notas

- **Isolamento:** o CRM não deve criar tabelas em `public` salvo views de leitura explicitamente acordadas.
- **LGPD:** perfis, exportação e auditoria seguem o PRD; campos pessoais minimizados.
