# Novo deploy (GitHub main)

A Vercel publica ao receber push em `main`. Não use CLI, MCP nem plugin da Vercel. Não aplique migration nem SQL em produção. Não instale ferramenta neste comando.

A execução autoriza push normal para `origin/main` somente se todas as travas abaixo passarem.

## 1. Git, antes do build

1. Pare se a branch atual não for `main`. Não faça merge, rebase nem troca de branch.
2. Confirme que `gitleaks` está no PATH. Se não estiver, pare. A inspeção visual do diff não substitui o scanner.
3. `git fetch origin main`. Pare se a `main` local estiver atrás, o histórico divergir ou o fetch falhar. Commits locais à frente seguem.
4. Monte o conjunto que será publicado: toda alteração não ignorada (modificada, staged ou nova) e os commits à frente de `origin/main`. Use `git status --porcelain` e `git diff --stat` / `--name-only`. Não leia o projeto inteiro.
5. Bloqueie se algum path for `.env`, `.env.*`, credencial, `*.pem`, `.vercel`, `tmp/` ou dump. Não mostre o conteúdo.
6. `git diff --check` no local e nos commits a enviar. Pare só em marcador de conflito.
7. Arquivo que não deve ir na publicação: pare antes do build. Não deixe esse arquivo de fora depois.

## 2. Diff completo só quando o risco pede

Leia o diff inteiro apenas de arquivos em auth, actions, api, supabase, migrations, pedidos, preços, clientes, pagamentos ou webhooks. No restante, o stat basta.

Bloqueie só risco crítico: autorização apenas na interface, vazamento entre clientes, segredo no git, SQL destrutivo incompatível com os dados atuais. Achado não crítico entra no resumo. UI e texto não passam por auditoria.

## 3. Validação

O conjunto validado é toda alteração não ignorada presente agora, mais qualquer arquivo que uma correção tocar depois. Classifique todos os paths desse conjunto, inclusive exclusões.

Não compilam: `docs/`, `.cursor/`, `*.md`, `apps/valepan/scripts/`, `**/__tests__/`, `*.test.ts`, `*.test.tsx`, `*.spec.ts`, `*.spec.tsx` e `*.sql`.

O restante decide qual build rodar. Na dúvida, use o build da raiz.

- Só arquivos que não compilam: não rode build.
- Só `apps/mobile`, fora dessa lista: `npx turbo run build --filter=@valepan/mobile`.
- Só `apps/valepan` ou `packages/shared`, fora dessa lista: `npx turbo run build --filter=valepan-pedidos`.
- Mobile e web juntos, ou qualquer outro path (`package.json`, `package-lock.json`, `turbo.json`, config na raiz): `npm run build` na raiz.

1. Encerre `npm run dev` somente se for rodar algum build.
2. Rode o build da classificação acima. Quando houver build, ele é obrigatório passar.
3. Se mudou `.ts` ou `.tsx` em `apps/valepan` ou `packages/shared`, inclusive teste e script, ou `tsconfig`/`package.json` desses pacotes: `npm run type:check --prefix apps/valepan`. O build desse app usa compile mode e não checa tipos.
4. Se mudou arquivo da seção 2, ou código com teste ao lado: em `apps/valepan`, `npx vitest related --run --passWithNoTests` nesses arquivos. Não rode a suíte inteira nem o lint do monorepo.
5. Corrija erro do que mudou. Se a correção não avançar ou exigir mudança grande, pare. Arquivo alterado pela correção entra no conjunto e a classificação é refeita. Repita só a verificação que essa correção afeta, inclusive o build se o conjunto passou a exigi-lo. Não use `|| true`, `--no-verify` nem desligue regra para passar.

## 4. Publicação do mesmo conjunto validado

1. Preserve os commits locais já existentes. Não os reescreva, junte nem divida. Se não houver alteração nova, siga com eles.
2. Separe só o que ainda não está commitado, por assunto. Assunto é um comportamento independente, não uma pasta e não um agente. Um módulo novo, com todas as telas, ações e testes dele, é um assunto e vira um commit. O mesmo módulo só se divide quando há comportamentos independentes entre si. Um assunto só, ou separação impossível, vira um commit.
3. Nenhum arquivo se reparte entre commits. O teste ao lado acompanha o código do mesmo assunto. Arquivo necessário a dois assuntos une esses assuntos. Migration e o código que depende dela ficam juntos.
4. Não use `git add -A`. Em cada commit, entre só os arquivos daquele assunto. Mensagem objetiva, no estilo do repositório.
5. Antes do push, `git status --porcelain` tem de estar vazio. Se sobrar arquivo modificado ou novo, pare: o que foi testado não é o que iria para a `main`.
6. Rode `gitleaks detect --no-banner --redact --log-opts="origin/main..HEAD"`. Pare se o exit code for diferente de zero. Não crie allowlist para contornar o achado. No resumo, cite arquivo e regra, nunca o valor.
7. `git push origin HEAD` uma vez, com todos os commits. Sem force. Se falhar, pare. Não faça reset nem amend para desfazer.
8. Push aceito não comprova o deploy na Vercel.

## Resposta (curta)

Informe build, typecheck e testes (aprovado, falhou ou não aplicável), Gitleaks, riscos, a lista de commits e o push. Não declare verificação que não rodou.