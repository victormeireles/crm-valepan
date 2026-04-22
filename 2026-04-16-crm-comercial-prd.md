# PRD — CRM Comercial Valepan integrado ao WhatsApp

**Versão:** 1.1 (revisão estrutural)  
**Data:** 2026-04-16  
**Stack alinhada:** Next.js, TypeScript, Tailwind, shadcn-like via pacote shared, Supabase (Postgres, Auth, Storage, Realtime).  
**Implantação técnica:** repositório **novo e separado**; dados do CRM no schema PostgreSQL `**crm`** no mesmo projeto Supabase da Valepan (isolamento lógico do `public`). Detalhes em `2026-04-16-crm-repositorio-schema-e-reuso-design.md`.

---

## 1. Resumo executivo

Sistema CRM **interno e específico da operação Valepan**, com **WhatsApp como principal canal de entrada**. Objetivo: uma base única para leads, carteira, funil, distribuidores, amostras, clientes e histórico — substituindo planilhas e memória informal, com rastreabilidade e regras comerciais explícitas.

**Princípio de produto:** a IA **sugere**; decisões críticas exigem **confirmação humana**.

---

## 2. Problema e contexto

A operação comercial está fragmentada (WhatsApp, múltiplas planilhas, playbook disperso). Isso gera perda de contexto, duplicidade, follow-up irregular, visão fraca de pipeline e controle frágil de amostras e cobertura regional.

---

## 3. Objetivos

### 3.1. Produto

- Centralizar leads, clientes, distribuidores e conversas.
- Criar **lead inicial automático** a partir de número novo no WhatsApp.
- Permitir **enriquecimento progressivo** do cadastro sem bloquear o primeiro atendimento.
- Registrar **timeline única** (mensagens, notas, etapas, amostras, tarefas, conversão).
- Suportar modelos comerciais: via distribuidor, Valepan + distribuidor na entrega, Valepan direto.
- Dar visibilidade operacional e gerencial com dashboards **evolutivos** (simples no MVP).

### 3.2. Negócio

Reduzir perda de leads, aumentar velocidade de resposta e conversão, melhorar cobertura regional e profissionalizar a carteira, gerando inteligência sobre regiões, distribuidores e contas.

---

## 4. Escopo

### 4.1. Dentro do escopo (visão completa do produto)


| Área                | Conteúdo                                           |
| ------------------- | -------------------------------------------------- |
| Identidade e acesso | Autenticação, perfis, permissões                   |
| CRM                 | Leads, empresas, contatos, oportunidades, clientes |
| Canal               | Inbox WhatsApp, histórico de mensagens             |
| Operação comercial  | Funil, tarefas, follow-ups, notas                  |
| Parceiros           | Distribuidores e cobertura regional                |
| Amostras            | Pedidos, status, feedback                          |
| Preços              | Tabelas e vigência (fase posterior ao núcleo)      |
| Inteligência        | Regras/playbook, dashboards, IA assistiva          |


### 4.2. Fora do escopo inicial

ERP completo, faturamento fiscal, financeiro profundo, logística avançada, estoque, BI multiempresa, pricing dinâmico totalmente automatizado, call center telefonia integrada.

---

## 5. Usuários e permissões (macro)


| Perfil               | Capacidades principais                                                |
| -------------------- | --------------------------------------------------------------------- |
| **Admin**            | Configuração, usuários, tabelas mestre, visão global                  |
| **Comercial**        | Inbox, leads, funil, notas, tarefas, amostras, vínculo a distribuidor |
| **Gestão**           | Carteira, funil, gargalos, performance, revisão de decisões sensíveis |
| **Operação / apoio** | Amostras, status de envio/entrega, dados operacionais                 |


*(Detalhamento fino de permissões por tela fica para o plano de implementação.)*

---

## 6. Personas (resumo)

1. **Comercial de prospecção** — velocidade, contexto, próximo passo claro.
2. **Gestor comercial** — carteira, conversão, responsáveis, inatividade.
3. **Apoio operacional** — o quê enviar, para quem, prazos e status.
4. **Gestão estratégica** — cobertura regional, eficiência, expansão.

---

## 7. Modelo conceitual (entidades)


| Entidade            | Papel                                           |
| ------------------- | ----------------------------------------------- |
| **Lead**            | Prospecção/qualificação; origem típica WhatsApp |
| **Empresa / conta** | Estabelecimento ou organização                  |
| **Contato**         | Pessoa vinculada à empresa                      |
| **Oportunidade**    | Negociação em andamento (funil)                 |
| **Conversa**        | Canal (ex.: WhatsApp) com um número             |
| **Mensagem**        | Evento na conversa                              |
| **Distribuidor**    | Parceiro com áreas de atuação                   |
| **Amostra**         | Envio/rastreio de material                      |
| **Cliente**         | Conta convertida (com histórico preservado)     |
| **Tarefa**          | Ação pendente com prazo                         |
| **Nota**            | Registro manual                                 |
| **Regra comercial** | Diretriz/checklists do playbook                 |
| **Produto / preço** | Cadastros para revenda (fases posteriores)      |


**Regra de modelagem:** telefone é **chave de entrada**, não identidade final — empresa e contato podem evoluir e desduplicar.

---

## 8. Módulos e requisitos funcionais

### 8.1. Inbox / WhatsApp

- Listar conversas; mensagens por contato; detectar número desconhecido.
- **Lead automático** para número novo (mínimo: telefone, origem, data, vínculo conversa).
- Associar conversa a empresa/lead existente; painel lateral com resumo (responsável, etapa, região, próxima ação).
- Ações rápidas: nota, tarefa, mudança de etapa, encaminhamento a distribuidor (quando aplicável).
- Busca por telefone, nome, empresa, cidade.

**Regras:** nenhuma conversa “órfã” sem vínculo a lead/cliente/conta conforme regra de dados; timeline alimentada por mensagens enviadas/recebidas.

### 8.2. Leads / carteira

Listagem rica (estabelecimento, tipo, geo, status, funil, contato, telefone, volume, marcas, distribuidor, responsável, última interação, próxima ação).  
Funcionalidades: CRUD, filtros, merge de duplicados, export controlado, abrir conversa vinculada.

### 8.3. Funil comercial

Etapas sugeridas (ajustáveis em configuração): desde “lead novo” até “convertido” ou “perdido”, incluindo qualificação, análise regional, negociação, amostra, feedback, proposta, encaminhamento a distribuidor.

**Regras de transição (exemplos):**  

- “Encaminhado ao distribuidor” → distribuidor definido.  
- “Cliente convertido” → modelo comercial definido.  
- “Perdido” → motivo obrigatório.  
- Fluxos de amostra alinhados ao módulo de amostras.

### 8.4. Distribuidores

Cadastro completo (contatos, regiões, condições comerciais, status). Sugestão por região; visão de carteira por distribuidor; sinalização de **lacunas de cobertura**.

### 8.5. Amostras

Registro com empresa, contato, endereço, janela de recebimento, itens, responsáveis, datas, status e feedback.  
Regras: follow-up automático ao enviar; etapas do funil coerentes com feedback.

### 8.6. Clientes

Base separada de prospects; conversão preservando histórico; status (ativo, inativo, risco, etc.); modelo e condição comercial.

### 8.7. Regras comerciais / playbook

Tipos de venda, faixas de volume, quando usar distribuidor vs. direto, regras de amostra e primeira compra, checklists por etapa — **configuráveis ao longo do tempo**, não só texto estático.

### 8.8. Preços / revenda (fase 2+)

Produtos, gramaturas, tabelas por distribuidor, vigência e histórico.

### 8.9. Dashboards

Indicadores iniciais: novos leads, parados, por etapa, amostras pendentes, follow-ups vencidos, conversão por responsável/região, lacunas de cobertura, motivos de perda (quando existirem).

---

## 9. Requisitos transversais

- **Timeline única** por conta/oportunidade: mensagens, notas, mudanças de etapa, amostras, tarefas, vínculos.
- **Tarefas e follow-up** centralizados; criação manual e gatilhos (ex.: pós-amostra).
- **Duplicidade:** identificação e mesclagem; telefone normalizado.
- **Auditoria:** eventos relevantes com usuário e timestamp.
- **NFR:** UI responsiva; busca rápida; permissões por perfil; integração segura com WhatsApp; **LGPD** na coleta e retenção.

---

## 10. IA (fase 2 em diante)

- Extração sugerida de campos a partir do texto (confirmação antes de gravar).
- Resumo da conta e rascunhos de mensagem.
- Sugestão de próximo passo comercial com base em volume/região/estágio.

---

## 11. Integrações

- **WhatsApp** (API ou provedor alinhado ao uso atual da empresa): receber/enviar, idempotência, armazenamento de payload quando necessário para suporte.
- **Geocoding** opcional para padronização de endereço.
- **ERP:** preparar modelo para futura integração sem acoplar o MVP.

---

## 12. UX (diretrizes)

Conversa como ponto de partida para o comercial; cadastro progressivo; destaque para responsável, etapa, próxima ação e urgência; histórico legível.

---

## 13. Dados (referência de modelagem)

O PRD original listou tabelas (`users`, `companies`, `contacts`, `leads`, `opportunities`, `pipeline_stages`, `conversations`, `messages`, `distributors`, `distributor_regions`, `sample_shipments`, `sample_items`, `clients`, `tasks`, `notes`, `activity_logs`, `products`, `price_tables`).  
**Implementação:** todas as tabelas do CRM no schema `**crm`**, com RLS e convenções definidas nas migrations do repositório novo — ajustes de nomenclatura e normalização na fase de modelagem técnica.

---

## 14. Fases e priorização

### Fase 1 — MVP

Autenticação e usuários; empresas, contatos, leads; inbox WhatsApp com criação automática de lead; timeline; funil; tarefas; distribuidores (base); amostras simples; dashboard básico.

### Fase 2

IA assistiva; clientes e conversão formal; tabelas de preço; regras configuráveis; dashboards mais completos; mesclagem avançada; motivos de perda estruturados.

### Fase 3

Automações, templates, regional avançado, analytics mais profundo, integrações adicionais.

---

## 15. Critérios de sucesso

Cadastro rastreável para novas conversas; redução de leads esquecidos; amostras rastreáveis; visibilidade de pipeline e cobertura; menos dependência de planilhas paralelas; melhora mensurável em tempo de resposta e disciplina de follow-up.

---

## 16. Riscos (produto)

Modelar CRM e inbox em conjunto; duplicidade desde cedo; separar empresa/contato/lead/cliente; não apagar histórico; não sobrecarregar o comercial; não automatizar antes de processo estável; distribuidor como entidade, não só texto solto; regras de transição de etapa explícitas.

---

## 17. Decisões recomendadas (reforço)

1. Telefone como chave inicial, identidade de negócio em empresa/contato.
2. Pipeline e “próxima ação” como eixos de UX.
3. Amostras e cobertura regional como módulos de primeira classe.
4. IA como copiloto, não decisor único.

---

## 18. Prompt mestre (para o Cursor no repo CRM)

```md
Construir o CRM comercial interno da Valepan integrado ao WhatsApp, conforme PRD em anexo. Repositório novo; stack Next.js + TypeScript + Tailwind + pacote shared; Supabase com tabelas no schema PostgreSQL `crm`. Toda conversa de número desconhecido gera lead inicial automático. Implementar núcleo operacional (entidades, RLS, inbox, funil, tarefas, timeline, distribuidores e amostras MVP) antes de IA e dashboards avançados. Respeitar regras de transição de etapa e LGPD.
```

---

## 19. Glossário

- **Lead:** oportunidade em qualificação vinda tipicamente de WhatsApp.  
- **Oportunidade:** negociação com estágio em funil.  
- **Cliente:** conta pós-conversão com modelo comercial definido.  
- **Schema `crm`:** namespace Postgres para todas as tabelas do produto CRM no mesmo projeto Supabase.

