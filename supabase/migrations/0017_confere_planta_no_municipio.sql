-- Arini Imóveis Brasil — migration 0017: conferência da planta contra o município.
--
-- A 0016 comparava o centro da planta com `sede` e caía no centroide do
-- polígono quando a sede era nula. Medido em 10/09/2026 com a planta de
-- Iturama: o desenho caiu certo sobre a cidade, mas o aviso acusou "14,8 km
-- da sede" — porque Iturama tem 1.700 km² de área rural e o centroide do
-- município fica longe da mancha urbana. Aviso que dispara quando está tudo
-- certo treina o operador a ignorar aviso, que é o pior resultado possível.
--
-- A pergunta certa não é "a que distância do centro", é "o retângulo da planta
-- cai dentro do município?". Isso o PostGIS responde exato.

create or replace function fn_confere_planta(
  p_municipality_id uuid,
  p_x0 double precision, p_y0 double precision,
  p_x1 double precision, p_y1 double precision
) returns json language sql stable as $$
  with env as (
    select st_setsrid(st_makeenvelope(p_x0, p_y0, p_x1, p_y1), 4326) as g
  )
  select json_build_object(
    'nome', m.nome,
    'uf', m.uf,
    'tem_geom', m.geom is not null,
    'intersecta', case when m.geom is null then null else st_intersects(m.geom, env.g) end,
    'contido', case when m.geom is null then null else st_contains(m.geom, env.g) end,
    -- distância em km da borda do município até o retângulo da planta (0 se toca)
    'distancia_km', case
      when m.geom is null then null
      else round((st_distance(m.geom::geography, env.g::geography) / 1000)::numeric, 1)
    end,
    'centro_planta', json_build_array((p_x0 + p_x1) / 2, (p_y0 + p_y1) / 2)
  )
  from municipalities m, env
  where m.id = p_municipality_id;
$$;

comment on function fn_confere_planta is
  'Confere se o retângulo da planta enviada cai dentro do município escolhido. Distância 0 = encosta ou sobrepõe.';

notify pgrst, 'reload schema';
