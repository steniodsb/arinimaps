-- Arini Maps — migration 0025: perfis novos, imóveis de leilão, território do
-- franqueado e selfie na exclusividade.
--
-- Itens 9, 10, 11 e 12 da "Especificação de alterações e melhorias" do Carlos
-- (01/10/2026).

-- ---------------------------------------------------------------------------
-- Perfis. Leiloeiro e franqueado são PARCEIROS (passam por aprovação da
-- Matriz, têm painel próprio e só enxergam os próprios imóveis — a RLS de
-- parceiro já garante isso). "consulta" é a conta de quem só pesquisa.
-- ---------------------------------------------------------------------------
alter type user_role add value if not exists 'leiloeiro';
alter type user_role add value if not exists 'franqueado';
alter type user_role add value if not exists 'consulta';
alter type partner_type add value if not exists 'leiloeiro';
alter type partner_type add value if not exists 'franqueado';

-- Território do franqueado: a região que ele representa. Ele consulta e gere
-- os imóveis dele; aprovar e publicar continua sendo da Matriz.
alter table partners add column if not exists region_id uuid references regions(id) on delete set null;
create index if not exists idx_partners_region on partners (region_id);

-- ---------------------------------------------------------------------------
-- Leilão. `modalidade` separa venda comum de leilão no mapa, na busca e na
-- análise; os dados do leilão (praças, lances, edital, processo) ficam em
-- `leilao` porque variam de leiloeiro para leiloeiro.
-- ---------------------------------------------------------------------------
alter table properties
  add column if not exists modalidade text not null default 'venda' check (modalidade in ('venda', 'leilao')),
  add column if not exists leilao jsonb not null default '{}';
create index if not exists idx_properties_modalidade on properties (modalidade);

-- ---------------------------------------------------------------------------
-- Selfie no aceite da exclusividade: foto de identificação visual de quem
-- aceitou, guardada no cofre de documentos. NÃO é biometria: não há
-- reconhecimento facial nem comparação automática — é evidência para o
-- Jurídico conferir com o documento do proprietário.
-- ---------------------------------------------------------------------------
alter table property_authorizations add column if not exists selfie_path text;

-- o mapa precisa saber a modalidade para a cor e o filtro de leilão
create or replace function fn_properties_geojson()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_build_object(
    'type','FeatureCollection',
    'features', coalesce(jsonb_agg(
      jsonb_build_object(
        'type','Feature',
        'geometry', st_asgeojson(g.geom, 6)::jsonb,
        'properties', jsonb_build_object(
          'id', p.id, 'codigo', p.codigo, 'titulo', p.titulo, 'tipo', p.tipo,
          'status', p.status, 'valor', p.valor, 'modalidade', p.modalidade,
          -- a cor no mapa: leilão tem cor própria enquanto está disponível
          'cor', case when p.modalidade = 'leilao' and p.status = 'publicado' then 'leilao' else p.status::text end,
          'area_m2', g.area_m2,
          'lng', st_x(g.centroid), 'lat', st_y(g.centroid),
          'municipio', (select m.nome from municipalities m where m.id = p.municipality_id),
          'capa', (select md.storage_path from property_media md
                   where md.property_id = p.id and md.tipo = 'foto'
                   order by md.capa desc, md.ordem limit 1)
        )
      )), '[]'::jsonb)
  ), '{"type":"FeatureCollection","features":[]}'::jsonb)
  from properties p
  join property_geometries g on g.property_id = p.id
  where p.status in ('publicado','em_negociacao','vendido')
$$;
