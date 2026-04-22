-- Executar no SQL Editor do Supabase se houver mensagens antigas com body vazio.
-- Opcional: ajuste o texto entre aspas simples.

update crm.messages
set body = '[Sem prévia — registro anterior ao extrator de mídia]'
where body is null
   or trim(body) = ''
   or trim(body) = '—';
