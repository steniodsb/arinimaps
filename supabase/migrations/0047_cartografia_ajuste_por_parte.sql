-- Arini Imóveis Brasil — migration 0047: ajuste da planta por parte (16/10/2026)
--
-- Pedido do Carlos: mover só uma quadra ou um trecho da planta, sem mexer no
-- resto da cidade. Cada parte é uma área desenhada sobre o desenho cru com o seu
-- próprio deslocamento e giro (src/lib/geo/deslocar.ts, "AJUSTE POR PARTE").
--
-- ajustes_locais: [{ id, nome, area: [[lng, lat], ...], t: { offsetLesteM,
--   offsetNorteM, rotacaoGraus, escala } }]
--
-- fn_ajustar_lotes_parte: move NO LUGAR os lotes clicáveis de uma parte, em vez
-- de refazer os lotes da cidade inteira — refazer apaga a numeração de quadra e
-- lote (scripts/numera-lotes.mjs) e leva minutos no worker. O lote entra na
-- parte se o seu ponto interno, levado de volta ao desenho cru por `p_inv`, cai
-- dentro da área; `p_delta` leva da posição antiga para a nova. Parte é rígida
-- (sem escala), então área, perímetro e lados do lote não mudam.

alter table cartography_layers
  add column if not exists ajustes_locais jsonb not null default '[]'::jsonb;

comment on column cartography_layers.ajustes_locais is
  'Partes da planta com ajuste próprio (deslocamento e giro), áreas no desenho cru. Ver src/lib/geo/deslocar.ts.';

create or replace function fn_ajustar_lotes_parte(
  p_layer uuid,
  p_area jsonb,          -- GeoJSON Polygon, desenho cru (graus)
  p_inv float8[],        -- [a, b, d, e, xoff, yoff]: posição atual → desenho cru
  p_delta float8[]       -- [a, b, d, e, xoff, yoff]: posição atual → posição nova
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_area geometry := st_setsrid(st_geomfromgeojson(p_area::text), 4326);
  v_n integer;
begin
  update urban_lots u
     set geom = st_affine(u.geom, p_delta[1], p_delta[2], p_delta[3], p_delta[4], p_delta[5], p_delta[6])
   where u.layer_id = p_layer
     and st_within(
       st_affine(st_pointonsurface(u.geom), p_inv[1], p_inv[2], p_inv[3], p_inv[4], p_inv[5], p_inv[6]),
       v_area);
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- só o servidor (service_role) chama; a 0046 já faz as funções novas nascerem fechadas
revoke execute on function fn_ajustar_lotes_parte(uuid, jsonb, float8[], float8[]) from public, anon, authenticated;
grant execute on function fn_ajustar_lotes_parte(uuid, jsonb, float8[], float8[]) to service_role;
