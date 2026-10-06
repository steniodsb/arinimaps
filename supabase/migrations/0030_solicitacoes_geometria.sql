-- Arini Maps — migration 0030: geometria das solicitações cartográficas.
--
-- O supabase-js não envia geometria PostGIS direto: a linha entra sem ponto e
-- sem geom e, em seguida, o servidor grava os dois a partir do GeoJSON por
-- esta função. A leitura volta como GeoJSON pela segunda. As duas rodam só
-- pelo servidor (service_role), como as demais funções desde a 0026.

/** Grava ponto e/ou área da solicitação a partir de GeoJSON; devolve a área (m²) quando é polígono. */
create or replace function fn_cart_request_set_geometry(p_id uuid, p_ponto jsonb default null, p_geom jsonb default null)
returns numeric language plpgsql security definer set search_path = public as $$
declare
  pt geometry;
  g geometry;
  a numeric;
begin
  if p_ponto is not null then
    pt := st_setsrid(st_geomfromgeojson(p_ponto::text), 4326);
    if st_geometrytype(pt) <> 'ST_Point' then
      raise exception 'O ponto da solicitação precisa ser um Point.';
    end if;
  end if;
  if p_geom is not null then
    g := st_setsrid(st_geomfromgeojson(p_geom::text), 4326);
    if not st_isvalid(g) then
      g := st_makevalid(g);
    end if;
    -- um ponto mandado como "área" vai para a coluna certa
    if st_geometrytype(g) = 'ST_Point' then
      pt := coalesce(pt, g);
      g := null;
    elsif st_geometrytype(g) in ('ST_Polygon', 'ST_MultiPolygon') then
      a := round(st_area(g::geography)::numeric, 2);
    end if;
  end if;
  update cartographic_requests
    set ponto = coalesce(pt, ponto),
        geom = coalesce(g, geom),
        area_m2 = coalesce(a, area_m2)
    where id = p_id;
  if not found then
    raise exception 'Solicitação não encontrada.';
  end if;
  return a;
end $$;

/** Ponto e área da solicitação como GeoJSON: {ponto, geom} (null quando não há). */
create or replace function fn_cart_request_geojson(p_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'ponto', case when r.ponto is null then null else st_asgeojson(r.ponto, 7)::jsonb end,
    'geom',  case when r.geom  is null then null else st_asgeojson(r.geom, 7)::jsonb end,
    'area_m2', r.area_m2
  ) from cartographic_requests r where r.id = p_id
$$;

revoke execute on function fn_cart_request_set_geometry(uuid, jsonb, jsonb) from public, anon, authenticated;
revoke execute on function fn_cart_request_geojson(uuid) from public, anon, authenticated;
grant execute on function fn_cart_request_set_geometry(uuid, jsonb, jsonb) to service_role;
grant execute on function fn_cart_request_geojson(uuid) to service_role;
