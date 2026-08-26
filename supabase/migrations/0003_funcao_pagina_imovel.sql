-- Arini Maps — migration 0003: payload completo da página pública do imóvel

create or replace function fn_property_public(p_codigo text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', p.id, 'codigo', p.codigo, 'tipo', p.tipo, 'status', p.status,
    'titulo', p.titulo, 'descricao', p.descricao, 'valor', p.valor,
    'area_declarada', p.area_declarada, 'caracteristicas', p.caracteristicas,
    'condicoes_venda', p.condicoes_venda,
    'aceita_permuta', p.aceita_permuta, 'aceita_financiamento', p.aceita_financiamento,
    'published_at', p.published_at,
    'municipio', (select jsonb_build_object('nome', m.nome, 'uf', m.uf) from municipalities m where m.id = p.municipality_id),
    'geometry', (select st_asgeojson(g.geom, 6)::jsonb from property_geometries g where g.property_id = p.id),
    'centroid', (select jsonb_build_object('lng', st_x(g.centroid), 'lat', st_y(g.centroid))
                 from property_geometries g where g.property_id = p.id),
    'area_m2', (select g.area_m2 from property_geometries g where g.property_id = p.id),
    'perimeter_m', (select g.perimeter_m from property_geometries g where g.property_id = p.id),
    'media', coalesce((select jsonb_agg(jsonb_build_object('tipo', md.tipo, 'path', md.storage_path, 'capa', md.capa) order by md.capa desc, md.ordem)
                       from property_media md where md.property_id = p.id), '[]'::jsonb)
  )
  from properties p
  where p.codigo = p_codigo
    and p.status in ('publicado','em_negociacao','vendido')
$$;
