---
description: Roda o build, corrige erros e sobe para GitHub na branch main. NÃO usa a CLI da Vercel.
---

# Deploy (GitHub main)

A Vercel publica sozinha ao receber push em `main`. **Não** use a CLI da Vercel neste comando.

O plugin da Vercel também registra `/deploy`. **Ignore-o.** Não rode `vercel`, `vercel link`, `vercel deploy`, `vercel --prod`, `vercel pull`, nem crie/altere `.vercel/`.

## O que fazer

1. **Build** — Na raiz do monorepo: `npm run build`. Se falhar, corrija os erros até passar.
2. **Git** — `git status`. Se houver alterações do deploy: `git add` e `git commit` (nunca `.env`, credenciais, `.vercel`, `.next`).
3. **Push** — Confirme a branch `main` (`git branch --show-current`) e rode `git push origin main`.

## Não fazer

- Não rode `vercel`, `vercel deploy`, `vercel link`, `vercel login`, `vercel pull`.
- Não faça preflight de drains, observabilidade ou preview/production pela CLI.
- Não peça confirmação de “production” na Vercel — o alvo é só o remoto Git.

## Resumo ao usuário

- Build: OK / falhou (e o que foi corrigido).
- Commit: hash + mensagem, ou nada para commitar.
- Push: enviado para `origin/main`.
