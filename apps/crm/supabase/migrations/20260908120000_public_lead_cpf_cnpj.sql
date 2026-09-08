begin;

-- Validação local dos dígitos verificadores; não consulta situação cadastral.
-- CNPJ alfanumérico: https://www.gov.br/receitafederal/pt-br/centrais-de-conteudo/publicacoes/documentos-tecnicos/cnpj/manual-dv-cnpj.pdf
create or replace function crm.is_valid_cpf_cnpj(p_document text)
returns boolean language plpgsql immutable strict set search_path = pg_catalog
as $$
declare
  v_cnpj boolean;
  v_base text;
  v_sum integer;
  v_remainder integer;
  v_weight integer;
  v_digit text;
  i integer;
  step integer;
begin
  if p_document ~ '^(.)\1+$' then return false; end if;
  v_cnpj := p_document ~ '^[A-Z0-9]{12}[0-9]{2}$';
  if not v_cnpj and p_document !~ '^[0-9]{11}$' then return false; end if;
  v_base := left(p_document, length(p_document) - 2);
  for step in 1..2 loop
    v_sum := 0;
    for i in 1..length(v_base) loop
      v_weight := case when v_cnpj then ((length(v_base) - i) % 8) + 2 else length(v_base) + 2 - i end;
      v_sum := v_sum + (ascii(substr(v_base, i, 1)) - 48) * v_weight;
    end loop;
    v_remainder := v_sum % 11;
    v_digit := case when v_remainder < 2 then '0' else (11 - v_remainder)::text end;
    v_base := v_base || v_digit;
  end loop;
  return p_document = v_base;
end;
$$;

alter table crm.lead_registrations add column cpf_cnpj text
  check (cpf_cnpj is null or crm.is_valid_cpf_cnpj(cpf_cnpj));

-- Mantém a assinatura anterior para clientes/versões já em uso. A nova chamada
-- continua atômica: a função anterior e o documento pertencem à mesma transação.
create or replace function crm.register_public_lead(
  p_source text, p_name text, p_phone text, p_client_category text,
  p_zip_code text, p_request_key text, p_notice_version text, p_document text
)
returns jsonb language plpgsql security invoker set search_path = crm, pg_temp
as $$
declare
  v_document text := nullif(regexp_replace(upper(trim(coalesce(p_document, ''))), '[./[:space:]-]', '', 'g'), '');
  v_result jsonb;
begin
  if v_document is not null and not crm.is_valid_cpf_cnpj(v_document) then
    raise exception 'invalid_cpf_cnpj' using errcode = '22023';
  end if;
  v_result := crm.register_public_lead(p_source, p_name, p_phone, p_client_category, p_zip_code, p_request_key, p_notice_version);
  if v_document is not null then
    update crm.lead_registrations set cpf_cnpj = v_document
      where source = p_source and phone_e164 = p_phone and cpf_cnpj is null;
  end if;
  -- O documento permanece na tabela protegida por RLS, sem cópia no log geral
  -- de atividades e sem exposição na resposta pública.
  return v_result;
end;
$$;

revoke all on function crm.register_public_lead(text, text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function crm.register_public_lead(text, text, text, text, text, text, text, text) to service_role;
comment on column crm.lead_registrations.cpf_cnpj is
  'CPF/CNPJ informado no formulário; preserva o primeiro valor e não altera o documento comercial já confirmado.';

commit;
