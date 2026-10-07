-- Arini Maps — migration 0035: conta, organizações, versões de documento,
-- suporte ao vivo e demandas sem imóvel (pacote D, 07/10/2026).
--
--  · 4.6/5.10  profiles.preferencias (tema, base do mapa, camada CAR, e-mails)
--              e profiles.visto_em (última atividade — "atendente online" e
--              e-mail só para quem não está com a página aberta).
--  · 5.8       property_documents.versao / substituido_por / substituido_em /
--              enviado_por: reenvio do mesmo tipo vira versão nova, a antiga fica.
--  · 5.9       organizations + organization_members (convite por e-mail).
--  · 5.16      demandas + demanda_matches (Fluxograma §12).
--  · 10.2      índice para "mensagens depois de X" (conversa ao vivo por polling).
--
-- Tudo idempotente: pode rodar de novo sem efeito colateral.

-- ---------------------------------------------------------------------------
-- 1. Conta: preferências e última atividade
-- ---------------------------------------------------------------------------
alter table profiles add column if not exists preferencias jsonb not null default '{}'::jsonb;
alter table profiles add column if not exists visto_em timestamptz;

do $$ begin
  alter table profiles add constraint ck_profiles_preferencias_objeto check (jsonb_typeof(preferencias) = 'object');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- 2. Versões de documento do imóvel
-- ---------------------------------------------------------------------------
alter table property_documents add column if not exists versao int not null default 1;
alter table property_documents add column if not exists substituido_por uuid references property_documents(id) on delete set null;
alter table property_documents add column if not exists substituido_em timestamptz;
alter table property_documents add column if not exists enviado_por uuid references profiles(user_id) on delete set null;
create index if not exists idx_property_documents_atual on property_documents (property_id, tipo) where substituido_por is null;

-- "outro" é avulso (vários documentos diferentes); os demais tipos têm uma
-- versão vigente por imóvel e o reenvio substitui a anterior sem apagá-la.
create or replace function fn_doc_versao() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.tipo <> 'outro' then
    select coalesce(max(versao), 0) + 1 into new.versao
      from property_documents where property_id = new.property_id and tipo = new.tipo;
  end if;
  return new;
end $$;

create or replace function fn_doc_substitui() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.tipo <> 'outro' then
    update property_documents
       set substituido_por = new.id, substituido_em = now()
     where property_id = new.property_id and tipo = new.tipo
       and id <> new.id and substituido_por is null;
  end if;
  return null;
end $$;

drop trigger if exists trg_doc_versao on property_documents;
create trigger trg_doc_versao before insert on property_documents for each row execute function fn_doc_versao();
drop trigger if exists trg_doc_substitui on property_documents;
create trigger trg_doc_substitui after insert on property_documents for each row execute function fn_doc_substitui();

revoke execute on function fn_doc_versao() from public, anon, authenticated;
revoke execute on function fn_doc_substitui() from public, anon, authenticated;

-- documentos que já existiam: numera por data e encadeia (só o que ainda não foi feito)
with ordem as (
  select id,
         row_number() over (partition by property_id, tipo order by created_at, id) as n,
         lead(id) over (partition by property_id, tipo order by created_at, id) as proximo,
         lead(created_at) over (partition by property_id, tipo order by created_at, id) as proximo_em
    from property_documents where tipo <> 'outro'
)
update property_documents d
   set versao = o.n, substituido_por = o.proximo, substituido_em = o.proximo_em
  from ordem o
 where d.id = o.id and d.versao = 1 and d.substituido_por is null and (o.n > 1 or o.proximo is not null);

-- ---------------------------------------------------------------------------
-- 3. Organizações (5.9) — várias contas sob um plano de escopo "organizacao"
-- ---------------------------------------------------------------------------
create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (length(trim(nome)) >= 2),
  cnpj text,
  tipo text not null default 'imobiliaria'
    check (tipo in ('imobiliaria', 'empresa', 'holding', 'ente_publico', 'franquia')),
  plan_id text references plans(id) on delete set null,
  plan_valido_ate timestamptz,
  region_id uuid references regions(id) on delete set null,
  ativo boolean not null default true,
  observacoes text,
  created_by uuid references profiles(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists uq_organizations_cnpj on organizations (cnpj) where cnpj is not null;
drop trigger if exists trg_organizations_touch on organizations;
create trigger trg_organizations_touch before update on organizations for each row execute function fn_touch_updated_at();

create table if not exists organization_members (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid references profiles(user_id) on delete cascade,   -- null = convite ainda não aceito
  email text not null,                                            -- para quem o convite foi
  papel_org text not null default 'membro' check (papel_org in ('admin', 'membro')),
  status text not null default 'pendente' check (status in ('pendente', 'ativo', 'recusado', 'removido')),
  convidado_por uuid references profiles(user_id) on delete set null,
  convidado_em timestamptz not null default now(),
  aceito_em timestamptz,
  removido_em timestamptz
);
create index if not exists idx_org_members_org on organization_members (org_id, status);
create index if not exists idx_org_members_email on organization_members (lower(email)) where status = 'pendente';
-- uma pessoa ativa em uma organização por vez (o plano dela vem de lá)
create unique index if not exists uq_org_members_user_ativo on organization_members (user_id) where status = 'ativo';
-- um convite pendente por e-mail em cada organização
create unique index if not exists uq_org_members_convite on organization_members (org_id, lower(email)) where status = 'pendente';

alter table organizations enable row level security;
alter table organization_members enable row level security;
-- leitura: a equipe vê tudo; o membro vê a própria organização e a própria linha.
-- Escrita só pelo servidor (rotas /api/admin/organizacoes e /api/conta/organizacao).
drop policy if exists p_org_leitura on organizations;
create policy p_org_leitura on organizations for select using (
  fn_is_arini() or exists (select 1 from organization_members m
    where m.org_id = organizations.id and m.user_id = auth.uid() and m.status = 'ativo')
);
drop policy if exists p_org_membro_leitura on organization_members;
create policy p_org_membro_leitura on organization_members for select using (fn_is_arini() or user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 4. Demandas sem imóvel (5.16 · Fluxograma §12)
-- ---------------------------------------------------------------------------
create sequence if not exists demanda_codigo_seq;
create table if not exists demandas (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique default ('DEM-' || lpad(nextval('demanda_codigo_seq')::text, 6, '0')),
  cliente_nome text not null,
  cliente_contato text,
  user_id uuid references profiles(user_id) on delete set null,
  opportunity_id uuid references opportunities(id) on delete set null,
  tipo property_type,                       -- null = rural ou urbano
  municipios uuid[] not null default '{}',  -- vazio = qualquer município
  area_min numeric check (area_min is null or area_min >= 0),   -- ha (rural) / m² (urbano)
  area_max numeric check (area_max is null or area_max >= 0),
  valor_min numeric check (valor_min is null or valor_min >= 0),
  valor_max numeric check (valor_max is null or valor_max >= 0),
  observacoes text,
  status text not null default 'aberta' check (status in ('aberta', 'atendida', 'cancelada')),
  responsavel uuid references profiles(user_id) on delete set null,
  criado_por uuid references profiles(user_id) on delete set null,
  fechada_em timestamptz,
  motivo_fechamento text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_demandas_status on demandas (status, created_at desc);
create index if not exists idx_demandas_opp on demandas (opportunity_id);
drop trigger if exists trg_demandas_touch on demandas;
create trigger trg_demandas_touch before update on demandas for each row execute function fn_touch_updated_at();

-- cada casamento demanda × imóvel gera uma tarefa só uma vez (republicar não duplica)
create table if not exists demanda_matches (
  id uuid primary key default gen_random_uuid(),
  demanda_id uuid not null references demandas(id) on delete cascade,
  property_id uuid not null references properties(id) on delete cascade,
  task_id uuid references tasks(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (demanda_id, property_id)
);

alter table demandas enable row level security;
alter table demanda_matches enable row level security;
-- só a equipe lê; gravação pelo servidor
drop policy if exists p_demandas_equipe on demandas;
create policy p_demandas_equipe on demandas for select using (fn_is_arini());
drop policy if exists p_demanda_matches_equipe on demanda_matches;
create policy p_demanda_matches_equipe on demanda_matches for select using (fn_is_arini());

-- ---------------------------------------------------------------------------
-- 5. Suporte ao vivo (10.2): polling por "mensagens depois de X"
-- ---------------------------------------------------------------------------
create index if not exists idx_support_messages_ticket_desc on support_messages (ticket_id, created_at desc);

-- chamados em aberto cuja última mensagem visível é do cliente = esperando a
-- equipe (selo "não lidos" no menu do Suporte). Só o servidor chama.
create or replace function fn_suporte_aguardando_equipe()
returns table (ticket_id uuid, ultima_em timestamptz)
language sql stable security definer set search_path = public as $$
  select t.id, u.created_at
    from support_tickets t
    join lateral (
      select m.da_equipe, m.created_at from support_messages m
       where m.ticket_id = t.id and not m.interno
       order by m.created_at desc limit 1
    ) u on true
   where t.status <> 'resolvido' and not u.da_equipe
$$;
revoke execute on function fn_suporte_aguardando_equipe() from public, anon, authenticated;
grant execute on function fn_suporte_aguardando_equipe() to service_role;
