-- Arini Maps — migration 0029: rastreabilidade do imóvel, versões da geometria,
-- solicitações cartográficas e alteração de anúncio publicado.
--
-- "Requisitos para desenvolvimento — módulos cartográficos" (Carlos, 05/10/2026):
--   §1 histórico e rastreabilidade (acessos/interações, alterações, versões da
--      geometria, auditoria, origem do dado);
--   §2 cadastro e correção de imóveis não cartografados (protocolo, fila da
--      Matriz, status, regra de que geometria do usuário não é oficial);
--   §5 estrutura mínima: property_events, property_geometry_versions,
--      cartographic_requests, cartographic_request_events, property_data_sources.
-- E do Fluxograma Mestre: §7 decisão "complementar" (pendência de dados) e
-- §9 alteração de imóvel já publicado vira nova versão para análise, mantendo
-- a versão pública anterior no ar.

-- ---------------------------------------------------------------------------
-- §1.1 Acessos e interações. Um evento por ação relevante, sempre ligado ao
-- ID do imóvel. Quem vê o histórico: dono, parceiro responsável e a Matriz.
-- ---------------------------------------------------------------------------
create table if not exists property_events (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties(id) on delete cascade,
  user_id uuid references profiles(user_id) on delete set null,
  partner_id uuid references partners(id) on delete set null,
  tipo text not null check (tipo in (
    'visualizacao', 'ficha', 'tour', 'relatorio', 'camada', 'documento', 'midia',
    'favorito', 'interesse', 'lead', 'consulta', 'compartilhamento', 'revisao'
  )),
  detalhe jsonb not null default '{}',
  ip text,
  created_at timestamptz not null default now()
);
create index if not exists idx_property_events_property on property_events (property_id, created_at desc);
create index if not exists idx_property_events_user on property_events (user_id, created_at desc);
alter table property_events enable row level security;
drop policy if exists p_property_events_read on property_events;
create policy p_property_events_read on property_events for select using (fn_property_editable_id(property_id));
-- escrita só pelo servidor

-- ---------------------------------------------------------------------------
-- §1.3 Versionamento cartográfico. `property_geometries` continua sendo a
-- geometria ATUAL (o mapa lê dali); cada troca da divisa grava uma versão aqui,
-- com origem, motivo e responsável. Nada é apagado.
-- ---------------------------------------------------------------------------
create table if not exists property_geometry_versions (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties(id) on delete cascade,
  versao integer not null,
  geom geometry(Geometry, 4326) not null,
  area_m2 numeric,
  perimeter_m numeric,
  fonte geometry_source not null,
  -- §1.5 origem do dado
  origem text not null default 'geometria_usuario' check (origem in (
    'fonte_oficial', 'proprietario', 'corretor_franquia', 'matriz', 'processamento_arini',
    'estimativa_arini', 'geometria_usuario', 'geometria_validada'
  )),
  motivo text,
  responsavel uuid references profiles(user_id) on delete set null,
  -- §3 regra crítica: até a Matriz validar, é "informada pelo usuário"
  situacao text not null default 'informada' check (situacao in ('informada', 'em_analise', 'validada', 'substituida')),
  validada_por uuid references profiles(user_id) on delete set null,
  validada_em timestamptz,
  created_at timestamptz not null default now(),
  unique (property_id, versao)
);
create index if not exists idx_geometry_versions_property on property_geometry_versions (property_id, versao desc);
alter table property_geometry_versions enable row level security;
drop policy if exists p_geometry_versions_read on property_geometry_versions;
create policy p_geometry_versions_read on property_geometry_versions for select using (fn_property_editable_id(property_id));

-- Toda troca da divisa vira versão nova; a anterior fica como "substituída".
-- Origem/motivo/responsável chegam por set_config (fn_upsert_geometry abaixo);
-- quando a troca vem por outro caminho, a origem é deduzida da fonte.
create or replace function fn_geometry_versao() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v integer;
  quem uuid;
  org text;
  mot text;
begin
  if tg_op = 'UPDATE' and st_equals(old.geom, new.geom) then return new; end if;
  select coalesce(max(versao), 0) + 1 into v from property_geometry_versions where property_id = new.property_id;
  update property_geometry_versions set situacao = 'substituida'
    where property_id = new.property_id and situacao <> 'substituida';
  quem := nullif(current_setting('arini.user_id', true), '')::uuid;
  org := nullif(current_setting('arini.origem', true), '');
  mot := nullif(current_setting('arini.motivo', true), '');
  insert into property_geometry_versions (property_id, versao, geom, area_m2, perimeter_m, fonte, origem, motivo, responsavel)
  values (
    new.property_id, v, new.geom, new.area_m2, new.perimeter_m, new.fonte,
    coalesce(org, case when new.fonte = 'dwg' then 'fonte_oficial' else 'geometria_usuario' end),
    mot, quem
  );
  return new;
end $$;
drop trigger if exists trg_geometry_versao on property_geometries;
create trigger trg_geometry_versao after insert or update of geom on property_geometries
  for each row execute function fn_geometry_versao();

-- fn_upsert_geometry ganha origem, motivo e responsável. A assinatura antiga é
-- removida: com as duas, o PostgREST não saberia qual chamar.
drop function if exists fn_upsert_geometry(uuid, jsonb, geometry_source, text);
create or replace function fn_upsert_geometry(
  p_property_id uuid,
  p_geojson jsonb,
  p_fonte geometry_source,
  p_arquivo text default null,
  p_origem text default null,
  p_motivo text default null,
  p_user_id uuid default null
) returns table (area_m2 numeric, perimeter_m numeric)
language plpgsql security definer set search_path = public as $$
declare g geometry;
begin
  g := st_setsrid(st_geomfromgeojson(p_geojson::text), 4326);
  if not st_isvalid(g) then
    g := st_makevalid(g);
  end if;
  perform set_config('arini.origem', coalesce(p_origem, ''), true);
  perform set_config('arini.motivo', coalesce(p_motivo, ''), true);
  perform set_config('arini.user_id', coalesce(p_user_id::text, ''), true);
  insert into property_geometries (property_id, geom, fonte, arquivo_original_path)
  values (p_property_id, g, p_fonte, p_arquivo)
  on conflict (property_id) do update
    set geom = excluded.geom, fonte = excluded.fonte,
        arquivo_original_path = coalesce(excluded.arquivo_original_path, property_geometries.arquivo_original_path);
  perform set_config('arini.origem', '', true);
  perform set_config('arini.motivo', '', true);
  perform set_config('arini.user_id', '', true);
  return query
    select pg2.area_m2, pg2.perimeter_m from property_geometries pg2 where pg2.property_id = p_property_id;
end $$;

-- Validação pela Matriz: a versão atual passa a "validada" e a origem vira
-- "geometria validada pela Matriz". Só perfil autorizado chama (servidor).
create or replace function fn_validar_geometria(p_property_id uuid, p_user_id uuid, p_motivo text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare vid uuid;
begin
  select id into vid from property_geometry_versions
    where property_id = p_property_id and situacao <> 'substituida'
    order by versao desc limit 1;
  if vid is null then
    raise exception 'Imóvel sem geometria para validar.';
  end if;
  update property_geometry_versions
    set situacao = 'validada', origem = 'geometria_validada', validada_por = p_user_id, validada_em = now(),
        motivo = coalesce(p_motivo, motivo)
    where id = vid;
  insert into property_data_sources (property_id, campo, origem, detalhe, user_id)
    values (p_property_id, 'geometria', 'geometria_validada', 'Divisa conferida e validada pela Matriz', p_user_id);
  return vid;
end $$;

-- ---------------------------------------------------------------------------
-- §1.5 Origem de cada dado relevante do imóvel (uma linha por registro de
-- origem; a mais recente de cada campo é a que vale).
-- ---------------------------------------------------------------------------
create table if not exists property_data_sources (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties(id) on delete cascade,
  campo text not null,     -- geometria | area | valor | cadastro | documentos | consulta_territorial | pois
  origem text not null check (origem in (
    'fonte_oficial', 'proprietario', 'corretor_franquia', 'matriz', 'processamento_arini',
    'estimativa_arini', 'geometria_usuario', 'geometria_validada'
  )),
  detalhe text,
  user_id uuid references profiles(user_id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_data_sources_property on property_data_sources (property_id, created_at desc);
alter table property_data_sources enable row level security;
drop policy if exists p_data_sources_read on property_data_sources;
create policy p_data_sources_read on property_data_sources for select using (fn_property_editable_id(property_id));

-- geometrias que já existem viram a versão 1; as de imóveis já aprovados pela
-- Matriz entram como validadas (passaram pela análise antes desta migration)
insert into property_geometry_versions (property_id, versao, geom, area_m2, perimeter_m, fonte, origem, motivo, situacao, validada_em)
select g.property_id, 1, g.geom, g.area_m2, g.perimeter_m, g.fonte,
       case
         when p.status in ('aprovado', 'publicado', 'em_negociacao', 'vendido', 'historico') then 'geometria_validada'
         when g.fonte = 'dwg' then 'fonte_oficial'
         else 'geometria_usuario'
       end,
       'Versão inicial, registrada a partir do cadastro existente',
       case when p.status in ('aprovado', 'publicado', 'em_negociacao', 'vendido', 'historico') then 'validada' else 'informada' end,
       case when p.status in ('aprovado', 'publicado', 'em_negociacao', 'vendido', 'historico') then coalesce(p.published_at, p.updated_at) end
from property_geometries g join properties p on p.id = g.property_id
where not exists (select 1 from property_geometry_versions v where v.property_id = g.property_id);

insert into property_data_sources (property_id, campo, origem, detalhe)
select p.id, 'cadastro', case when p.partner_id is not null then 'corretor_franquia' else 'proprietario' end,
       'Cadastro informado pelo anunciante'
from properties p
where not exists (select 1 from property_data_sources s where s.property_id = p.id and s.campo = 'cadastro');

-- ---------------------------------------------------------------------------
-- §2 Solicitações cartográficas: "não encontrei meu imóvel no mapa" e
-- "o mapa está divergente". Protocolo próprio, fila do setor de Cartografia,
-- máquina de status no banco. A geometria enviada NÃO vira oficial sozinha.
-- ---------------------------------------------------------------------------
create sequence if not exists cartographic_requests_seq;
create or replace function fn_next_cart_protocolo() returns text language sql as
  $$ select 'CART-' || lpad(nextval('cartographic_requests_seq')::text, 6, '0') $$;

create table if not exists cartographic_requests (
  id uuid primary key default gen_random_uuid(),
  protocolo text not null unique default fn_next_cart_protocolo(),
  user_id uuid not null references profiles(user_id) on delete cascade,
  property_id uuid references properties(id) on delete set null,
  municipality_id uuid references municipalities(id) on delete set null,
  tipo text not null check (tipo in (
    'inclusao', 'correcao_geometria', 'divergencia', 'atualizacao_area', 'desmembramento',
    'unificacao', 'sobreposicao', 'erro_localizacao', 'outro'
  )),
  descricao text not null default '',
  ponto geometry(Point, 4326),
  geom geometry(Geometry, 4326),
  area_m2 numeric,
  arquivos jsonb not null default '[]',     -- [{nome, path, tipo, bytes}] no bucket privado `docs`
  referencia text,                          -- código do CAR ou id do lote clicado, quando houver
  status text not null default 'recebida' check (status in (
    'recebida', 'em_triagem', 'em_analise', 'aguardando_documentacao', 'em_vetorizacao',
    'em_revisao', 'aprovada', 'publicada', 'rejeitada', 'cancelada'
  )),
  responsavel uuid references profiles(user_id) on delete set null,
  resposta text,                            -- devolutiva visível ao solicitante
  geometria_versao_id uuid references property_geometry_versions(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists trg_cart_requests_touch on cartographic_requests;
create trigger trg_cart_requests_touch before update on cartographic_requests for each row execute function fn_touch_updated_at();
create index if not exists idx_cart_requests_status on cartographic_requests (status, created_at desc);
create index if not exists idx_cart_requests_user on cartographic_requests (user_id, created_at desc);
create index if not exists idx_cart_requests_geom on cartographic_requests using gist (geom);
alter table cartographic_requests enable row level security;
drop policy if exists p_cart_requests_proprio on cartographic_requests;
create policy p_cart_requests_proprio on cartographic_requests for select using (user_id = auth.uid());

create table if not exists cartographic_request_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references cartographic_requests(id) on delete cascade,
  user_id uuid references profiles(user_id) on delete set null,
  de_status text,
  para_status text,
  mensagem text,
  interno boolean not null default false,   -- nota da equipe, invisível ao solicitante
  created_at timestamptz not null default now()
);
create index if not exists idx_cart_events_request on cartographic_request_events (request_id, created_at);
alter table cartographic_request_events enable row level security;
drop policy if exists p_cart_events_proprio on cartographic_request_events;
create policy p_cart_events_proprio on cartographic_request_events for select using (
  not interno and exists (select 1 from cartographic_requests r where r.id = request_id and r.user_id = auth.uid())
);

-- §2.5/2.6 fluxo e status
create or replace function fn_cart_request_transition() returns trigger language plpgsql as $$
declare ok boolean := false;
begin
  if old.status = new.status then return new; end if;
  ok := case old.status
    when 'recebida'                then new.status in ('em_triagem', 'rejeitada', 'cancelada')
    when 'em_triagem'              then new.status in ('em_analise', 'aguardando_documentacao', 'rejeitada', 'cancelada')
    when 'em_analise'              then new.status in ('aguardando_documentacao', 'em_vetorizacao', 'em_revisao', 'rejeitada', 'cancelada')
    when 'aguardando_documentacao' then new.status in ('em_analise', 'rejeitada', 'cancelada')
    when 'em_vetorizacao'          then new.status in ('em_revisao', 'em_analise')
    when 'em_revisao'              then new.status in ('aprovada', 'em_vetorizacao', 'rejeitada')
    when 'aprovada'                then new.status in ('publicada', 'em_revisao')
    when 'rejeitada'               then new.status in ('em_triagem')
    else false end;
  if not ok then
    raise exception 'Transição de status inválida na solicitação cartográfica: % → %', old.status, new.status;
  end if;
  return new;
end $$;
drop trigger if exists trg_cart_request_transition on cartographic_requests;
create trigger trg_cart_request_transition before update of status on cartographic_requests
  for each row execute function fn_cart_request_transition();

/** Muda o status e registra o evento numa transação só (chamada pelo servidor). */
create or replace function fn_cart_request_transicao(
  p_id uuid, p_status text, p_user_id uuid, p_mensagem text default null, p_interno boolean default false
) returns void language plpgsql security definer set search_path = public as $$
declare antigo text;
begin
  select status into antigo from cartographic_requests where id = p_id for update;
  if antigo is null then raise exception 'Solicitação não encontrada.'; end if;
  update cartographic_requests set status = p_status where id = p_id;
  insert into cartographic_request_events (request_id, user_id, de_status, para_status, mensagem, interno)
    values (p_id, p_user_id, antigo, p_status, p_mensagem, p_interno);
end $$;

-- ---------------------------------------------------------------------------
-- Fluxograma §7: além de "corrigir", a Matriz pode pedir COMPLEMENTO de dados.
-- Mesmo status `correcao`; o tipo da pendência diz o que o anunciante faz.
-- ---------------------------------------------------------------------------
alter table properties add column if not exists pendencia_tipo text;
alter table properties drop constraint if exists chk_properties_pendencia_tipo;
alter table properties add constraint chk_properties_pendencia_tipo check (pendencia_tipo is null or pendencia_tipo in ('correcao', 'complemento'));

-- ---------------------------------------------------------------------------
-- Fluxograma §9: imóvel publicado → parceiro altera → NOVA VERSÃO → Matriz →
-- aprovação → atualiza publicação. A versão pública anterior permanece no ar
-- durante a análise, salvo suspensão pela Matriz. Os campos propostos ficam
-- aqui até a decisão; só então entram em `properties`.
-- ---------------------------------------------------------------------------
create table if not exists property_revisions (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties(id) on delete cascade,
  versao integer not null,
  dados jsonb not null,                     -- {titulo, descricao, valor, area_declarada, condicoes_venda, aceita_permuta, aceita_financiamento}
  dados_anteriores jsonb not null default '{}',
  status text not null default 'pendente' check (status in ('pendente', 'aprovada', 'rejeitada', 'cancelada')),
  motivo text,                              -- da Matriz, ao rejeitar
  created_by uuid references profiles(user_id) on delete set null,
  revisada_por uuid references profiles(user_id) on delete set null,
  revisada_em timestamptz,
  created_at timestamptz not null default now(),
  unique (property_id, versao)
);
create index if not exists idx_property_revisions_status on property_revisions (status, created_at);
create index if not exists idx_property_revisions_property on property_revisions (property_id, versao desc);
alter table property_revisions enable row level security;
drop policy if exists p_property_revisions_read on property_revisions;
create policy p_property_revisions_read on property_revisions for select using (fn_property_editable_id(property_id));

-- fn_property_editable_id já é liberada para anon/authenticated (0026): as
-- policies acima a usam. As funções novas ficam só com o servidor (0026).
