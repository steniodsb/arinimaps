-- Arini Maps — migration 0006: venda atômica, faturas, inadimplência, POIs, tour

-- bucket privado para documentos (contratos, matrículas, DWG) — sem policies:
-- só o service role acessa; entrega ao usuário é por URL assinada
insert into storage.buckets (id, name, public) values ('docs', 'docs', false)
on conflict (id) do nothing;

insert into settings (chave, valor) values
  ('notify_email', 'null'),
  ('suspensao_dias', '15'),
  ('poi_raio_rural_m', '15000'),
  ('poi_raio_urbano_m', '4000')
on conflict (chave) do nothing;

-- ============================================================
-- Venda atômica: sale + comissão + imóvel vendido + funil fechado + mensalidade cancelada
-- ============================================================
create or replace function fn_registrar_venda(
  p_opportunity_id uuid,
  p_valor numeric,
  p_data date,
  p_participantes jsonb,
  p_percentual numeric,
  p_regra text
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_prop uuid; v_sale uuid; v_status property_status;
begin
  select property_id into v_prop from opportunities where id = p_opportunity_id;
  if v_prop is null then raise exception 'Oportunidade não encontrada'; end if;

  insert into sales (opportunity_id, property_id, valor_final, data_venda, participantes)
  values (p_opportunity_id, v_prop, p_valor, coalesce(p_data, current_date), coalesce(p_participantes, '{}'::jsonb))
  returning id into v_sale;

  insert into commissions (sale_id, base_calculo, percentual, valor, regra_contratual)
  values (v_sale, p_valor, p_percentual, round(p_valor * p_percentual / 100.0, 2), p_regra);

  select status into v_status from properties where id = v_prop;
  if v_status in ('publicado','em_negociacao') then
    update properties set status = 'vendido' where id = v_prop;
  end if;

  update opportunities set etapa = 'fechado' where id = p_opportunity_id;
  update subscriptions set status = 'cancelada' where property_id = v_prop;
  return v_sale;
end $$;

-- ============================================================
-- Faturas da mensalidade (idempotente por competência)
-- ============================================================
create or replace function fn_gerar_faturas(p_competencia date)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into invoices (subscription_id, competencia, valor)
  select s.id, date_trunc('month', p_competencia)::date, s.valor_mensal
  from subscriptions s
  where s.status in ('ativa','pendente','inadimplente') and s.valor_mensal > 0
  on conflict (subscription_id, competencia) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

-- vencidas há mais de p_dias → fatura 'vencida' + assinatura 'inadimplente'
create or replace function fn_marcar_inadimplentes(p_dias int default 15)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update invoices i
  set status = 'vencida'
  from subscriptions s
  where i.subscription_id = s.id
    and i.status = 'aberta'
    and (i.competencia + (s.dia_vencimento - 1)) + p_dias < current_date;
  get diagnostics n = row_count;

  update subscriptions s set status = 'inadimplente'
  where s.status in ('ativa','pendente')
    and exists (select 1 from invoices i where i.subscription_id = s.id and i.status = 'vencida');
  return n;
end $$;

-- ============================================================
-- POIs: vincula os 3 mais próximos por categoria dentro do raio
-- ============================================================
create or replace function fn_vincular_pois(p_property_id uuid, p_raio_m numeric default 10000)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  delete from property_pois where property_id = p_property_id;
  insert into property_pois (property_id, poi_id, distancia_m, destaque)
  select p_property_id, t.id, round(t.dist), t.rn = 1
  from (
    select po.id,
           st_distance(po.geom::geography, g.centroid::geography) as dist,
           row_number() over (
             partition by po.categoria
             order by st_distance(po.geom::geography, g.centroid::geography)
           ) as rn
    from pois po
    join property_geometries g on g.property_id = p_property_id
    where st_dwithin(po.geom::geography, g.centroid::geography, p_raio_m)
  ) t
  where t.rn <= 3;
  get diagnostics n = row_count;
  return n;
end $$;

-- sede do município vira POI 'centro' (fonte ibge)
create or replace function fn_semear_pois_centro()
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into pois (categoria, nome, geom, municipality_id, fonte, osm_id)
  select 'centro', 'Centro de ' || m.nome, m.sede, m.id, 'ibge', m.codigo_ibge
  from municipalities m
  where m.sede is not null
  on conflict (fonte, osm_id) where osm_id is not null do nothing;
  get diagnostics n = row_count;
  return n;
exception when others then
  -- fallback para versões sem on conflict parcial em unique index com predicado
  return 0;
end $$;

-- ============================================================
-- Payload do tour 3D / seção de POIs da página
-- ============================================================
create or replace function fn_property_tour(p_codigo text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'codigo', p.codigo, 'titulo', p.titulo, 'tipo', p.tipo, 'status', p.status,
    'valor', p.valor,
    'geometry', (select st_asgeojson(g.geom, 6)::jsonb from property_geometries g where g.property_id = p.id),
    'centroid', (select jsonb_build_object('lng', st_x(g.centroid), 'lat', st_y(g.centroid))
                 from property_geometries g where g.property_id = p.id),
    'area_m2', (select g.area_m2 from property_geometries g where g.property_id = p.id),
    'municipio', (select jsonb_build_object('nome', m.nome, 'uf', m.uf,
                    'sede_lng', st_x(m.sede), 'sede_lat', st_y(m.sede))
                  from municipalities m where m.id = p.municipality_id),
    'pois', coalesce((
      select jsonb_agg(jsonb_build_object(
        'nome', po.nome, 'categoria', po.categoria,
        'lng', st_x(po.geom), 'lat', st_y(po.geom),
        'distancia_m', pp.distancia_m, 'destaque', pp.destaque
      ) order by pp.destaque desc, pp.distancia_m)
      from property_pois pp join pois po on po.id = pp.poi_id
      where pp.property_id = p.id
    ), '[]'::jsonb)
  )
  from properties p
  where p.codigo = p_codigo
    and p.status in ('publicado','em_negociacao','vendido')
$$;
