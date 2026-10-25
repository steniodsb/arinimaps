-- Arini Imóveis Brasil — migration 0053: vários lotes de uma vez e reencaixe na planta oficial.
--
-- Pedidos do Carlos (áudios de 24/10/2026):
--  1. "a pessoa tem um loteamento inteiro (...) a gente conseguir selecionar
--     vários lotes em sequência e encaminhar, sem ser um por um" — o mapa
--     seleciona N lotes e o cadastro cria o empreendimento + uma unidade por lote.
--  2. "na hora que os mapas oficiais vir, a gente retirar esse mapa e subir o
--     verdadeiro, se não vai dar diferença de localização" — até aqui o anúncio
--     guardava só uma CÓPIA da divisa; ao regerar os lotes (delete + insert em
--     urban_lots) o vínculo se perdia e a divisa ficava onde a planta antiga
--     dizia. Agora o anúncio guarda a identidade do lote (município, quadra,
--     número, área) e fn_reencaixar_anuncios() o encaixa no lote equivalente da
--     planta nova. O que não bater com segurança fica "divergente" para a Arini
--     conferir — a divisa não é trocada às cegas.

alter table properties
  -- lote da base cartográfica de onde veio a divisa (sem FK: urban_lots é regerada)
  add column if not exists lote_id uuid,
  add column if not exists lote_municipality_id uuid references municipalities(id) on delete set null,
  add column if not exists lote_quadra text,
  add column if not exists lote_numero text,
  add column if not exists lote_area_m2 numeric,
  -- resultado do último reencaixe: ok | divergente (null = nunca precisou)
  add column if not exists reencaixe_status text check (reencaixe_status in ('ok', 'divergente')),
  add column if not exists reencaixe_motivo text,
  add column if not exists reencaixe_em timestamptz;
create index if not exists idx_properties_lote_municipio on properties (lote_municipality_id) where lote_municipality_id is not null;
create index if not exists idx_properties_reencaixe on properties (reencaixe_status) where reencaixe_status = 'divergente';

-- Anúncios já feitos a partir de um lote: o vínculo é recuperado pela posição
-- (o lote cujo ponto interno cai dentro da divisa do anúncio).
update properties p set
  lote_id = l.id, lote_municipality_id = l.municipality_id,
  lote_quadra = l.quadra, lote_numero = l.numero, lote_area_m2 = l.area_m2
from property_geometries g, urban_lots l
where g.property_id = p.id and g.fonte = 'lote' and p.lote_id is null
  and st_intersects(g.geom, st_pointonsurface(l.geom));

/** Vários lotes com divisa e situação, para o cadastro em lote (só o servidor). */
create or replace function fn_lotes_por_ids(p_ids uuid[]) returns json
language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(json_build_object(
    'type', 'Feature',
    'geometry', st_asgeojson(l.geom, 7)::json,
    'properties', json_build_object(
      'id', l.id, 'area_m2', round(l.area_m2, 2), 'numero', l.numero, 'quadra', l.quadra,
      'municipio', m.nome, 'municipality_id', l.municipality_id,
      'anuncio', (select p.codigo from properties p join property_geometries g on g.property_id = p.id
                  where p.status not in ('reprovado', 'inativo', 'historico', 'vendido')
                    and st_intersects(g.geom, st_pointonsurface(l.geom)) limit 1)
    )
  ) order by l.quadra nulls last, l.numero nulls last), '[]'::json)
  from urban_lots l left join municipalities m on m.id = l.municipality_id
  where l.id = any(p_ids)
$$;
revoke execute on function fn_lotes_por_ids(uuid[]) from public, anon, authenticated;
grant execute on function fn_lotes_por_ids(uuid[]) to service_role;

-- quadra/número comparados sem zero à esquerda, espaço ou caixa: "07" = "7", "a" = "A"
create or replace function fn_rotulo_lote(t text) returns text
language sql immutable as $$
  select nullif(regexp_replace(upper(regexp_replace(coalesce(t, ''), '\s', '', 'g')), '^0+(?=.)', ''), '')
$$;

/**
 * Reencaixa os anúncios de lote do município da planta nos lotes dela.
 *
 * Quem entra: anúncio cuja divisa veio de lote e cujo lote não existe mais
 * (planta regerada ou apagada), os que ficaram divergentes antes, ou todos do
 * município com p_todos (botão do admin, ao trocar por uma planta nova).
 *
 * Como casa, em ordem:
 *  1. mesma quadra e mesmo número na planta nova, o homônimo mais perto (até
 *     300 m), com área parecida (até 25% de diferença) — a identidade vale
 *     mais que a posição;
 *  2. sem rótulo que case, o lote da planta nova que mais se sobrepõe à
 *     divisa atual, se cobrir ≥ 70% de um e de outro.
 * Casou: a divisa passa a ser a do lote novo (versão nova no histórico, a
 * antiga fica como "substituída"). Não casou: a divisa fica como está e o
 * anúncio vai para a lista de divergências do admin. Dois anúncios no mesmo
 * lote também são divergência. O empreendimento (pai) refaz a sua divisa como
 * a união das unidades.
 */
create or replace function fn_reencaixar_anuncios(p_layer_id uuid, p_todos boolean default false, p_user_id uuid default null)
returns json language plpgsql security definer set search_path = public as $$
declare
  cam record;
  r record;
  alvo uuid;
  motivo text;
  n_ok integer := 0;
  n_div integer := 0;
  n_igual integer := 0;
  numerada boolean;
  area_mudou boolean;
begin
  select id, nome, municipality_id into cam from cartography_layers where id = p_layer_id;
  if cam.id is null then raise exception 'planta não encontrada'; end if;
  if not exists (select 1 from urban_lots where layer_id = cam.id) then
    return json_build_object('planta', cam.nome, 'ok', 0, 'divergentes', 0, 'sem_mudanca', 0, 'aviso', 'planta sem lotes gerados');
  end if;
  numerada := exists (select 1 from urban_lots where layer_id = cam.id and numero is not null);

  perform set_config('arini.origem', 'fonte_oficial', true);
  perform set_config('arini.motivo', 'Reencaixe na planta ' || cam.nome, true);
  perform set_config('arini.user_id', coalesce(p_user_id::text, ''), true);

  for r in
    select p.id, p.lote_id, p.lote_quadra, p.lote_numero, p.lote_area_m2, g.geom
    from properties p join property_geometries g on g.property_id = p.id
    where g.fonte = 'lote' and p.lote_municipality_id = cam.municipality_id
      and p.status not in ('reprovado', 'inativo', 'historico', 'vendido')
      and (p_todos or p.reencaixe_status = 'divergente'
           or p.lote_id is null or not exists (select 1 from urban_lots u where u.id = p.lote_id)
           -- lote que andou no lugar (ajuste de uma parte da planta mantém o id)
           or exists (select 1 from urban_lots u where u.id = p.lote_id and st_hausdorffdistance(u.geom, g.geom) >= 0.0000002))
    order by p.created_at
  loop
    alvo := null;
    motivo := null;
    area_mudou := false;

    if fn_rotulo_lote(r.lote_quadra) is not null and fn_rotulo_lote(r.lote_numero) is not null and numerada then
      -- 1. pela identidade. Planta de prefeitura repete "Quadra 15, lote 4" em
      -- bairros diferentes (Iturama, medido em 24/10/2026: 18 de 20 anúncios
      -- tinham o rótulo repetido), então entre os homônimos vale o mais perto
      -- da divisa atual — e só se estiver no mesmo bairro (até 300 m).
      select u.id into alvo
      from urban_lots u
      where u.layer_id = cam.id
        and fn_rotulo_lote(u.quadra) = fn_rotulo_lote(r.lote_quadra)
        and fn_rotulo_lote(u.numero) = fn_rotulo_lote(r.lote_numero)
        and st_dwithin(u.geom::geography, st_pointonsurface(r.geom)::geography, 300)
      order by st_distance(u.geom::geography, st_pointonsurface(r.geom)::geography)
      limit 1;
      if alvo is not null and r.lote_area_m2 is not null
         and (select abs(u.area_m2 - r.lote_area_m2) / greatest(r.lote_area_m2, 1) from urban_lots u where u.id = alvo) > 0.25 then
        motivo := format('Quadra %s, lote %s mudou de área: %s m² antes, %s m² na planta nova',
          r.lote_quadra, r.lote_numero, round(r.lote_area_m2), (select round(area_m2) from urban_lots where id = alvo));
        alvo := null;
        area_mudou := true;
      elsif alvo is null then
        motivo := format('Quadra %s, lote %s não encontrado perto da divisa atual na planta %s', r.lote_quadra, r.lote_numero, cam.nome);
      end if;
    end if;
    if alvo is null and not area_mudou then
      -- 2. pela posição (planta sem numeração, ou o rótulo mudou)
      select u.id into alvo
      from urban_lots u
      where u.layer_id = cam.id and st_intersects(u.geom, r.geom)
        and st_area(st_intersection(u.geom, r.geom)::geography) >= 0.7 * greatest(st_area(u.geom::geography), st_area(r.geom::geography))
      order by st_area(st_intersection(u.geom, r.geom)::geography) desc
      limit 1;
      if alvo is null then
        motivo := coalesce(motivo, format('Nenhum lote da planta %s coincide com a divisa atual', cam.nome));
      end if;
    end if;

    if alvo is not null and exists (
      select 1 from properties o where o.id <> r.id and o.lote_id = alvo
        and o.status not in ('reprovado', 'inativo', 'historico', 'vendido') and coalesce(o.reencaixe_status, 'ok') = 'ok'
    ) then
      motivo := 'Outro anúncio já ocupa o mesmo lote na planta ' || cam.nome;
      alvo := null;
    end if;

    if alvo is null then
      update properties set reencaixe_status = 'divergente', reencaixe_motivo = motivo, reencaixe_em = now() where id = r.id;
      n_div := n_div + 1;
      continue;
    end if;

    -- a cópia do cadastro passou por GeoJSON com 7 casas: 1 cm de diferença é a mesma divisa
    if st_hausdorffdistance((select geom from urban_lots where id = alvo), r.geom) < 0.0000002 then
      n_igual := n_igual + 1;
    else
      n_ok := n_ok + 1;
      update property_geometries g set geom = u.geom from urban_lots u where u.id = alvo and g.property_id = r.id;
    end if;
    update properties p set
      lote_id = u.id,
      -- a identidade só é preenchida, nunca trocada: é ela que encaixa na próxima planta
      lote_quadra = coalesce(p.lote_quadra, u.quadra), lote_numero = coalesce(p.lote_numero, u.numero),
      lote_area_m2 = u.area_m2,
      reencaixe_status = 'ok', reencaixe_motivo = null, reencaixe_em = now()
    from urban_lots u where u.id = alvo and p.id = r.id;
  end loop;

  -- empreendimento: divisa = união das unidades que vieram de lote
  update property_geometries g set geom = s.u
  from (
    select p.parent_property_id pai, st_multi(st_union(gc.geom)) u
    from properties p join property_geometries gc on gc.property_id = p.id
    where p.lote_municipality_id = cam.municipality_id and p.parent_property_id is not null and gc.fonte = 'lote'
    group by p.parent_property_id
  ) s
  where g.property_id = s.pai and g.fonte = 'lote' and not st_equals(g.geom, s.u);

  perform set_config('arini.origem', '', true);
  perform set_config('arini.motivo', '', true);
  perform set_config('arini.user_id', '', true);
  return json_build_object('planta', cam.nome, 'ok', n_ok, 'divergentes', n_div, 'sem_mudanca', n_igual);
end $$;
revoke execute on function fn_reencaixar_anuncios(uuid, boolean, uuid) from public, anon, authenticated;
grant execute on function fn_reencaixar_anuncios(uuid, boolean, uuid) to service_role;
