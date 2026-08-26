-- Arini Maps — migration 0005: geometria de qualquer imóvel para o painel admin

create or replace function fn_property_admin_geometry(p_property_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select st_asgeojson(g.geom, 6)::jsonb
  from property_geometries g
  where g.property_id = p_property_id
$$;
