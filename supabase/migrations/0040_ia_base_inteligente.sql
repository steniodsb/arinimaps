-- Arini Imóveis Brasil — migration 0040: base que fica "mais inteligente" com o uso.
--
-- docs/INFRA-NACIONAL.md §4. O modelo não aprende entre conversas: quem acumula
-- conhecimento é o banco, e o assistente consulta o banco a cada pergunta.
-- Três camadas, SEM embeddings por enquanto (não há chave de serviço de
-- embeddings) — busca textual do Postgres em português, sem acento:
--
--  1. ia_consultas_resumo — cada consulta territorial já feita (consultas_area
--     por CAR/lote e consultas_rurais por imóvel) vira UM resumo pesquisável:
--     município, CAR, ocorrências por fonte e a data de cada dado. Mantido por
--     gatilho; nunca guarda quem consultou (isso fica só em consultas_area_log).
--  2. ia_mercado_municipio — preço por hectare (rural) e por m² (urbano) por
--     município e tipo, a partir dos anúncios publicados e das vendas
--     registradas. Só agregados; grupo com menos de 3 não mostra número (um
--     imóvel sozinho seria identificável). Recalculado toda noite pelo worker
--     (job `inteligencia_mercado`), não por pg_cron: é assim que o projeto já
--     agenda as rotinas (descarte_retencao, verificar_fontes).
--  3. ia_lacunas — perguntas que o assistente não soube responder, agrupadas
--     pela forma normalizada, para a Matriz responder na base de conhecimento.
--     O texto chega já sem CPF/telefone/e-mail (limpeza no servidor, em
--     src/lib/ia/ferramentas.ts) e sem vínculo com conversa ou conta.
--
-- Tudo idempotente. Tabelas com RLS ligada e SEM policy: só o servidor
-- (service role) lê e grava. Funções novas fechadas a anon/authenticated.

-- ---------------------------------------------------------------- texto sem acento
-- unaccent fica no schema `extensions` (padrão do Supabase). O invólucro é
-- IMMUTABLE com o dicionário qualificado — exigência para usar em coluna
-- gerada e em índice (a função da extensão é só STABLE).
create extension if not exists unaccent with schema extensions;

create or replace function fn_sem_acento(p text) returns text
language sql immutable parallel safe strict set search_path = '' as $$
  select lower(extensions.unaccent('extensions.unaccent'::regdictionary, p))
$$;

-- Palavras com que as pessoas perguntam por cada fonte ("tem embargo?", "tem
-- mineração?"). O nome oficial ("Processos minerários") nem sempre casa com o
-- radical da pergunta; estas palavras entram no texto indexado do resumo.
create or replace function fn_fonte_palavras(p_fonte text) returns text
language sql immutable parallel safe as $$
  select case p_fonte
    when 'anm' then 'mineração minerário minério garimpo lavra ANM SIGMINE'
    when 'funai' then 'terra indígena indígenas aldeia FUNAI'
    when 'ibama_embargos' then 'embargo embargos embargada embargado IBAMA autuação'
    when 'inpe_queimadas' then 'queimada queimadas fogo foco focos calor incêndio'
    when 'prodes_cerrado' then 'desmatamento desmate supressão vegetação PRODES'
    when 'deter_cerrado' then 'desmatamento desmate alerta DETER'
    when 'sigef' then 'SIGEF certificação certificada georreferenciamento parcela INCRA sobreposição'
    when 'snci' then 'SNCI certificação certificado INCRA sobreposição'
    when 'car' then 'CAR cadastro ambiental sobreposição'
    when 'ucs' then 'unidade de conservação parque reserva área protegida'
    when 'hidrografia' then 'água represa rio córrego lago hidrografia'
    when 'ana' then 'água rio córrego curso ANA'
    when 'aneel' then 'energia linha de transmissão usina subestação ANEEL'
    when 'quilombolas' then 'quilombola quilombo território'
    when 'iphan' then 'patrimônio sítio arqueológico IPHAN'
    when 'dnit' then 'rodovia estrada BR DNIT acesso'
    else '' end
$$;

-- ---------------------------------------------------------------- 1. resumos das consultas
create table if not exists ia_consultas_resumo (
  chave text primary key,                 -- 'car:<cod>' | 'lote:<uuid>' | 'imovel:<uuid>'
  origem text not null check (origem in ('car', 'lote', 'imovel')),
  property_id uuid references properties(id) on delete cascade,
  imovel_codigo text,
  codigo_car text,
  rotulo text not null,
  municipio text,
  uf text,
  codigo_ibge text,
  link text,
  -- [{ fonte_id, fonte, orgao, situacao: ha_registros|nada_encontrado|indisponivel,
  --    quantidade, itens: [texto], raio_m, consultado_em }]
  ocorrencias jsonb not null default '[]'::jsonb,
  fontes_com_registro text[] not null default '{}',
  fontes_consultadas integer not null default 0,
  fontes_indisponiveis integer not null default 0,
  dado_mais_antigo timestamptz,
  dado_mais_recente timestamptz,
  texto_busca text not null default '',
  busca tsvector generated always as (to_tsvector('portuguese', fn_sem_acento(texto_busca))) stored,
  atualizado_em timestamptz not null default now()
);
create index if not exists ix_ia_consultas_resumo_busca on ia_consultas_resumo using gin (busca);
create index if not exists ix_ia_consultas_resumo_municipio on ia_consultas_resumo (fn_sem_acento(municipio), uf);
create index if not exists ix_ia_consultas_resumo_car on ia_consultas_resumo (codigo_car);
alter table ia_consultas_resumo enable row level security;

-- Refaz o resumo de UMA chave a partir das linhas de consulta (uma por fonte;
-- havendo mais de um raio, vale a consulta mais recente). Sem linhas, o resumo
-- some. Geometria desenhada à mão (geo:<sha1>) não entra: não tem município nem
-- código para alguém procurar, e é a área que uma pessoa estava estudando.
create or replace function fn_ia_resumo_consulta_atualizar(p_chave text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_origem text := split_part(p_chave, ':', 1);
  v_id text := substr(p_chave, length(split_part(p_chave, ':', 1)) + 2);
  v_prop uuid;
  v_codigo text; v_titulo text; v_car text;
  v_mun text; v_uf text; v_ibge text;
  v_rotulo text; v_link text;
  v_oc jsonb; v_com text[]; v_n int; v_indisp int; v_min timestamptz; v_max timestamptz; v_texto text;
begin
  if v_origem not in ('car', 'lote', 'imovel') or coalesce(v_id, '') = '' then return; end if;

  if v_origem in ('imovel', 'lote') and v_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return; end if;
  if v_origem = 'imovel' then v_prop := v_id::uuid; end if;

  -- onde fica e como se chama
  if v_origem = 'car' then
    v_car := upper(v_id);
    select c.municipio, c.uf, c.cod_ibge::text into v_mun, v_uf, v_ibge from car_imoveis c where c.cod_imovel = v_id limit 1;
    if v_mun is null then
      select m.nome, m.uf, m.codigo_ibge into v_mun, v_uf, v_ibge
        from municipalities m where m.codigo_ibge = split_part(v_id, '-', 2) limit 1;
    end if;
    v_rotulo := 'Área do CAR ' || v_car;
    v_link := '/consulta/car/' || v_id;
  elsif v_origem = 'lote' then
    select m.nome, m.uf, m.codigo_ibge,
           'Lote urbano' || coalesce(' ' || l.numero::text, '') || coalesce(' da quadra ' || l.quadra::text, '')
      into v_mun, v_uf, v_ibge, v_rotulo
      from urban_lots l left join municipalities m on m.id = l.municipality_id
     where l.id = v_id::uuid;
    v_rotulo := coalesce(v_rotulo, 'Lote urbano');
    v_link := '/consulta/lote/' || v_id;
  else
    select p.codigo, p.titulo, p.car_codigo, m.nome, m.uf, m.codigo_ibge
      into v_codigo, v_titulo, v_car, v_mun, v_uf, v_ibge
      from properties p left join municipalities m on m.id = p.municipality_id
     where p.id = v_prop;
    if v_codigo is null then delete from ia_consultas_resumo where chave = p_chave; return; end if;
    v_rotulo := v_codigo || ' — ' || coalesce(v_titulo, '');
    v_link := '/imovel/' || v_codigo;
  end if;

  with linhas as (
    (select distinct on (c.fonte_id) c.fonte_id, c.raio_m, c.resultado, c.quantidade, c.incide, c.erro, c.consultado_em
       from consultas_rurais c where v_origem = 'imovel' and c.property_id = v_prop
      order by c.fonte_id, c.consultado_em desc)
    union all
    (select distinct on (c.fonte_id) c.fonte_id, c.raio_m, c.resultado, c.quantidade, c.incide, c.erro, c.consultado_em
       from consultas_area c where v_origem <> 'imovel' and c.chave = p_chave
      order by c.fonte_id, c.consultado_em desc)
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'fonte_id', l.fonte_id,
      'fonte', coalesce(f.nome, l.fonte_id),
      'orgao', f.orgao,
      'situacao', case when l.erro is not null then 'indisponivel' when l.incide then 'ha_registros' else 'nada_encontrado' end,
      'quantidade', l.quantidade,
      'itens', coalesce((
        select jsonb_agg(concat_ws(' — ', nullif(i ->> 'titulo', ''), nullif(i ->> 'detalhe', '')))
          from (select i from jsonb_array_elements(case when jsonb_typeof(l.resultado -> 'itens') = 'array'
                                                        then l.resultado -> 'itens' else '[]'::jsonb end) i limit 5) x
      ), '[]'::jsonb),
      'raio_m', l.raio_m,
      'consultado_em', l.consultado_em
    ) order by (l.erro is null and l.incide) desc, f.prioridade nulls last, l.fonte_id), '[]'::jsonb),
    coalesce(array_agg(l.fonte_id order by l.fonte_id) filter (where l.erro is null and l.incide), '{}'),
    count(*),
    count(*) filter (where l.erro is not null),
    min(l.consultado_em), max(l.consultado_em),
    -- texto indexado: onde fica + o que FOI encontrado (fonte sem registro não
    -- entra, senão "tem embargo?" casaria com toda área consultada)
    concat_ws(' ', v_rotulo, v_mun, v_uf, v_car, v_codigo, v_titulo,
      string_agg(case when l.erro is null and l.incide then
        concat_ws(' ', f.nome, f.orgao, fn_fonte_palavras(l.fonte_id),
          (select string_agg(i ->> 'titulo', ' ')
             from jsonb_array_elements(case when jsonb_typeof(l.resultado -> 'itens') = 'array'
                                            then l.resultado -> 'itens' else '[]'::jsonb end) i))
      end, ' '))
    into v_oc, v_com, v_n, v_indisp, v_min, v_max, v_texto
    from linhas l left join fontes_externas f on f.id = l.fonte_id;

  if v_n = 0 then
    delete from ia_consultas_resumo where chave = p_chave;
    return;
  end if;

  insert into ia_consultas_resumo as r (
    chave, origem, property_id, imovel_codigo, codigo_car, rotulo, municipio, uf, codigo_ibge, link,
    ocorrencias, fontes_com_registro, fontes_consultadas, fontes_indisponiveis,
    dado_mais_antigo, dado_mais_recente, texto_busca, atualizado_em
  ) values (
    p_chave, v_origem, v_prop, v_codigo, v_car, v_rotulo, v_mun, v_uf, v_ibge, v_link,
    v_oc, v_com, v_n, v_indisp, v_min, v_max, coalesce(v_texto, ''), now()
  )
  on conflict (chave) do update set
    property_id = excluded.property_id, imovel_codigo = excluded.imovel_codigo, codigo_car = excluded.codigo_car,
    rotulo = excluded.rotulo, municipio = excluded.municipio, uf = excluded.uf, codigo_ibge = excluded.codigo_ibge,
    link = excluded.link, ocorrencias = excluded.ocorrencias, fontes_com_registro = excluded.fontes_com_registro,
    fontes_consultadas = excluded.fontes_consultadas, fontes_indisponiveis = excluded.fontes_indisponiveis,
    dado_mais_antigo = excluded.dado_mais_antigo, dado_mais_recente = excluded.dado_mais_recente,
    texto_busca = excluded.texto_busca, atualizado_em = now();
end $$;

-- Reconstrói todos os resumos (carga inicial e conserto). Devolve quantos ficaram.
create or replace function fn_ia_resumos_consultas_reconstruir() returns integer
language plpgsql security definer set search_path = public as $$
declare v_chave text;
begin
  delete from ia_consultas_resumo;
  for v_chave in
    select distinct chave from consultas_area where chave like 'car:%' or chave like 'lote:%'
    union
    select distinct 'imovel:' || property_id::text from consultas_rurais
  loop
    perform fn_ia_resumo_consulta_atualizar(v_chave);
  end loop;
  return (select count(*) from ia_consultas_resumo);
end $$;

-- Gatilhos: cada gravação de consulta refaz o resumo daquela área. Falha aqui
-- NUNCA derruba a consulta (que é paga/limitada para quem pediu): vira aviso
-- no log e a reconstrução acima conserta depois.
create or replace function fn_ia_resumo_gatilho_area() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    if tg_op = 'DELETE' or (tg_op = 'UPDATE' and new.chave is distinct from old.chave) then
      perform fn_ia_resumo_consulta_atualizar(old.chave);
    end if;
    if tg_op <> 'DELETE' then
      perform fn_ia_resumo_consulta_atualizar(new.chave);
    end if;
  exception when others then
    raise warning 'resumo de consulta (%): %', coalesce(new.chave, old.chave), sqlerrm;
  end;
  return null;
end $$;

create or replace function fn_ia_resumo_gatilho_rural() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    if tg_op = 'DELETE' or (tg_op = 'UPDATE' and new.property_id is distinct from old.property_id) then
      perform fn_ia_resumo_consulta_atualizar('imovel:' || old.property_id::text);
    end if;
    if tg_op <> 'DELETE' then
      perform fn_ia_resumo_consulta_atualizar('imovel:' || new.property_id::text);
    end if;
  exception when others then
    raise warning 'resumo de consulta rural: %', sqlerrm;
  end;
  return null;
end $$;

drop trigger if exists tg_ia_resumo_area on consultas_area;
create trigger tg_ia_resumo_area after insert or update or delete on consultas_area
  for each row execute function fn_ia_resumo_gatilho_area();
drop trigger if exists tg_ia_resumo_rural on consultas_rurais;
create trigger tg_ia_resumo_rural after insert or update or delete on consultas_rurais
  for each row execute function fn_ia_resumo_gatilho_rural();

-- Busca dos resumos (ferramenta `buscar_consultas_anteriores`). Filtros
-- combináveis: município (sem acento, começo do nome), UF, código do CAR
-- (exato ou começo, mín. 10 caracteres) e termo livre. O termo tenta primeiro
-- todas as palavras; sem resultado, aceita qualquer uma (como fn_kb_buscar).
-- Resumo de imóvel só aparece enquanto o anúncio está na vitrine pública
-- (mesmos status de STATUS_VITRINE em src/lib/imovel/vitrine.ts).
create or replace function fn_ia_buscar_consultas(
  p_municipio text default null, p_uf text default null, p_car text default null,
  p_termo text default null, p_limite integer default 5
)
returns table (
  chave text, origem text, rotulo text, imovel_codigo text, codigo_car text, municipio text, uf text, link text,
  ocorrencias jsonb, fontes_com_registro text[], fontes_consultadas integer, fontes_indisponiveis integer,
  dado_mais_antigo timestamptz, dado_mais_recente timestamptz, total bigint
)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_mun text := nullif(fn_sem_acento(trim(coalesce(p_municipio, ''))), '');
  v_uf text := nullif(upper(trim(coalesce(p_uf, ''))), '');
  v_car text := nullif(upper(regexp_replace(coalesce(p_car, ''), '[\s.]', '', 'g')), '');
  v_termo text := nullif(trim(coalesce(p_termo, '')), '');
  v_q tsquery;
  v_lim integer := greatest(1, least(coalesce(p_limite, 5), 10));
begin
  if v_mun is null and v_car is null and v_termo is null and v_uf is null then return; end if;
  if v_car is not null and length(v_car) < 10 then v_car := null; end if;

  if v_termo is not null then
    v_q := websearch_to_tsquery('portuguese', fn_sem_acento(v_termo));
    if numnode(v_q) = 0 then
      v_q := null;
    elsif not exists (
      select 1 from ia_consultas_resumo r
       where r.busca @@ v_q
         and (v_mun is null or fn_sem_acento(r.municipio) like v_mun || '%')
         and (v_uf is null or r.uf = v_uf)
         and (v_car is null or r.codigo_car like v_car || '%')
    ) then
      select to_tsquery('portuguese', string_agg(quote_literal(w) || ':*', ' | '))
        into v_q
        from (select distinct w from regexp_split_to_table(fn_sem_acento(v_termo), '[^[:alnum:]]+') as w where length(w) >= 3) s;
    end if;
    if v_q is null and v_mun is null and v_car is null and v_uf is null then return; end if;
  end if;

  return query
    with achados as (
      select r.*, case when v_q is null then 0 else ts_rank(r.busca, v_q) end as rank
        from ia_consultas_resumo r
        left join properties p on p.id = r.property_id
       where (r.origem <> 'imovel' or p.status::text in ('publicado', 'em_negociacao', 'vendido'))
         and (v_mun is null or fn_sem_acento(r.municipio) like v_mun || '%')
         and (v_uf is null or r.uf = v_uf)
         and (v_car is null or r.codigo_car like v_car || '%')
         and (v_q is null or r.busca @@ v_q)
    )
    select a.chave, a.origem, a.rotulo, a.imovel_codigo, a.codigo_car, a.municipio, a.uf, a.link,
           a.ocorrencias, a.fontes_com_registro, a.fontes_consultadas, a.fontes_indisponiveis,
           a.dado_mais_antigo, a.dado_mais_recente, count(*) over () as total
      from achados a
     order by a.rank desc, a.dado_mais_recente desc nulls last
     limit v_lim;
end $$;

-- ---------------------------------------------------------------- 2. inteligência de mercado
create table if not exists ia_mercado_municipio (
  municipality_id uuid not null references municipalities(id) on delete cascade,
  tipo text not null check (tipo in ('rural', 'urbano')),
  municipio text not null,
  uf text not null,
  unidade text not null check (unidade in ('ha', 'm2')),   -- R$ por hectare (rural) ou por m² (urbano)
  anuncios integer not null default 0,                      -- publicados/em negociação, venda (sem leilão)
  anuncios_no_calculo integer not null default 0,           -- desses, com valor e área
  preco_mediano numeric, preco_p25 numeric, preco_p75 numeric,
  vendas integer not null default 0,                        -- vendas registradas (sales) com valor e área
  venda_mediana numeric, venda_p25 numeric, venda_p75 numeric,
  vendas_desde date, vendas_ate date,
  calculado_em timestamptz not null default now(),
  primary key (municipality_id, tipo)
);
create index if not exists ix_ia_mercado_nome on ia_mercado_municipio (fn_sem_acento(municipio), uf);
alter table ia_mercado_municipio enable row level security;

-- Recalcula tudo (apaga e regrava numa transação). Área: a medida no mapa e,
-- sem divisa, a declarada (rural em ha, urbano em m² — a unidade do cadastro).
-- Leilão fica fora dos anúncios: lance mínimo não é preço de mercado (mesma
-- regra da pré-avaliação). Grupo com menos de 3 fica SEM número gravado — o
-- mínimo vale aqui, não só na tela, para nenhum leitor do banco ver o preço de
-- um imóvel isolado.
create or replace function fn_recalcular_inteligencia_mercado() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c_minimo constant integer := 3;
  v_agora timestamptz := now();
  v_grupos integer;
begin
  delete from ia_mercado_municipio;

  with base as (
    select p.id, p.municipality_id, p.tipo::text as tipo, p.status::text as status,
           coalesce(p.modalidade, 'venda') as modalidade, p.valor,
           case when p.tipo::text = 'rural'
                then coalesce(nullif(g.area_m2, 0) / 10000.0, nullif(p.area_declarada, 0))
                else coalesce(nullif(g.area_m2, 0), nullif(p.area_declarada, 0)) end as area_unid
      from properties p
      left join property_geometries g on g.property_id = p.id
     where p.municipality_id is not null and p.tipo::text in ('rural', 'urbano')
  ),
  anuncios as (
    select b.municipality_id, b.tipo,
           count(*) as n,
           count(*) filter (where b.valor > 0 and b.area_unid > 0) as n_calc,
           percentile_cont(0.25) within group (order by b.valor / b.area_unid) filter (where b.valor > 0 and b.area_unid > 0) as p25,
           percentile_cont(0.50) within group (order by b.valor / b.area_unid) filter (where b.valor > 0 and b.area_unid > 0) as p50,
           percentile_cont(0.75) within group (order by b.valor / b.area_unid) filter (where b.valor > 0 and b.area_unid > 0) as p75
      from base b
     where b.status in ('publicado', 'em_negociacao') and b.modalidade <> 'leilao'
     group by 1, 2
  ),
  vendas as (
    select b.municipality_id, b.tipo,
           count(*) as n,
           percentile_cont(0.25) within group (order by s.valor_final / b.area_unid) as p25,
           percentile_cont(0.50) within group (order by s.valor_final / b.area_unid) as p50,
           percentile_cont(0.75) within group (order by s.valor_final / b.area_unid) as p75,
           min(coalesce(s.data_venda, s.created_at::date)) as desde,
           max(coalesce(s.data_venda, s.created_at::date)) as ate
      from sales s join base b on b.id = s.property_id
     where s.valor_final > 0 and b.area_unid > 0
     group by 1, 2
  ),
  grupos as (
    select municipality_id, tipo from anuncios union select municipality_id, tipo from vendas
  )
  insert into ia_mercado_municipio (
    municipality_id, tipo, municipio, uf, unidade, anuncios, anuncios_no_calculo,
    preco_mediano, preco_p25, preco_p75, vendas, venda_mediana, venda_p25, venda_p75,
    vendas_desde, vendas_ate, calculado_em
  )
  select gr.municipality_id, gr.tipo, m.nome, m.uf, case when gr.tipo = 'rural' then 'ha' else 'm2' end,
         coalesce(a.n, 0), coalesce(a.n_calc, 0),
         case when a.n_calc >= c_minimo then round(a.p50::numeric, 2) end,
         case when a.n_calc >= c_minimo then round(a.p25::numeric, 2) end,
         case when a.n_calc >= c_minimo then round(a.p75::numeric, 2) end,
         coalesce(v.n, 0),
         case when v.n >= c_minimo then round(v.p50::numeric, 2) end,
         case when v.n >= c_minimo then round(v.p25::numeric, 2) end,
         case when v.n >= c_minimo then round(v.p75::numeric, 2) end,
         case when v.n >= c_minimo then v.desde end,
         case when v.n >= c_minimo then v.ate end,
         v_agora
    from grupos gr
    join municipalities m on m.id = gr.municipality_id
    left join anuncios a on a.municipality_id = gr.municipality_id and a.tipo = gr.tipo
    left join vendas v on v.municipality_id = gr.municipality_id and v.tipo = gr.tipo;

  get diagnostics v_grupos = row_count;
  return jsonb_build_object('grupos', v_grupos, 'calculado_em', v_agora, 'minimo_por_grupo', c_minimo);
end $$;

-- Leitura da ferramenta `inteligencia_mercado`: município sem acento (começo
-- do nome), UF e tipo opcionais.
create or replace function fn_ia_mercado(p_municipio text, p_uf text default null, p_tipo text default null)
returns setof ia_mercado_municipio
language sql stable security definer set search_path = public as $$
  select * from ia_mercado_municipio r
   where fn_sem_acento(r.municipio) like nullif(fn_sem_acento(trim(coalesce(p_municipio, ''))), '') || '%'
     and (nullif(trim(coalesce(p_uf, '')), '') is null or r.uf = upper(trim(p_uf)))
     and (p_tipo is null or r.tipo = p_tipo)
   order by r.municipio, r.uf, r.tipo
   limit 10
$$;

-- ---------------------------------------------------------------- 3. lacunas
create table if not exists ia_lacunas (
  id uuid primary key default gen_random_uuid(),
  pergunta text not null check (length(pergunta) between 3 and 300),
  pergunta_normalizada text not null unique,
  motivo text check (motivo is null or length(motivo) <= 300),
  ocorrencias integer not null default 1,
  primeira_em timestamptz not null default now(),
  ultima_em timestamptz not null default now(),
  status text not null default 'pendente' check (status in ('pendente', 'respondida', 'descartada')),
  artigo_id uuid references kb_artigos(id) on delete set null,
  resolvido_por uuid references auth.users(id) on delete set null,
  resolvido_em timestamptz
);
create index if not exists ix_ia_lacunas_fila on ia_lacunas (status, ocorrencias desc, ultima_em desc);
alter table ia_lacunas enable row level security;

-- Forma usada para agrupar: sem acento, minúscula, só letras e números.
create or replace function fn_ia_lacuna_normalizar(p text) returns text
language sql immutable parallel safe as $$
  select trim(regexp_replace(fn_sem_acento(coalesce(p, '')), '[^a-z0-9]+', ' ', 'g'))
$$;

-- Registra (ou soma) uma pergunta sem resposta. Pergunta que volta depois de
-- "respondida" reabre: o artigo existe, mas a busca não o achou — é sinal
-- para a curadoria. "Descartada" continua descartada (só conta).
create or replace function fn_ia_registrar_lacuna(p_pergunta text, p_motivo text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_pergunta text := left(trim(regexp_replace(coalesce(p_pergunta, ''), '\s+', ' ', 'g')), 300);
  v_norm text := fn_ia_lacuna_normalizar(p_pergunta);
  v_linha ia_lacunas;
begin
  if length(v_pergunta) < 3 or length(v_norm) < 3 then
    return jsonb_build_object('ok', false, 'erro', 'pergunta vazia');
  end if;
  insert into ia_lacunas as l (pergunta, pergunta_normalizada, motivo)
  values (v_pergunta, v_norm, nullif(left(trim(coalesce(p_motivo, '')), 300), ''))
  on conflict (pergunta_normalizada) do update set
    ocorrencias = l.ocorrencias + 1,
    ultima_em = now(),
    motivo = coalesce(excluded.motivo, l.motivo),
    status = case when l.status = 'respondida' then 'pendente' else l.status end
  returning * into v_linha;
  return jsonb_build_object('ok', true, 'id', v_linha.id, 'ocorrencias', v_linha.ocorrencias, 'status', v_linha.status);
end $$;

-- ---------------------------------------------------------------- funções fechadas
revoke execute on function fn_sem_acento(text) from public, anon, authenticated;
revoke execute on function fn_fonte_palavras(text) from public, anon, authenticated;
revoke execute on function fn_ia_resumo_consulta_atualizar(text) from public, anon, authenticated;
revoke execute on function fn_ia_resumos_consultas_reconstruir() from public, anon, authenticated;
revoke execute on function fn_ia_resumo_gatilho_area() from public, anon, authenticated;
revoke execute on function fn_ia_resumo_gatilho_rural() from public, anon, authenticated;
revoke execute on function fn_ia_buscar_consultas(text, text, text, text, integer) from public, anon, authenticated;
revoke execute on function fn_recalcular_inteligencia_mercado() from public, anon, authenticated;
revoke execute on function fn_ia_mercado(text, text, text) from public, anon, authenticated;
revoke execute on function fn_ia_lacuna_normalizar(text) from public, anon, authenticated;
revoke execute on function fn_ia_registrar_lacuna(text, text) from public, anon, authenticated;
grant execute on function fn_ia_buscar_consultas(text, text, text, text, integer) to service_role;
grant execute on function fn_recalcular_inteligencia_mercado() to service_role;
grant execute on function fn_ia_resumos_consultas_reconstruir() to service_role;
grant execute on function fn_ia_mercado(text, text, text) to service_role;
grant execute on function fn_ia_registrar_lacuna(text, text) to service_role;

-- ---------------------------------------------------------------- carga inicial
select fn_ia_resumos_consultas_reconstruir();
select fn_recalcular_inteligencia_mercado();

notify pgrst, 'reload schema';
