-- Arini Maps — migration 0009: unidades em empreendimento (bloco de apartamentos,
-- loteamento). Um imóvel pode apontar para um imóvel "pai"; a página do pai lista
-- as unidades publicadas.

alter table properties add column parent_property_id uuid references properties(id);
create index idx_properties_parent on properties (parent_property_id);
