-- Cobertura CEP de distribuidores (public) + RPC para o CRM listar por CEP.
-- Prioridade menor = aparece primeiro (clientes.cep_prioridade).

begin;

alter table public.clientes
  add column if not exists cep_prioridade integer;

comment on column public.clientes.cep_prioridade is
  'Prioridade de cobertura CEP do distribuidor (menor = mais prioritário).';

create table if not exists public.distribuidor_cep_faixas (
  id uuid primary key default gen_random_uuid(),
  distribuidor_id uuid not null references public.clientes(id) on delete cascade,
  cep_de text not null,
  cep_ate text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint distribuidor_cep_faixas_cep_de_chk check (cep_de ~ '^[0-9]{8}$'),
  constraint distribuidor_cep_faixas_cep_ate_chk check (cep_ate ~ '^[0-9]{8}$'),
  constraint distribuidor_cep_faixas_ordem_chk check (cep_de <= cep_ate)
);

create index if not exists idx_distribuidor_cep_faixas_distribuidor
  on public.distribuidor_cep_faixas (distribuidor_id);

create index if not exists idx_distribuidor_cep_faixas_range
  on public.distribuidor_cep_faixas (cep_de, cep_ate);

comment on table public.distribuidor_cep_faixas is
  'Faixas de CEP atendidas por cada distribuidor (public.clientes).';

-- Leitura via RPC security definer (mesmo padrão de list_distribuidores_ativos).
create or replace function crm.list_distribuidores_por_cep(p_cep text)
returns table (
  id uuid,
  name text,
  cep_prioridade integer,
  cep_de text,
  cep_ate text
)
language sql
stable
security definer
set search_path = crm, public
as $$
  with normalized as (
    select regexp_replace(coalesce(p_cep, ''), '\D', '', 'g') as cep
  ),
  matches as (
    select distinct on (c.id)
      c.id,
      coalesce(nullif(trim(c.nome_fantasia::text), ''), c.razao_social::text) as name,
      c.cep_prioridade,
      f.cep_de,
      f.cep_ate
    from normalized n
    join public.distribuidor_cep_faixas f
      on n.cep ~ '^[0-9]{8}$'
     and f.cep_de <= n.cep
     and f.cep_ate >= n.cep
    join public.clientes c
      on c.id = f.distribuidor_id
    where c.tipo_cliente = 'distribuidor'::tipo_cliente_enum
      and coalesce(c.ativo, false) = true
    order by c.id, f.cep_de
  )
  select
    matches.id,
    matches.name,
    matches.cep_prioridade,
    matches.cep_de,
    matches.cep_ate
  from matches
  order by
    matches.cep_prioridade asc nulls last,
    matches.name;
$$;

comment on function crm.list_distribuidores_por_cep(text) is
  'Distribuidores ativos cuja faixa de CEP cobre p_cep (8 dígitos). Ordenado por cep_prioridade asc.';

revoke all on function crm.list_distribuidores_por_cep(text) from public, anon;
grant execute on function crm.list_distribuidores_por_cep(text) to authenticated, service_role;

commit;
