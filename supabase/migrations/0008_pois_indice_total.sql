-- Arini Maps — migration 0008: índice único TOTAL em pois (fonte, osm_id).
-- O upsert via PostgREST não enxerga índice parcial (ON CONFLICT sem WHERE não casa),
-- o que derrubava o cache de POIs no momento da publicação.

delete from pois where osm_id is null;
alter table pois alter column osm_id set default ('manual/' || gen_random_uuid());
update pois set osm_id = 'manual/' || gen_random_uuid() where osm_id is null;
alter table pois alter column osm_id set not null;

drop index if exists uq_pois_osm;
create unique index uq_pois_osm on pois (fonte, osm_id);

-- semear centro sem depender de índice parcial
create or replace function fn_semear_pois_centro()
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into pois (categoria, nome, geom, municipality_id, fonte, osm_id)
  select 'centro', 'Centro de ' || m.nome, m.sede, m.id, 'ibge', m.codigo_ibge
  from municipalities m
  where m.sede is not null
  on conflict (fonte, osm_id) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;
