-- Arini Maps — migration 0007: inserir município via API admin (geojson → geometry)

create or replace function fn_inserir_municipio(
  p_region_id uuid, p_nome text, p_uf text, p_codigo text, p_geojson jsonb
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; g geometry;
begin
  g := st_setsrid(st_geomfromgeojson(p_geojson::text), 4326);
  insert into municipalities (region_id, nome, uf, codigo_ibge, geom, sede)
  values (p_region_id, p_nome, p_uf, p_codigo, st_multi(g), st_centroid(g))
  returning id into v_id;
  return v_id;
end $$;
