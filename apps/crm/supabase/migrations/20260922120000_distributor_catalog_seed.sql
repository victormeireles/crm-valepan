-- Catálogo oficial de distribuidores (estado, cidade e nome)
-- usado em Configurações e no encaminhamento do lead.

insert into crm.distributors (name, active)
select seed.name, true
from (
  values
    ('DICON'),
    ('NECHIO'),
    ('NUTRYMAX'),
    ('TOP ALTO'),
    ('IRMÃOS DELOVA'),
    ('CACHINHOS DOURADOS'),
    ('FORTE ALIMENTOS'),
    ('NEW SPACE'),
    ('CM FOODS'),
    ('TRINITY SUPPLY'),
    ('NOÉ'),
    ('LOUCOS POR HAMBURGUER'),
    ('MM - MOGI DAS CRUZES'),
    ('MR ALIMENTOS'),
    ('RN SANTO ANDRÉ'),
    ('WM PÃES'),
    ('MEGAVALE'),
    ('CHEF+ CID. TIRADENTES'),
    ('CHEF+ SAPOPEMBA'),
    ('KOUTO ALIMENTOS'),
    ('NOÉ DIADEMA'),
    ('RN DISTRIBUIDORA'),
    ('NOÉ - GRAJAÚ'),
    ('MM - SUZANO'),
    ('BRUNO'),
    ('WESLEY'),
    ('MUNDO DO HAMBURGUEIRO')
) as seed(name)
where not exists (
  select 1
  from crm.distributors existing
  where upper(trim(existing.name)) = seed.name
);

insert into crm.distributor_regions (distributor_id, region_name, state)
select distributor.id, seed.city, seed.state
from (
  values
    ('RJ', 'Queimados', 'DICON'),
    ('RJ', 'Rio de Janeiro', 'NECHIO'),
    ('RJ', 'Rio de Janeiro', 'NUTRYMAX'),
    ('RJ', 'Duque de Caxias', 'TOP ALTO'),
    ('SP', 'Campinas', 'IRMÃOS DELOVA'),
    ('SP', 'Carapicuíba', 'CACHINHOS DOURADOS'),
    ('SP', 'Cotia', 'FORTE ALIMENTOS'),
    ('SP', 'Diadema', 'NEW SPACE'),
    ('SP', 'Guarulhos', 'CM FOODS'),
    ('SP', 'Guarulhos', 'TRINITY SUPPLY'),
    ('SP', 'Mauá', 'NOÉ'),
    ('SP', 'Mogi das Cruzes', 'LOUCOS POR HAMBURGUER'),
    ('SP', 'Mogi das Cruzes', 'MM - MOGI DAS CRUZES'),
    ('SP', 'Praia Grande', 'MR ALIMENTOS'),
    ('SP', 'Santo André', 'RN SANTO ANDRÉ'),
    ('SP', 'São Bernardo do Campo', 'WM PÃES'),
    ('SP', 'São José dos Campos', 'MEGAVALE'),
    ('SP', 'São Paulo', 'CHEF+ CID. TIRADENTES'),
    ('SP', 'São Paulo', 'CHEF+ SAPOPEMBA'),
    ('SP', 'São Paulo', 'KOUTO ALIMENTOS'),
    ('SP', 'Diadema', 'NOÉ DIADEMA'),
    ('SP', 'São Paulo', 'RN DISTRIBUIDORA'),
    ('SP', 'São Paulo', 'NOÉ - GRAJAÚ'),
    ('SP', 'Suzano', 'MM - SUZANO'),
    ('RJ', 'Resende', 'BRUNO'),
    ('RJ', 'Volta Redonda', 'WESLEY'),
    ('MG', 'Contagem', 'MUNDO DO HAMBURGUEIRO')
) as seed(state, city, name)
join crm.distributors distributor on upper(trim(distributor.name)) = seed.name
where not exists (
  select 1
  from crm.distributor_regions region
  where region.distributor_id = distributor.id
    and upper(trim(region.region_name)) = upper(seed.city)
    and upper(coalesce(region.state, '')) = seed.state
);
