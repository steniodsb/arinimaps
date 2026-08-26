-- Arini Maps — migration 0002: bucket de mídia + funções geo de apoio

-- ============================================================
-- STORAGE: bucket público de mídia (fotos/vídeos/documentos)
-- ============================================================
insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do nothing;

create policy "media_public_read" on storage.objects
  for select using (bucket_id = 'media');
create policy "media_auth_insert" on storage.objects
  for insert with check (bucket_id = 'media' and auth.role() = 'authenticated');
create policy "media_owner_delete" on storage.objects
  for delete using (bucket_id = 'media' and (owner = auth.uid() or fn_is_arini()));

-- ============================================================
-- Inserir/atualizar geometria a partir de GeoJSON (chamada por rota de API)
-- security definer: a rota valida a permissão antes (fn_property_editable_id)
-- ============================================================
create or replace function fn_upsert_geometry(
  p_property_id uuid,
  p_geojson jsonb,
  p_fonte geometry_source,
  p_arquivo text default null
) returns table (area_m2 numeric, perimeter_m numeric)
language plpgsql security definer set search_path = public as $$
declare g geometry;
begin
  g := st_setsrid(st_geomfromgeojson(p_geojson::text), 4326);
  if not st_isvalid(g) then
    g := st_makevalid(g);
  end if;
  insert into property_geometries (property_id, geom, fonte, arquivo_original_path)
  values (p_property_id, g, p_fonte, p_arquivo)
  on conflict (property_id) do update
    set geom = excluded.geom, fonte = excluded.fonte,
        arquivo_original_path = coalesce(excluded.arquivo_original_path, property_geometries.arquivo_original_path);
  return query
    select pg2.area_m2, pg2.perimeter_m from property_geometries pg2 where pg2.property_id = p_property_id;
end $$;

-- ============================================================
-- GeoJSON dos imóveis visíveis no mapa público
-- ============================================================
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
          'status', p.status, 'valor', p.valor,
          'area_m2', g.area_m2,
          'lng', st_x(g.centroid), 'lat', st_y(g.centroid)
        )
      )), '[]'::jsonb)
  ), '{"type":"FeatureCollection","features":[]}'::jsonb)
  from properties p
  join property_geometries g on g.property_id = p.id
  where p.status in ('publicado','em_negociacao','vendido')
$$;

-- ============================================================
-- GeoJSON dos municípios ativos (limites no mapa)
-- ============================================================
create or replace function fn_municipalities_geojson()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_build_object(
    'type','FeatureCollection',
    'features', coalesce(jsonb_agg(
      jsonb_build_object(
        'type','Feature',
        'geometry', st_asgeojson(m.geom, 5)::jsonb,
        'properties', jsonb_build_object('id', m.id, 'nome', m.nome, 'uf', m.uf)
      )), '[]'::jsonb)
  ), '{"type":"FeatureCollection","features":[]}'::jsonb)
  from municipalities m
  where m.ativo and m.geom is not null
$$;

-- município que contém um ponto (usado ao salvar geometria)
create or replace function fn_municipality_for_point(p_lng double precision, p_lat double precision)
returns uuid language sql stable security definer set search_path = public as $$
  select m.id from municipalities m
  where m.geom is not null and st_contains(m.geom, st_setsrid(st_point(p_lng, p_lat), 4326))
  limit 1
$$;
