# Backfill `crm.distributors` → `cliente_distribuidor_id` / empresa

Data: 2026-11-12

## Resultado automático

- `leads.distributor_id` restantes: **0**
- `leads.cliente_distribuidor_id` preenchidos: **17** (hamburgueria / sem categoria com match)

## Mapa usado (CRM name → `public.clientes`)

| CRM | Cliente |
|---|---|
| TOP ALTO | Top Alto |
| WESLEY | Wesley |
| LOUCOS / LOUCOS POR HAMBURGUER | Loucos por Hamburguer |
| NEW SPACE | NEW SPACE |
| DELOVA | Irmãos Delova |
| CACHINHOS / CACHINHOS DOURADOS | Cachinhos Dourados |
| FORTE ALIMENTOS | Forte Alimentos |
| MEGAVALE | MegaVale |
| KOUTO | KOUTO SOKEAMA (havia ambiguidade com Kouto Alimentos) |
| PREMIUM DISTRIBUIDORA | Premium Alimentos Distribuidora |

## Identidade (`client_category = distribuidor`)

Leads da categoria tiveram `distributor_id` limpo. Nome de empresa garantido quando faltava (contato / nome da carteira / telefone). Placeholders `PENDENTE CARTEIRA · …` viraram nome de empresa.

## Revisão manual sugerida

1. **KOUTO** (lead Alex Ribeiro / Guilherme Megavale): confirmado como KOUTO SOKEAMA — alterar para Kouto Alimentos se estiver errado.
2. **PREMIUM**: mapeado para Premium Alimentos Distribuidora no fluxo de atendimento se ainda fizer sentido; lead da categoria distribuidor ficou só com empresa.
3. **TESTE** (Elizabeth Castilho): limpo para empresa via contato; pode apagar/ajustar o lead.
4. Leads categoria distribuidor com empresa “pessoal” (ex.: Williane + vínculo antigo CACHINHOS): revisar se o **nome da empresa** deveria ser a rede.
