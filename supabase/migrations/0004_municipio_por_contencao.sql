-- Arini Maps — migration 0004: define o município do imóvel pela contenção espacial do centroide

create or replace function fn_set_property_municipality(p_property_id uuid)
returns void language sql security definer set search_path = public as $$
  update properties p
  set municipality_id = (
    select m.id from municipalities m
    join property_geometries g on g.property_id = p_property_id
    where m.geom is not null and st_contains(m.geom, g.centroid)
    limit 1
  )
  where p.id = p_property_id
    and exists (
      select 1 from municipalities m
      join property_geometries g on g.property_id = p_property_id
      where m.geom is not null and st_contains(m.geom, g.centroid)
    )
$$;
