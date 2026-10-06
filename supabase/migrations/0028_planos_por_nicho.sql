-- Arini Maps — migration 0028: planos por nicho de usuário.
--
-- Pedido do Carlos (05/10/2026): "criar tipos de planos de acordo com o nicho
-- do usuário; esses planos dão ou bloqueiam acesso a ferramentas". Cobre o
-- Fluxograma Mestre §3 (identifica perfil → carrega permissões) e §20 (sem
-- permissão → bloqueia → registra a tentativa), e os itens 1, 10 e 15 da
-- "Especificação de alterações e melhorias" (SaaS, matriz de permissões,
-- consulta básica × profissional).
--
-- Três eixos, de propósito separados:
--   · papel (profiles.role)  — o que a pessoa FAZ no fluxo (já existia);
--   · nicho (profiles.nicho) — o segmento comercial da conta, vindo das
--                              personas do fluxograma (produtor rural, empresa/
--                              holding, prefeitura… ficam RESERVADOS aqui, como
--                              o documento manda, até o Carlos definir o fluxo);
--   · plano (plans)          — o pacote de recursos e cotas que o nicho recebe.
-- O que cada plano libera fica no banco (editável pela Diretoria em
-- /admin/planos); o significado de cada recurso fica em src/lib/planos.ts.

-- ---------------------------------------------------------------------------
-- Planos
-- ---------------------------------------------------------------------------
create table if not exists plans (
  id text primary key,                          -- slug estável: consulta_basica, parceiro…
  nome text not null,
  descricao text not null default '',
  nichos_padrao text[] not null default '{}',   -- nichos que nascem com este plano
  recursos text[] not null default '{}',        -- ids do registro src/lib/planos.ts
  cotas jsonb not null default '{}',            -- {"consultas_area_mes": 2, "imoveis_ativos": 3}; ausente = sem limite
  preco_mensal numeric(10,2) not null default 0,
  periodicidade text not null default 'mensal' check (periodicidade in ('gratis', 'mensal', 'anual')),
  escopo text not null default 'conta' check (escopo in ('conta', 'organizacao')),
  destaque boolean not null default false,      -- aparece em evidência na página /planos
  ativo boolean not null default true,
  ordem integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists trg_plans_touch on plans;
create trigger trg_plans_touch before update on plans for each row execute function fn_touch_updated_at();
alter table plans enable row level security;
drop policy if exists p_plans_read on plans;
create policy p_plans_read on plans for select using (ativo = true);
-- escrita só pelo servidor (service_role), a partir de /admin/planos

-- ---------------------------------------------------------------------------
-- Nicho e plano na conta
-- ---------------------------------------------------------------------------
alter table profiles
  add column if not exists nicho text,
  add column if not exists plan_id text references plans(id) on delete set null,
  add column if not exists plan_origem text not null default 'padrao',
  add column if not exists plan_valido_ate timestamptz;
alter table profiles drop constraint if exists chk_profiles_nicho;
alter table profiles add constraint chk_profiles_nicho check (nicho is null or nicho in (
  'consulta', 'comprador_investidor', 'proprietario', 'produtor_rural', 'corretor_imobiliaria',
  'leiloeiro', 'engenheiro', 'empresa_holding', 'ente_publico', 'franqueado'
));
alter table profiles drop constraint if exists chk_profiles_plan_origem;
alter table profiles add constraint chk_profiles_plan_origem check (plan_origem in ('padrao', 'manual', 'assinatura'));
create index if not exists idx_profiles_plan on profiles (plan_id);
create index if not exists idx_profiles_nicho on profiles (nicho);

/** Nicho que cada papel recebe quando a pessoa não escolhe um. */
create or replace function fn_nicho_padrao(p_role user_role) returns text language sql immutable as $$
  select case p_role
    when 'comprador'   then 'comprador_investidor'
    when 'consulta'    then 'consulta'
    when 'proprietario' then 'proprietario'
    when 'imobiliaria' then 'corretor_imobiliaria'
    when 'corretor'    then 'corretor_imobiliaria'
    when 'engenheiro'  then 'engenheiro'
    when 'leiloeiro'   then 'leiloeiro'
    when 'franqueado'  then 'franqueado'
    else null end
$$;

/** Plano que um nicho recebe por padrão (o primeiro ativo que o lista). */
create or replace function fn_plano_padrao(p_nicho text) returns text language sql stable as $$
  select id from plans where ativo and p_nicho = any(nichos_padrao) order by ordem, id limit 1
$$;

-- Ao criar a conta ou mudar papel/nicho: completa o nicho e, enquanto o plano
-- for o padrão (ninguém da Matriz mexeu, nenhuma assinatura), acompanha o nicho.
-- security definer: desde a 0026 função nova nasce fechada para `authenticated`,
-- e as duas auxiliares acima são chamadas de dentro deste gatilho.
create or replace function fn_profile_plano() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.nicho is null then new.nicho := fn_nicho_padrao(new.role); end if;
  if new.plan_origem = 'padrao' and new.nicho is not null then
    new.plan_id := coalesce(fn_plano_padrao(new.nicho), new.plan_id);
  end if;
  return new;
end $$;
drop trigger if exists trg_profiles_plano on profiles;
create trigger trg_profiles_plano before insert or update of role, nicho, plan_origem on profiles
  for each row execute function fn_profile_plano();

-- A própria pessoa não troca papel (já valia) nem nicho/plano: isso é da
-- Matriz ou de uma assinatura paga.
drop policy if exists p_profiles_self_update on profiles;
create policy p_profiles_self_update on profiles for update
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and role = (select p2.role from profiles p2 where p2.user_id = auth.uid())
    and nicho is not distinct from (select p2.nicho from profiles p2 where p2.user_id = auth.uid())
    and plan_id is not distinct from (select p2.plan_id from profiles p2 where p2.user_id = auth.uid())
    and plan_origem = (select p2.plan_origem from profiles p2 where p2.user_id = auth.uid())
    and plan_valido_ate is not distinct from (select p2.plan_valido_ate from profiles p2 where p2.user_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- Assinatura do plano (por conta — a mensalidade por imóvel continua em
-- `subscriptions`). Cobrança pelo Asaas quando a chave existir; até lá, a
-- Diretoria registra manualmente.
-- ---------------------------------------------------------------------------
create table if not exists plan_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(user_id) on delete cascade,
  plan_id text not null references plans(id),
  status text not null default 'ativa' check (status in ('ativa', 'pendente', 'inadimplente', 'cancelada')),
  valor numeric(10,2) not null default 0,
  periodicidade text not null default 'mensal' check (periodicidade in ('mensal', 'anual')),
  inicio date not null default current_date,
  fim date,
  gateway_id text,                              -- id da assinatura/cobrança no Asaas
  observacao text,
  created_by uuid references profiles(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists trg_plan_subscriptions_touch on plan_subscriptions;
create trigger trg_plan_subscriptions_touch before update on plan_subscriptions for each row execute function fn_touch_updated_at();
create index if not exists idx_plan_subscriptions_user on plan_subscriptions (user_id, status);
alter table plan_subscriptions enable row level security;
drop policy if exists p_plan_subscriptions_proprio on plan_subscriptions;
create policy p_plan_subscriptions_proprio on plan_subscriptions for select using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Fluxograma §20: "TEM PERMISSÃO? NÃO → BLOQUEIA → REGISTRA TENTATIVA".
-- Toda negação de recurso/setor pelo servidor cai aqui (append-only).
-- ---------------------------------------------------------------------------
create table if not exists access_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(user_id) on delete set null,
  role text,
  plan_id text,
  recurso text not null,                        -- id do recurso ou "setor:<id>"
  rota text,
  motivo text,                                  -- sem_plano | cota_esgotada | sem_setor | sem_sessao
  ip text,
  created_at timestamptz not null default now()
);
create index if not exists idx_access_attempts_user on access_attempts (user_id, created_at desc);
create index if not exists idx_access_attempts_created on access_attempts (created_at desc);
alter table access_attempts enable row level security;
-- sem policy: só o servidor escreve e só a Central (Segurança) lê, pelo servidor

-- ---------------------------------------------------------------------------
-- Planos iniciais. `on conflict do nothing`: o que a Diretoria editar depois
-- não é sobrescrito por esta migration. Preços ficam em ZERO até o Carlos
-- definir (pendência 8.5 do roadmap) — plano com preço zero é tratado como
-- "mediante contato com a Arini" na página pública.
-- ---------------------------------------------------------------------------
insert into plans (id, nome, descricao, nichos_padrao, recursos, cotas, preco_mensal, periodicidade, escopo, destaque, ordem) values
  ('consulta_basica', 'Consulta básica',
   'Mapa, imóveis publicados, divisas do CAR e lotes urbanos, medição de área e distância, e 2 consultas de área por mês para experimentar. Gratuito.',
   '{consulta,comprador_investidor}',
   '{mapa,ficha_basica,interesse,camada_car,camada_lotes,ferramenta_medir,solicitacao_cartografica,consulta_area}',
   '{"consultas_area_mes": 2}', 0, 'gratis', 'conta', false, 10),
  ('consulta_profissional', 'Consulta profissional',
   'Tudo da básica mais o cruzamento da área com as fontes oficiais (CAR, SIGEF, IBAMA, ANM, INPE…), relatório territorial completo, importação de KML, impressão e captura do mapa, histórico e versões do imóvel.',
   '{engenheiro,produtor_rural}',
   '{mapa,ficha_basica,interesse,camada_car,camada_lotes,ferramenta_medir,solicitacao_cartografica,camadas_oficiais,consulta_area,relatorio_territorial,ferramenta_kml,ferramenta_exportar,historico_imovel,pre_avaliacao}',
   '{"consultas_area_mes": 100}', 0, 'mensal', 'conta', true, 20),
  ('anunciante', 'Anunciante',
   'Para quem vende o próprio imóvel: consulta básica, cadastro do imóvel com análise da Arini e acompanhamento das oportunidades. A mensalidade é por anúncio publicado.',
   '{proprietario}',
   '{mapa,ficha_basica,interesse,camada_car,camada_lotes,ferramenta_medir,solicitacao_cartografica,consulta_area,anunciar,oportunidades,historico_imovel}',
   '{"consultas_area_mes": 5, "imoveis_ativos": 5}', 0, 'gratis', 'conta', false, 30),
  ('parceiro', 'Parceiro profissional',
   'Corretor, imobiliária e leiloeiro: consulta profissional completa, painel do parceiro, anúncios de terceiros com aprovação da Matriz e oportunidades encaminhadas.',
   '{corretor_imobiliaria,leiloeiro}',
   '{mapa,ficha_basica,interesse,camada_car,camada_lotes,ferramenta_medir,solicitacao_cartografica,camadas_oficiais,consulta_area,relatorio_territorial,ferramenta_kml,ferramenta_exportar,historico_imovel,pre_avaliacao,anunciar,painel_parceiro,oportunidades}',
   '{"consultas_area_mes": 200, "imoveis_ativos": 50}', 0, 'mensal', 'conta', false, 40),
  ('organizacao', 'Organização',
   'Empresa, holding ou ente público: consulta profissional para vários usuários da mesma organização, relatórios consolidados e acesso a dados. Reservado até a definição do fluxo.',
   '{empresa_holding,ente_publico}',
   '{mapa,ficha_basica,interesse,camada_car,camada_lotes,ferramenta_medir,solicitacao_cartografica,camadas_oficiais,consulta_area,relatorio_territorial,ferramenta_kml,ferramenta_exportar,historico_imovel,pre_avaliacao,multiusuario,api_dados}',
   '{"consultas_area_mes": 500}', 0, 'anual', 'organizacao', false, 50),
  ('franquia', 'Franquia',
   'Franqueado da Arini: tudo do parceiro dentro do território da franquia. Aprovação e publicação continuam na Matriz.',
   '{franqueado}',
   '{mapa,ficha_basica,interesse,camada_car,camada_lotes,ferramenta_medir,solicitacao_cartografica,camadas_oficiais,consulta_area,relatorio_territorial,ferramenta_kml,ferramenta_exportar,historico_imovel,pre_avaliacao,anunciar,painel_parceiro,oportunidades,territorio}',
   '{"consultas_area_mes": 500}', 0, 'mensal', 'organizacao', false, 60)
on conflict (id) do nothing;

-- contas existentes recebem nicho e plano padrão (a equipe fica sem plano: papel manda)
update profiles set nicho = fn_nicho_padrao(role) where nicho is null;
update profiles set plan_id = fn_plano_padrao(nicho) where plan_id is null and nicho is not null and plan_origem = 'padrao';

-- (as funções novas já nascem fechadas para anon/authenticated — migration 0026)
