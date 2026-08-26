-- Arini Maps — migration 0001: schema inicial completo
-- PostGIS + identidade + território + imóveis + funil + receita + operação
-- Conforme ARQUITETURA.md v1.1 (§4)

create extension if not exists postgis;
create extension if not exists pgcrypto;

-- ============================================================
-- ENUMS
-- ============================================================
create type user_role as enum (
  'admin_central','analista_arini','imobiliaria','corretor','engenheiro','proprietario','comprador'
);
create type property_type as enum ('urbano','rural');
create type property_status as enum (
  'rascunho','pendente','em_analise','correcao','aprovado','publicado',
  'em_negociacao','vendido','historico','suspenso','inativo','reprovado'
);
create type partner_type as enum ('imobiliaria','corretor','engenheiro');
create type approval_status as enum (
  'solicitado','em_analise','aprovado','pendente','reprovado','ativo','suspenso','inativo'
);
create type geometry_source as enum ('kml','kmz','desenho','ponto','dwg');
create type media_type as enum ('foto','video');
create type presentation_type as enum ('tour3d','video');
create type processing_status as enum ('pendente','processando','pronto','erro');
create type lead_status as enum ('novo','em_oportunidade','descartado');
create type opportunity_stage as enum (
  'novo_lead','primeiro_contato','qualificacao','em_atendimento','visita_agendada','visitou',
  'proposta_enviada','contraproposta','negociacao','aceite','contrato','fechado','pos_venda','perdido'
);
create type responsible_type as enum ('arini','parceiro','proprietario');
create type visit_status as enum ('agendada','realizada','remarcada','nao_compareceu');
create type proposal_side as enum ('comprador','vendedor');
create type proposal_status as enum ('enviada','aceita','contraproposta','recusada');
create type contract_status as enum ('em_elaboracao','assinado','registrado');
create type commission_status as enum ('registrada','cobrada','paga','conciliada');
create type subscription_status as enum ('ativa','pendente','inadimplente','isenta','cancelada');
create type invoice_status as enum ('aberta','paga','vencida');
create type job_status as enum ('pendente','processando','concluido','erro');

-- ============================================================
-- HELPERS
-- ============================================================
create or replace function fn_touch_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ============================================================
-- IDENTIDADE
-- ============================================================
create table profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role user_role not null default 'comprador',
  nome text not null default '',
  cpf_cnpj text,
  telefone text,
  avatar_url text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_profiles_touch before update on profiles for each row execute function fn_touch_updated_at();

-- cria profile automaticamente no signup (padrão do CRM)
create or replace function fn_handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (user_id, nome, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'nome',''),
          coalesce((new.raw_user_meta_data->>'role')::user_role, 'comprador'))
  on conflict (user_id) do nothing;
  return new;
end $$;
create trigger trg_on_auth_user_created after insert on auth.users
  for each row execute function fn_handle_new_user();

create or replace function fn_role() returns user_role language sql stable security definer
  set search_path = public as
  $$ select role from profiles where user_id = auth.uid() $$;

create or replace function fn_is_arini() returns boolean language sql stable security definer
  set search_path = public as
  $$ select fn_role() in ('admin_central','analista_arini') $$;

create table partners (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(user_id) on delete cascade,
  tipo partner_type not null,
  razao_social text,
  registro_profissional text,           -- CRECI / CREA
  cidade_base text,
  status approval_status not null default 'solicitado',
  motivo_pendencia text,
  aceite_termos_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_partners_touch before update on partners for each row execute function fn_touch_updated_at();

create table partner_documents (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references partners(id) on delete cascade,
  tipo text not null,
  storage_path text not null,
  verificado boolean not null default false,
  created_at timestamptz not null default now()
);

create table owners (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(user_id) on delete cascade,
  status approval_status not null default 'solicitado',
  motivo_pendencia text,
  aceite_termos_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_owners_touch before update on owners for each row execute function fn_touch_updated_at();

-- ============================================================
-- TERRITÓRIO
-- ============================================================
create table regions (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  ativa boolean not null default true,
  created_at timestamptz not null default now()
);

create table municipalities (
  id uuid primary key default gen_random_uuid(),
  region_id uuid not null references regions(id),
  nome text not null,
  uf text not null,
  codigo_ibge text unique,
  geom geometry(MultiPolygon,4326),
  sede geometry(Point,4326),
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);
create index idx_municipalities_geom on municipalities using gist (geom);

create table cartography_layers (
  id uuid primary key default gen_random_uuid(),
  municipality_id uuid not null references municipalities(id),
  nome text not null,
  tipo text not null default 'raster' check (tipo in ('raster','vector')),
  source_path text,
  tiles_path text,
  bounds geometry(Polygon,4326),
  min_zoom int not null default 12,
  max_zoom int not null default 19,
  opacidade_padrao numeric not null default 0.8,
  status processing_status not null default 'pendente',
  erro text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_carto_touch before update on cartography_layers for each row execute function fn_touch_updated_at();

-- ============================================================
-- IMÓVEIS
-- ============================================================
create sequence property_codigo_seq;
create or replace function fn_next_property_codigo() returns text language sql as
  $$ select 'ARINI-MAP-' || lpad(nextval('property_codigo_seq')::text, 6, '0') $$;

create table properties (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique default fn_next_property_codigo(),
  tipo property_type not null,
  owner_id uuid references owners(id),
  partner_id uuid references partners(id),
  municipality_id uuid references municipalities(id),
  titulo text not null default '',
  descricao text not null default '',
  valor numeric(14,2),
  area_declarada numeric(14,2),          -- m² (urbano) ou hectares (rural) — unidade em caracteristicas
  caracteristicas jsonb not null default '{}',
  condicoes_venda text,
  aceita_permuta boolean not null default false,
  aceita_financiamento boolean not null default false,
  exclusividade boolean not null default false,
  status property_status not null default 'rascunho',
  motivo_correcao text,
  published_at timestamptz,
  sold_at timestamptz,
  created_by uuid references profiles(user_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_property_responsavel check (owner_id is not null or partner_id is not null)
);
create trigger trg_properties_touch before update on properties for each row execute function fn_touch_updated_at();
create index idx_properties_status on properties (status);
create index idx_properties_municipality on properties (municipality_id);

-- máquina de estados: transição inválida é erro de banco
create or replace function fn_property_transition() returns trigger language plpgsql as $$
declare ok boolean := false;
begin
  if old.status = new.status then return new; end if;
  ok := case old.status
    when 'rascunho'       then new.status in ('pendente','inativo')
    when 'pendente'       then new.status in ('em_analise','inativo')
    when 'em_analise'     then new.status in ('correcao','aprovado','reprovado','pendente','inativo')
    when 'correcao'       then new.status in ('em_analise','inativo')
    when 'aprovado'       then new.status in ('publicado','suspenso','inativo')
    when 'publicado'      then new.status in ('em_negociacao','suspenso','inativo','vendido')
    when 'em_negociacao'  then new.status in ('publicado','vendido','suspenso','inativo')
    when 'suspenso'       then new.status in ('publicado','inativo')
    when 'vendido'        then new.status in ('historico')
    when 'reprovado'      then new.status in ('rascunho','inativo')
    when 'inativo'        then new.status in ('rascunho')
    when 'historico'      then false
    else false end;
  if not ok then
    raise exception 'Transição de status inválida: % → %', old.status, new.status;
  end if;
  if new.status = 'publicado' and new.published_at is null then new.published_at = now(); end if;
  if new.status = 'vendido' then new.sold_at = now(); end if;
  return new;
end $$;
create trigger trg_property_transition before update of status on properties
  for each row execute function fn_property_transition();

create table property_geometries (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null unique references properties(id) on delete cascade,
  geom geometry(Geometry,4326) not null,
  centroid geometry(Point,4326),
  area_m2 numeric,
  perimeter_m numeric,
  fonte geometry_source not null,
  arquivo_original_path text,
  created_at timestamptz not null default now()
);
create index idx_property_geometries_geom on property_geometries using gist (geom);

-- área/perímetro/centroide calculados sempre no insert/update
create or replace function fn_geometry_metrics() returns trigger language plpgsql as $$
begin
  new.centroid = st_centroid(new.geom);
  if geometrytype(new.geom) in ('POLYGON','MULTIPOLYGON') then
    new.area_m2 = st_area(new.geom::geography);
    new.perimeter_m = st_perimeter(new.geom::geography);
  end if;
  return new;
end $$;
create trigger trg_geometry_metrics before insert or update of geom on property_geometries
  for each row execute function fn_geometry_metrics();

create table property_media (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties(id) on delete cascade,
  tipo media_type not null default 'foto',
  storage_path text not null,
  ordem int not null default 0,
  capa boolean not null default false,
  created_at timestamptz not null default now()
);
create index idx_property_media_property on property_media (property_id);

create table property_documents (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties(id) on delete cascade,
  tipo text not null,                    -- matricula, car, itr, dwg, outro
  storage_path text not null,
  verificado boolean not null default false,
  created_at timestamptz not null default now()
);

create table property_authorizations (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties(id) on delete cascade,
  tipo text not null check (tipo in ('autorizacao','exclusividade')),
  documento_path text,
  validade date,
  aceite_at timestamptz,
  created_at timestamptz not null default now()
);

-- ============================================================
-- DADOS GEO DE APOIO
-- ============================================================
create table pois (
  id uuid primary key default gen_random_uuid(),
  categoria text not null,               -- combustivel|farmacia|supermercado|hospital|escola|centro|acesso_rodovia|outro
  nome text,
  geom geometry(Point,4326) not null,
  municipality_id uuid references municipalities(id),
  fonte text not null default 'osm',
  osm_id text,
  fetched_at timestamptz not null default now()
);
create index idx_pois_geom on pois using gist (geom);
create index idx_pois_categoria on pois (categoria);
create unique index uq_pois_osm on pois (fonte, osm_id) where osm_id is not null;

create table property_pois (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties(id) on delete cascade,
  poi_id uuid not null references pois(id) on delete cascade,
  distancia_m numeric not null,
  distancia_rota_m numeric,
  destaque boolean not null default false,
  unique (property_id, poi_id)
);

create table presentations (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties(id) on delete cascade,
  tipo presentation_type not null,
  params jsonb not null default '{}',
  status processing_status not null default 'pendente',
  output_path text,
  duracao_s int,
  erro text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_presentations_touch before update on presentations for each row execute function fn_touch_updated_at();

-- ============================================================
-- FUNIL COMERCIAL
-- ============================================================
create table leads (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties(id),
  nome text not null,
  telefone text,
  email text,
  mensagem text,
  origem text not null default 'pagina',
  canal text,
  utm jsonb not null default '{}',
  status lead_status not null default 'novo',
  consentimento_lgpd boolean not null default false,
  created_at timestamptz not null default now()
);
create index idx_leads_property on leads (property_id);

create sequence opportunity_codigo_seq;
create table opportunities (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique default ('OP-' || lpad(nextval('opportunity_codigo_seq')::text, 6, '0')),
  lead_id uuid references leads(id),
  property_id uuid not null references properties(id),
  comprador_profile_id uuid references profiles(user_id),
  etapa opportunity_stage not null default 'novo_lead',
  responsavel_tipo responsible_type not null default 'arini',
  responsavel_partner_id uuid references partners(id),
  partner_comprador_id uuid references partners(id),   -- Parceiro B (§17)
  qualificacao jsonb not null default '{}',
  motivo_perda text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_opportunities_touch before update on opportunities for each row execute function fn_touch_updated_at();
create index idx_opportunities_etapa on opportunities (etapa);
create index idx_opportunities_property on opportunities (property_id);

create table opportunity_events (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references opportunities(id) on delete cascade,
  tipo text not null,                    -- contato|qualificacao|encaminhamento|anotacao|mudanca_etapa
  descricao text not null default '',
  autor uuid references profiles(user_id),
  created_at timestamptz not null default now()
);
create index idx_opportunity_events_opp on opportunity_events (opportunity_id);

create table visits (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references opportunities(id) on delete cascade,
  data_hora timestamptz not null,
  responsavel uuid references profiles(user_id),
  status visit_status not null default 'agendada',
  feedback text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_visits_touch before update on visits for each row execute function fn_touch_updated_at();

create table proposals (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references opportunities(id) on delete cascade,
  numero_rodada int not null default 1,
  autor_lado proposal_side not null,
  valor numeric(14,2) not null,
  entrada numeric(14,2),
  parcelamento jsonb not null default '{}',
  prazo text,
  condicoes text,
  observacoes text,
  status proposal_status not null default 'enviada',
  created_by uuid references profiles(user_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_proposals_touch before update on proposals for each row execute function fn_touch_updated_at();

create table contracts (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null unique references opportunities(id),
  documento_path text,
  status contract_status not null default 'em_elaboracao',
  assinado_at timestamptz,
  registrado_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_contracts_touch before update on contracts for each row execute function fn_touch_updated_at();

create table sales (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null unique references opportunities(id),
  property_id uuid not null references properties(id),
  valor_final numeric(14,2) not null,
  data_venda date not null default current_date,
  participantes jsonb not null default '{}',   -- proprietário, parceiro A, parceiro B, comprador
  created_at timestamptz not null default now()
);

create table commissions (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null unique references sales(id),
  base_calculo numeric(14,2) not null,
  percentual numeric(5,2) not null default 1.00,
  valor numeric(14,2) not null,
  regra_contratual text,
  status commission_status not null default 'registrada',
  pago_em date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_commissions_touch before update on commissions for each row execute function fn_touch_updated_at();

-- ============================================================
-- RECEITA E OPERAÇÃO
-- ============================================================
create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null unique references properties(id),
  valor_mensal numeric(10,2) not null default 0,
  dia_vencimento int not null default 10,
  status subscription_status not null default 'ativa',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_subscriptions_touch before update on subscriptions for each row execute function fn_touch_updated_at();

create table invoices (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references subscriptions(id) on delete cascade,
  competencia date not null,
  valor numeric(10,2) not null,
  status invoice_status not null default 'aberta',
  pago_em date,
  gateway_id text,
  created_at timestamptz not null default now(),
  unique (subscription_id, competencia)
);

create table jobs (
  id uuid primary key default gen_random_uuid(),
  tipo text not null,                    -- tile_raster|render_video|screenshot_og|fetch_pois|process_kml|import_osm
  payload jsonb not null default '{}',
  status job_status not null default 'pendente',
  tentativas int not null default 0,
  erro text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_jobs_touch before update on jobs for each row execute function fn_touch_updated_at();
create index idx_jobs_status on jobs (status) where status in ('pendente','processando');

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  acao text not null,
  entidade text not null,
  entidade_id uuid,
  property_id uuid,
  opportunity_id uuid,
  dados_antes jsonb,
  dados_depois jsonb,
  created_at timestamptz not null default now()
);
create index idx_audit_property on audit_log (property_id);
create index idx_audit_opportunity on audit_log (opportunity_id);
create index idx_audit_created on audit_log (created_at);

create table settings (
  chave text primary key,
  valor jsonb not null,
  updated_at timestamptz not null default now()
);

insert into settings (chave, valor) values
  ('comissao_percentual_padrao', '1.00'),
  ('mensalidade_valor_padrao', '0'),
  ('poi_categorias', '["combustivel","farmacia","supermercado","hospital","escola","centro","acesso_rodovia"]');

-- ============================================================
-- RLS — quem manda é a policy, não a tela
-- ============================================================
alter table profiles enable row level security;
alter table partners enable row level security;
alter table partner_documents enable row level security;
alter table owners enable row level security;
alter table regions enable row level security;
alter table municipalities enable row level security;
alter table cartography_layers enable row level security;
alter table properties enable row level security;
alter table property_geometries enable row level security;
alter table property_media enable row level security;
alter table property_documents enable row level security;
alter table property_authorizations enable row level security;
alter table pois enable row level security;
alter table property_pois enable row level security;
alter table presentations enable row level security;
alter table leads enable row level security;
alter table opportunities enable row level security;
alter table opportunity_events enable row level security;
alter table visits enable row level security;
alter table proposals enable row level security;
alter table contracts enable row level security;
alter table sales enable row level security;
alter table commissions enable row level security;
alter table subscriptions enable row level security;
alter table invoices enable row level security;
alter table jobs enable row level security;
alter table audit_log enable row level security;
alter table settings enable row level security;

-- ---- profiles
create policy p_profiles_self_read on profiles for select using (user_id = auth.uid() or fn_is_arini());
create policy p_profiles_self_update on profiles for update using (user_id = auth.uid()) with check (user_id = auth.uid() and role = (select role from profiles p2 where p2.user_id = auth.uid()));
create policy p_profiles_arini_all on profiles for all using (fn_role() = 'admin_central');

-- ---- partners / owners: dono vê o seu, Arini vê tudo
create policy p_partners_own on partners for select using (profile_id = auth.uid() or fn_is_arini());
create policy p_partners_insert on partners for insert with check (profile_id = auth.uid());
create policy p_partners_arini on partners for update using (fn_is_arini());
create policy p_partner_docs on partner_documents for all
  using (fn_is_arini() or exists (select 1 from partners pa where pa.id = partner_id and pa.profile_id = auth.uid()));
create policy p_owners_own on owners for select using (profile_id = auth.uid() or fn_is_arini());
create policy p_owners_insert on owners for insert with check (profile_id = auth.uid());
create policy p_owners_arini on owners for update using (fn_is_arini());

-- ---- território: leitura pública (mapa anônimo), escrita Arini
create policy p_regions_read on regions for select using (true);
create policy p_regions_write on regions for all using (fn_is_arini());
create policy p_municipalities_read on municipalities for select using (true);
create policy p_municipalities_write on municipalities for all using (fn_is_arini());
create policy p_carto_read on cartography_layers for select using (status = 'pronto' or fn_is_arini());
create policy p_carto_write on cartography_layers for all using (fn_is_arini());

-- ---- imóveis: público vê publicado/em_negociacao/vendido; dono e Arini veem os seus
create or replace function fn_property_visible(p properties) returns boolean
language sql stable security definer set search_path = public as $$
  select p.status in ('publicado','em_negociacao','vendido')
      or fn_is_arini()
      or exists (select 1 from owners o where o.id = p.owner_id and o.profile_id = auth.uid())
      or exists (select 1 from partners pa where pa.id = p.partner_id and pa.profile_id = auth.uid())
$$;
create policy p_properties_read on properties for select using (fn_property_visible(properties));
create policy p_properties_insert on properties for insert with check (
  fn_is_arini()
  or exists (select 1 from owners o where o.id = owner_id and o.profile_id = auth.uid() and o.status in ('aprovado','ativo'))
  or exists (select 1 from partners pa where pa.id = partner_id and pa.profile_id = auth.uid() and pa.status in ('aprovado','ativo'))
);
create policy p_properties_update on properties for update using (
  fn_is_arini()
  or (status in ('rascunho','correcao') and (
       exists (select 1 from owners o where o.id = owner_id and o.profile_id = auth.uid())
    or exists (select 1 from partners pa where pa.id = partner_id and pa.profile_id = auth.uid())))
);

create or replace function fn_property_visible_id(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from properties p where p.id = pid and fn_property_visible(p))
$$;
create or replace function fn_property_editable_id(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select fn_is_arini() or exists (
    select 1 from properties p
    where p.id = pid and (
      exists (select 1 from owners o where o.id = p.owner_id and o.profile_id = auth.uid())
      or exists (select 1 from partners pa where pa.id = p.partner_id and pa.profile_id = auth.uid())))
$$;

create policy p_geometries_read on property_geometries for select using (fn_property_visible_id(property_id));
create policy p_geometries_write on property_geometries for all using (fn_property_editable_id(property_id));
create policy p_media_read on property_media for select using (fn_property_visible_id(property_id));
create policy p_media_write on property_media for all using (fn_property_editable_id(property_id));
create policy p_docs_rw on property_documents for all using (fn_property_editable_id(property_id));
create policy p_auth_rw on property_authorizations for all using (fn_property_editable_id(property_id));
create policy p_presentations_read on presentations for select using (fn_property_visible_id(property_id));
create policy p_presentations_write on presentations for all using (fn_is_arini());

-- ---- POIs: leitura pública, escrita via service role (jobs)
create policy p_pois_read on pois for select using (true);
create policy p_property_pois_read on property_pois for select using (fn_property_visible_id(property_id));

-- ---- leads: SEM policy de insert para anon — o form passa pela rota de API (service role).
create policy p_leads_arini on leads for select using (fn_is_arini());
create policy p_leads_update on leads for update using (fn_is_arini());

-- ---- oportunidades: Arini tudo; parceiro/proprietário só as suas
create or replace function fn_opp_visible(o opportunities) returns boolean
language sql stable security definer set search_path = public as $$
  select fn_is_arini()
      or exists (select 1 from partners pa where pa.id in (o.responsavel_partner_id, o.partner_comprador_id) and pa.profile_id = auth.uid())
      or exists (select 1 from properties p join owners ow on ow.id = p.owner_id
                 where p.id = o.property_id and ow.profile_id = auth.uid() and o.responsavel_tipo = 'proprietario')
$$;
create policy p_opps_read on opportunities for select using (fn_opp_visible(opportunities));
create policy p_opps_write on opportunities for update using (fn_opp_visible(opportunities));
create policy p_opps_insert on opportunities for insert with check (fn_is_arini());

create or replace function fn_opp_visible_id(oid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from opportunities o where o.id = oid and fn_opp_visible(o))
$$;
create policy p_opp_events on opportunity_events for all using (fn_opp_visible_id(opportunity_id));
create policy p_visits on visits for all using (fn_opp_visible_id(opportunity_id));
create policy p_proposals on proposals for all using (fn_opp_visible_id(opportunity_id));
create policy p_contracts on contracts for all using (fn_opp_visible_id(opportunity_id));

-- ---- venda/receita: só Arini (admin_central para comissões)
create policy p_sales_read on sales for select using (fn_is_arini());
create policy p_sales_write on sales for all using (fn_role() = 'admin_central');
create policy p_commissions on commissions for all using (fn_role() = 'admin_central');
create policy p_subscriptions on subscriptions for all using (fn_is_arini());
create policy p_invoices on invoices for all using (fn_is_arini());

-- ---- operação: jobs sem policy (só service role); audit append-only via service role, leitura Arini
create policy p_audit_read on audit_log for select using (fn_is_arini());
-- (sem policy de insert/update/delete em audit_log e jobs: só service role escreve)
create policy p_settings_read on settings for select using (fn_is_arini());
create policy p_settings_write on settings for all using (fn_role() = 'admin_central');
