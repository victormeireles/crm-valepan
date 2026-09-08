# Cadastro do evento iFood

Página pública: `/cadastro/ifood`. Recebimento: `POST /api/cadastro/ifood`.
Não exige login. Campos: nome, telefone com DDD, tipo de cliente (hamburgueria ou distribuidor), CEP do negócio e CPF/CNPJ opcional.

## Comportamento

- Novo telefone: cria contato, lead aberto com origem `ifood_event`, CEP e categoria; entra na etapa LEADS, sem responsável inicial.
- Telefone já cadastrado: preserva nome confirmado, origem, responsável, categoria, CEP e etapa existentes. Os dados enviados no evento ficam no histórico de participação.
- Reenvio do mesmo telefone na mesma campanha: resposta de sucesso idêntica, sem duplicar lead, oportunidade ou histórico. A primeira participação é preservada.
- Cada participação fica em `crm.lead_registrations` e na timeline, com o aviso de contato identificado pela versão `2026-09-07`.
- CPF/CNPJ recebe máscara e validação dos dígitos verificadores no formulário, servidor e banco. Aceita CPF e CNPJ numérico ou alfanumérico, sem consultar situação cadastral. O documento fica exclusivamente na participação protegida por RLS e aparece na ficha do lead, sem cópia no histórico geral ou na resposta pública. Reenvios podem completar um documento ausente, mas não sobrescrevem o primeiro documento nem alteram dados comerciais já confirmados.
- A lista de leads permite filtrar Campanha → Evento iFood, incluindo contatos preexistentes. O filtro respeita a visibilidade e o arquivamento atuais do CRM.
- Leads participantes do evento aparecem no funil mesmo sem mensagens de WhatsApp. Leads arquivados permanecem arquivados.
- O formulário não envia mensagem automática nem exige endereço completo.

## Ativação

Aplicar, nesta ordem, somente estas migrations, antes de publicar o aplicativo:

1. `20260907120000_public_lead_registration.sql`
2. `20260907121000_pipeline_public_registrations.sql`
3. `20260908120000_public_lead_cpf_cnpj.sql`

A primeira cria tabelas e uma função transacional acessível apenas pelo serviço no servidor. A segunda preserva os filtros existentes do funil e permite participantes sem conversa. A terceira adiciona CPF/CNPJ opcional com validação e mantém compatibilidade com a chamada anterior. As três foram exercitadas em PostgreSQL local (PGlite), sem dados remotos.

O servidor usa as variáveis já existentes `NEXT_PUBLIC_SUPABASE_URL`/`SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`/`SERVICE_ROLE`. Nenhuma chave de serviço é enviada ao navegador. O limite é de 120 envios por minuto por IP fornecido pela Vercel (HMAC, retenção de até uma hora com limpeza a cada envio). Em outros hosts, usa um limite compartilhado; adaptar o cabeçalho confiável se o host mudar.

Depois de publicar, o QR code deve apontar para o domínio público do CRM seguido de `/cadastro/ifood`. Endereços `localhost` e `127.0.0.1` são apenas prévias no computador e não servem para o QR code do evento.

## Verificação

`npm test` executa as validações, o endpoint e a integração SQL local, além da suíte existente. Também validar compilação (`npm run build`) e navegação na página, inclusive em celular. Os testes de concorrência em PGlite verificam reenvios enfileirados; em produção, unicidades e trava transacional por telefone protegem chamadas simultâneas.

Não há uma rota genérica publicada. O componente `RegistrationForm` concentra os campos e estados reutilizáveis; o visual e a campanha ficam separados para a futura versão sem iFood.

## Imagem

A foto real da fábrica enviada pelo usuário, `Moon Fotografia-102.jpg`, substitui a imagem gerada da primeira versão. Foi apenas redimensionada para 1200 × 1800 e convertida para WebP de 286.734 bytes, sem reconstrução dos produtos. Arquivo consumido: `apps/crm/public/images/cadastro/paes-valepan-moon-102.webp`. O enquadramento é feito no layout, com destaque para os três pães. A marca Valepan usa o SVG já existente, em versão clara via CSS; o nome do evento permanece separado da imagem.

Referência da validação alfanumérica: [manual de dígitos verificadores da Receita Federal](https://www.gov.br/receitafederal/pt-br/centrais-de-conteudo/publicacoes/documentos-tecnicos/cnpj/manual-dv-cnpj.pdf).
