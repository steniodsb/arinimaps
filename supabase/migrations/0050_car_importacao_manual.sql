-- Arini Imóveis Brasil — migration 0050: importação manual das camadas ambientais do CAR.
--
-- Pedido do Carlos (22/10/2026, item 1 do levantamento de fontes): APP, reserva
-- legal, vegetação nativa e área consolidada só saem da base de downloads do
-- SICAR, um município por vez e com CAPTCHA (PENDENCIAS 3.5). A equipe baixa o
-- zip à mão e sobe em Central › Cartografia › CAR: importação e cobertura.
--
-- O navegador lê o zip (shapefile → GeoJSON em graus) e manda as feições em
-- lotes; o banco valida cada uma (tipo, geometria, dentro do Brasil, código do
-- imóvel), corrige o que dá para corrigir, descarta o
-- repetido e registra o resto como falha. Nada vira oficial até "concluir":
-- aí as feições novas passam a valer e as anteriores do mesmo município e tema
-- ficam guardadas como histórico (vigente = false), com origem e data.
--
-- Tudo só pelo servidor (service_role), como as demais funções desde a 0026.

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------

/** Uma importação = um arquivo do SICAR de um município. */
create table if not exists car_importacoes (
  id uuid primary key default gen_random_uuid(),
  cod_ibge integer not null,
  municipio text not null,
  uf text not null,
  arquivo_nome text not null,
  arquivo_bytes bigint,
  arquivo_sha256 text,
  -- data em que o arquivo foi baixado do SICAR (a "data da base")
  data_base date not null,
  status text not null default 'enviando'
    check (status in ('enviando', 'concluida', 'com_falhas', 'falhou', 'descartada')),
  -- por tema: {lidos, gravados, duplicados, invalidos, corrigidos, area_ha}
  temas jsonb not null default '{}'::jsonb,
  -- feições que o navegador já recusou ao ler o arquivo (sem geometria, tipo errado…)
  avisos jsonb not null default '[]'::jsonb,
  falhas_total integer not null default 0,
  observacao text,
  criado_por uuid,
  criado_em timestamptz not null default now(),
  concluido_em timestamptz
);
create index if not exists idx_car_importacoes_municipio on car_importacoes (cod_ibge, criado_em desc);
create index if not exists idx_car_importacoes_sha on car_importacoes (arquivo_sha256);

/** Feição recusada, com o motivo — a equipe vê na ficha da importação. */
create table if not exists car_importacao_falhas (
  id bigserial primary key,
  importacao_id uuid not null references car_importacoes (id) on delete cascade,
  tema text not null,
  indice integer,
  cod_imovel text,
  motivo text not null,
  criado_em timestamptz not null default now()
);
create index if not exists idx_car_falhas_importacao on car_importacao_falhas (importacao_id, tema, indice);

/**
 * Polígonos temáticos do CAR. `vigente` marca a versão em uso; as anteriores
 * ficam (histórico) até alguém decidir descartar versões velhas.
 */
create table if not exists car_temas (
  id bigserial primary key,
  importacao_id uuid not null references car_importacoes (id) on delete cascade,
  cod_ibge integer not null,
  tema text not null check (tema in (
    'area_imovel', 'app', 'reserva_legal', 'vegetacao_nativa', 'area_consolidada',
    'uso_restrito', 'servidao_administrativa', 'hidrografia', 'area_pousio'
  )),
  cod_imovel text,
  geom geometry(MultiPolygon, 4326) not null,
  area_ha numeric,
  area_declarada_ha numeric,
  atributos jsonb,
  geom_hash text not null,
  vigente boolean not null default false
);
-- repetido dentro do mesmo arquivo (mesmo imóvel, mesmo tema, mesma geometria) não entra duas vezes
create unique index if not exists uq_car_temas_feicao on car_temas (importacao_id, tema, coalesce(cod_imovel, ''), geom_hash);
create index if not exists idx_car_temas_geom on car_temas using gist (geom) where vigente;
create index if not exists idx_car_temas_municipio on car_temas (cod_ibge, tema) where vigente;
create index if not exists idx_car_temas_imovel on car_temas (cod_imovel) where vigente;
create index if not exists idx_car_temas_importacao on car_temas (importacao_id);

/** Cobertura por município: o que está valendo e desde quando. */
create table if not exists car_cobertura (
  cod_ibge integer primary key,
  municipio text not null,
  uf text not null,
  -- limite do IBGE, para dizer que parte de uma consulta tem dado importado
  limite geometry(MultiPolygon, 4326),
  data_base date,
  importado_em timestamptz,
  ultima_importacao uuid references car_importacoes (id) on delete set null,
  temas text[] not null default '{}',
  feicoes integer not null default 0,
  atualizado_em timestamptz not null default now()
);
create index if not exists idx_car_cobertura_limite on car_cobertura using gist (limite);
create index if not exists idx_car_cobertura_uf on car_cobertura (uf);

alter table car_importacoes enable row level security;
alter table car_importacao_falhas enable row level security;
alter table car_temas enable row level security;
alter table car_cobertura enable row level security;

-- ---------------------------------------------------------------------------
-- Gravação de um lote de feições
-- ---------------------------------------------------------------------------

/**
 * Recebe até ~1.000 feições de um tema já em graus (o navegador reprojeta pelo
 * .prj) e devolve as contagens do lote. Cada feição é validada sozinha: uma
 * geometria quebrada vira falha registrada, não derruba o lote.
 *
 * A falha aponta o registro do shapefile (`_registro`, contado do zero, que o
 * navegador manda); sem ele, p_inicio + posição no lote.
 */
create or replace function fn_car_importacao_lote(p_importacao uuid, p_tema text, p_inicio integer, p_fc jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  imp car_importacoes;
  f jsonb;
  i integer := 0;
  g geometry;
  cod text;
  area_decl numeric;
  props jsonb;
  corrigida boolean;
  n_lidos integer := 0; n_gravados integer := 0; n_dup integer := 0; n_inv integer := 0; n_corr integer := 0;
  soma_ha numeric := 0;
  a_ha numeric;
  linhas integer;
  brasil geometry := st_makeenvelope(-74.1, -34.0, -28.6, 5.4, 4326);
  atual jsonb;
begin
  select * into imp from car_importacoes where id = p_importacao;
  if not found then raise exception 'Importação não encontrada.'; end if;
  if imp.status <> 'enviando' then raise exception 'Esta importação já foi encerrada (%).', imp.status; end if;

  for f in select * from jsonb_array_elements(coalesce(p_fc->'features', '[]'::jsonb)) loop
    n_lidos := n_lidos + 1;
    props := coalesce(f->'properties', '{}'::jsonb);
    cod := nullif(trim(coalesce(props->>'cod_imovel', '')), '');
    area_decl := case when coalesce(props->>'area_declarada_ha', '') ~ '^-?[0-9]+([.][0-9]+)?$'
                      then (props->>'area_declarada_ha')::numeric end;
    corrigida := false;
    begin
      if f->'geometry' is null or jsonb_typeof(f->'geometry') <> 'object' then
        raise exception 'sem geometria';
      end if;
      g := st_setsrid(st_geomfromgeojson((f->'geometry')::text), 4326);
      if st_geometrytype(g) not in ('ST_Polygon', 'ST_MultiPolygon') then
        raise exception 'geometria do tipo % (esperado polígono)', replace(st_geometrytype(g), 'ST_', '');
      end if;
      if not st_isvalid(g) then
        g := st_collectionextract(st_makevalid(g), 3);
        corrigida := true;
      end if;
      if g is null or st_isempty(g) then raise exception 'geometria vazia depois da correção'; end if;
      g := st_multi(g);
      if not st_within(g, brasil) then raise exception 'coordenadas fora do Brasil (o arquivo está em outra projeção?)'; end if;
      -- código de outro município NÃO é erro: o SICAR guarda o município da inscrição, e
      -- imóvel na divisa aparece no arquivo do vizinho (4 de 1.543 em Iturama, 22/10/2026)

      a_ha := round((st_area(g::geography) / 10000)::numeric, 4);
      insert into car_temas (importacao_id, cod_ibge, tema, cod_imovel, geom, area_ha, area_declarada_ha, atributos, geom_hash)
      values (p_importacao, imp.cod_ibge, p_tema, cod, g, a_ha, area_decl, props - 'cod_imovel' - 'area_declarada_ha' - '_registro',
              md5(st_asbinary(st_snaptogrid(g, 0.0000001))))
      on conflict do nothing;
      get diagnostics linhas = row_count;
      if linhas = 0 then
        n_dup := n_dup + 1;
      else
        n_gravados := n_gravados + 1;
        soma_ha := soma_ha + a_ha;
        if corrigida then n_corr := n_corr + 1; end if;
      end if;
    exception when others then
      n_inv := n_inv + 1;
      insert into car_importacao_falhas (importacao_id, tema, indice, cod_imovel, motivo)
      values (p_importacao, p_tema,
              case when coalesce(props->>'_registro', '') ~ '^[0-9]+$' then (props->>'_registro')::integer else p_inicio + i end,
              cod, left(sqlerrm, 300));
    end;
    i := i + 1;
  end loop;

  -- soma no resumo do tema
  atual := coalesce(imp.temas->p_tema, '{}'::jsonb);
  update car_importacoes set
    temas = jsonb_set(temas, array[p_tema], jsonb_build_object(
      'lidos', coalesce((atual->>'lidos')::integer, 0) + n_lidos,
      'gravados', coalesce((atual->>'gravados')::integer, 0) + n_gravados,
      'duplicados', coalesce((atual->>'duplicados')::integer, 0) + n_dup,
      'invalidos', coalesce((atual->>'invalidos')::integer, 0) + n_inv,
      'corrigidos', coalesce((atual->>'corrigidos')::integer, 0) + n_corr,
      'area_ha', round(coalesce((atual->>'area_ha')::numeric, 0) + soma_ha, 2)
    )),
    falhas_total = falhas_total + n_inv
  where id = p_importacao;

  return jsonb_build_object('lidos', n_lidos, 'gravados', n_gravados, 'duplicados', n_dup,
                            'invalidos', n_inv, 'corrigidos', n_corr);
end $$;

-- ---------------------------------------------------------------------------
-- Conclusão: troca a versão vigente
-- ---------------------------------------------------------------------------

/**
 * Encerra a importação. Para cada tema que chegou com pelo menos uma feição, a
 * versão nova passa a valer e a anterior do mesmo município fica no histórico.
 * Tema que não veio no arquivo continua com a versão que já estava (dá para
 * subir só o zip da APP, por exemplo). p_limite = limite do município (IBGE).
 */
create or replace function fn_car_importacao_concluir(p_importacao uuid, p_limite jsonb default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  imp car_importacoes;
  temas_novos text[];
  gravados integer;
  novo_status text;
  lim geometry;
begin
  select * into imp from car_importacoes where id = p_importacao for update;
  if not found then raise exception 'Importação não encontrada.'; end if;
  if imp.status <> 'enviando' then raise exception 'Esta importação já foi encerrada (%).', imp.status; end if;

  select array_agg(distinct tema), count(*) into temas_novos, gravados
  from car_temas where importacao_id = p_importacao;

  if coalesce(gravados, 0) = 0 then
    update car_importacoes set status = 'falhou', concluido_em = now() where id = p_importacao;
    return jsonb_build_object('status', 'falhou', 'gravados', 0, 'temas', '[]'::jsonb);
  end if;

  update car_temas set vigente = false
  where cod_ibge = imp.cod_ibge and vigente and tema = any (temas_novos) and importacao_id <> p_importacao;
  update car_temas set vigente = true where importacao_id = p_importacao;

  novo_status := case when imp.falhas_total > 0 then 'com_falhas' else 'concluida' end;
  update car_importacoes set status = novo_status, concluido_em = now() where id = p_importacao;

  if p_limite is not null then
    begin
      lim := st_multi(st_collectionextract(st_makevalid(st_setsrid(st_geomfromgeojson(p_limite::text), 4326)), 3));
    exception when others then lim := null;
    end;
  end if;

  insert into car_cobertura (cod_ibge, municipio, uf, limite, data_base, importado_em, ultima_importacao, temas, feicoes, atualizado_em)
  select imp.cod_ibge, imp.municipio, imp.uf, lim, imp.data_base, now(), p_importacao,
         coalesce((select array_agg(distinct tema order by tema) from car_temas where cod_ibge = imp.cod_ibge and vigente), '{}'),
         (select count(*) from car_temas where cod_ibge = imp.cod_ibge and vigente),
         now()
  on conflict (cod_ibge) do update set
    municipio = excluded.municipio, uf = excluded.uf,
    limite = coalesce(excluded.limite, car_cobertura.limite),
    data_base = excluded.data_base, importado_em = excluded.importado_em,
    ultima_importacao = excluded.ultima_importacao, temas = excluded.temas,
    feicoes = excluded.feicoes, atualizado_em = now();

  return jsonb_build_object('status', novo_status, 'gravados', gravados, 'temas', to_jsonb(temas_novos));
end $$;

/** Descarta uma importação que não foi concluída (envio interrompido, arquivo errado). */
create or replace function fn_car_importacao_descartar(p_importacao uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from car_importacoes where id = p_importacao and status in ('concluida', 'com_falhas')) then
    raise exception 'Importação concluída não se descarta: ela é o histórico do município. Suba um arquivo novo para substituir.';
  end if;
  delete from car_temas where importacao_id = p_importacao;
  update car_importacoes set status = 'descartada', concluido_em = coalesce(concluido_em, now()) where id = p_importacao;
end $$;

-- ---------------------------------------------------------------------------
-- Leitura
-- ---------------------------------------------------------------------------

/** Resumo da cobertura por UF (o painel junta com a lista de municípios do IBGE). */
create or replace function fn_car_cobertura_resumo() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'municipios', (select coalesce(jsonb_agg(jsonb_build_object(
        'cod_ibge', c.cod_ibge, 'municipio', c.municipio, 'uf', c.uf, 'data_base', c.data_base,
        'importado_em', c.importado_em, 'temas', c.temas, 'feicoes', c.feicoes,
        'ultima_importacao', c.ultima_importacao,
        'status_ultima', (select i.status from car_importacoes i where i.id = c.ultima_importacao)
      ) order by c.uf, c.municipio), '[]'::jsonb) from car_cobertura c),
    'falhas_abertas', (select count(*) from car_importacoes where status in ('com_falhas', 'falhou')
                        and criado_em > now() - interval '30 days'),
    'enviando', (select count(*) from car_importacoes where status = 'enviando')
  )
$$;

/**
 * Camadas ambientais vigentes num envelope: área de cada tema dentro dele,
 * quantos imóveis declaram, e que parte do envelope tem município importado.
 * Usado pela fonte `car_ambiental` do relatório.
 */
create or replace function fn_car_ambiental_envelope(p_xmin float8, p_ymin float8, p_xmax float8, p_ymax float8)
returns jsonb language sql stable security definer set search_path = public as $$
  with env as (select st_makeenvelope(p_xmin, p_ymin, p_xmax, p_ymax, 4326) as g),
  cob as (
    select c.* from car_cobertura c, env where c.limite is not null and st_intersects(c.limite, env.g)
  ),
  t as (
    select ct.tema, count(*) as poligonos, count(distinct ct.cod_imovel) as imoveis,
           round(sum(st_area(st_intersection(ct.geom, env.g)::geography) / 10000)::numeric, 2) as area_ha
    from car_temas ct, env
    where ct.vigente and st_intersects(ct.geom, env.g)
    group by ct.tema
  )
  select jsonb_build_object(
    'cobertura_pct', (
      select round(coalesce(100 * st_area(st_intersection(st_union(cob.limite), env.g)::geography)
                                 / nullif(st_area(env.g::geography), 0), 0)::numeric, 1)
      from cob, env group by env.g
    ),
    'municipios', (select coalesce(jsonb_agg(jsonb_build_object('municipio', municipio, 'uf', uf, 'data_base', data_base,
                     'temas', temas) order by municipio), '[]'::jsonb) from cob),
    'temas', (select coalesce(jsonb_agg(jsonb_build_object('tema', tema, 'poligonos', poligonos, 'imoveis', imoveis,
                'area_ha', area_ha) order by tema), '[]'::jsonb) from t)
  )
$$;

/** Camadas ambientais declaradas de um imóvel do CAR (cartão e relatório). */
create or replace function fn_car_ambiental_imovel(p_cod text) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('tema', tema, 'poligonos', n, 'area_ha', area_ha,
    'area_declarada_ha', area_decl, 'data_base', data_base) order by tema), '[]'::jsonb)
  from (
    select ct.tema, count(*) as n, round(sum(ct.area_ha), 2) as area_ha,
           round(sum(ct.area_declarada_ha), 2) as area_decl, max(i.data_base) as data_base
    from car_temas ct join car_importacoes i on i.id = ct.importacao_id
    where ct.vigente and ct.cod_imovel = p_cod
    group by ct.tema
  ) x
$$;

revoke execute on function fn_car_importacao_lote(uuid, text, integer, jsonb) from public, anon, authenticated;
revoke execute on function fn_car_importacao_concluir(uuid, jsonb) from public, anon, authenticated;
revoke execute on function fn_car_importacao_descartar(uuid) from public, anon, authenticated;
revoke execute on function fn_car_cobertura_resumo() from public, anon, authenticated;
revoke execute on function fn_car_ambiental_envelope(float8, float8, float8, float8) from public, anon, authenticated;
revoke execute on function fn_car_ambiental_imovel(text) from public, anon, authenticated;
grant execute on function fn_car_importacao_lote(uuid, text, integer, jsonb) to service_role;
grant execute on function fn_car_importacao_concluir(uuid, jsonb) to service_role;
grant execute on function fn_car_importacao_descartar(uuid) to service_role;
grant execute on function fn_car_cobertura_resumo() to service_role;
grant execute on function fn_car_ambiental_envelope(float8, float8, float8, float8) to service_role;
grant execute on function fn_car_ambiental_imovel(text) to service_role;

-- ---------------------------------------------------------------------------
-- Fonte do relatório: deixa de ser "depende de importação" e passa a ler o banco
-- ---------------------------------------------------------------------------

update fontes_externas set
  ativa = true,
  mecanismo = 'importacao_manual',
  observacao = 'Importação manual do arquivo do SICAR por município (Central › CAR: importação e cobertura). '
    || 'O relatório mostra só os municípios já importados, com a data da base; o resto aparece como "ainda não importado".',
  ficha = ficha || jsonb_build_object(
    'acesso', 'download do shapefile por município na base de downloads do SICAR (com CAPTCHA, feito pela equipe) e importação na Central',
    'cache', 'polígonos no banco (car_temas), versão vigente por município e tema; versões anteriores guardadas',
    'consulta_por_geometria', 'sim, no banco (envelope)'
  )
where id = 'car_ambiental';
