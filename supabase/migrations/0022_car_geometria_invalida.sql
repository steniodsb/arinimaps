-- Arini Imóveis Brasil — migration 0022: CAR com geometria inválida.
--
-- Medido na primeira importação (24/09/2026): um imóvel de Campina Verde vem do
-- SICAR com polígono auto-intersectado; st_makevalid o conserta devolvendo uma
-- GeometryCollection (polígono + linha solta), e a coluna MultiPolygon recusava
-- o lote INTEIRO do município. st_collectionextract(..., 3) fica só com os
-- polígonos.

create or replace function fn_car_upsert(p_fc jsonb) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  insert into car_imoveis (cod_imovel, geom, area_ha, status, condicao, tipo_imovel, municipio,
                           cod_ibge, uf, modulos_fiscais, criado_sicar, atualizado_sicar, importado_em)
  select f->'properties'->>'cod_imovel',
         st_multi(st_collectionextract(st_makevalid(st_setsrid(st_geomfromgeojson(f->>'geometry'), 4326)), 3))::geometry(MultiPolygon, 4326),
         nullif(f->'properties'->>'area', '')::numeric,
         f->'properties'->>'status_imovel',
         f->'properties'->>'condicao',
         f->'properties'->>'tipo_imovel',
         f->'properties'->>'municipio',
         nullif(f->'properties'->>'cod_municipio_ibge', '')::integer,
         f->'properties'->>'uf',
         nullif(f->'properties'->>'m_fiscal', '')::numeric,
         nullif(f->'properties'->>'dat_criacao', '')::timestamptz,
         nullif(f->'properties'->>'data_atualizacao', '')::timestamptz,
         now()
  from jsonb_array_elements(p_fc->'features') f
  where f->'properties'->>'cod_imovel' is not null
    and f->'geometry' is not null
    and st_geometrytype(st_geomfromgeojson(f->>'geometry')) in ('ST_Polygon', 'ST_MultiPolygon')
  on conflict (cod_imovel) do update set
    geom = excluded.geom, area_ha = excluded.area_ha, status = excluded.status,
    condicao = excluded.condicao, tipo_imovel = excluded.tipo_imovel, municipio = excluded.municipio,
    cod_ibge = excluded.cod_ibge, uf = excluded.uf, modulos_fiscais = excluded.modulos_fiscais,
    criado_sicar = excluded.criado_sicar, atualizado_sicar = excluded.atualizado_sicar,
    importado_em = now();
  get diagnostics n = row_count;
  return n;
end $$;
