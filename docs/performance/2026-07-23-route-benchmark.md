# Benchmark de rotas — 23/07/2026

## Ambiente

- Build de produção do Next.js 16.2.4
- Servidor local em `localhost`
- Banco Supabase conectado
- Usuário administrativo autenticado
- Uma navegação de aquecimento + duas rodadas de cinco amostras por rota
- Tempos medidos do início da requisição até o recebimento completo do HTML

## Resultado estabilizado

| Rota | TTFB mediano | Total mediano | Mínimo | Máximo | HTML |
|---|---:|---:|---:|---:|---:|
| `/dashboard` | 181,1 ms | 184,0 ms | 176,0 ms | 256,2 ms | 58,8 KB |
| `/inbox` | 379,1 ms | 383,0 ms | 370,8 ms | 416,6 ms | 153,6 KB |
| `/leads` | 198,3 ms | 204,7 ms | 191,6 ms | 251,3 ms | 145,7 KB |
| `/pipeline` | 243,2 ms | 247,0 ms | 229,4 ms | 276,2 ms | 93,4 KB |
| `/tasks` | 163,6 ms | 167,5 ms | 163,6 ms | 175,3 ms | 41,8 KB |
| `/samples` | 163,6 ms | 168,9 ms | 164,8 ms | 175,3 ms | 24,4 KB |
| `/distributors` | 163,6 ms | 168,8 ms | 156,3 ms | 170,3 ms | 24,5 KB |

## Comparações antes/depois disponíveis

Não havia benchmark HTTP salvo antes das alterações, portanto não é possível
produzir tempos anteriores por rota sem inventar um baseline. As medições
antes/depois registradas durante o trabalho foram:

| Operação | Antes | Depois | Diferença observada |
|---|---:|---:|---:|
| Consulta de mensagens dos últimos 7 dias | 297,8 ms | 152,6 ms | -48,8% |
| Leituras físicas da mesma consulta | 337 páginas | 0 páginas (cache aquecido) | -100% na amostra final |
| Compilação de produção | 19,5 s | 5,5 s | -71,8% |

## Interpretação

- O Inbox ainda é a rota mais cara e entrega o maior HTML.
- Leads possui TTFB baixo, mas o HTML é quase tão grande quanto o Inbox.
- Pipeline está em uma faixa intermediária.
- Tasks, Samples e Distributors estão próximas do piso de latência observado
  para autenticação e acesso ao Supabase neste ambiente.

## Repetição

Com o build de produção iniciado localmente:

```text
node scripts/benchmark-routes.cjs http://localhost:3102 5
```

O script lê as credenciais locais, autentica em memória e não imprime senhas
ou tokens.
