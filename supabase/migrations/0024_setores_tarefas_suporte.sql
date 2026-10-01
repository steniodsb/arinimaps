-- Arini Maps — migration 0024: Matriz por setores, tarefas internas, suporte e LGPD.
--
-- Pedido do Carlos (call de 01/10/2026): "sistema interno principal, do
-- marketing, do jurídico, da contabilidade — as camadas internas". A Central
-- Arini já tinha as telas, mas num menu só; aqui a equipe passa a ser
-- organizada por setor, cada setor com o seu painel, as suas filas e as suas
-- tarefas. Diretoria enxerga tudo; os demais, só os setores em que estão.

-- ---------------------------------------------------------------------------
-- Setores do membro da equipe. Lista (e não um setor só) porque numa empresa
-- pequena a mesma pessoa cobre comercial e marketing, ou jurídico e financeiro.
-- Os ids válidos vivem em src/lib/setores.ts.
-- ---------------------------------------------------------------------------
alter table profiles add column if not exists setores text[] not null default '{}';

-- ---------------------------------------------------------------------------
-- Tarefas internas: a lista de afazeres de cada setor, com responsável e prazo.
-- Pode apontar para um imóvel ou uma oportunidade.
-- ---------------------------------------------------------------------------
create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  descricao text,
  setor text not null,
  responsavel uuid references profiles(user_id) on delete set null,
  criado_por uuid references profiles(user_id) on delete set null,
  prazo date,
  prioridade text not null default 'normal' check (prioridade in ('baixa', 'normal', 'alta')),
  status text not null default 'aberta' check (status in ('aberta', 'andamento', 'concluida', 'cancelada')),
  property_id uuid references properties(id) on delete set null,
  opportunity_id uuid references opportunities(id) on delete set null,
  concluida_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_tasks_touch before update on tasks for each row execute function fn_touch_updated_at();
create index if not exists idx_tasks_setor on tasks (setor, status);
create index if not exists idx_tasks_responsavel on tasks (responsavel, status);
alter table tasks enable row level security;

-- ---------------------------------------------------------------------------
-- Suporte: chamados de usuários e visitantes, com conversa e nota interna.
-- ---------------------------------------------------------------------------
create sequence if not exists support_codigo_seq;
create table if not exists support_tickets (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique default ('SUP-' || lpad(nextval('support_codigo_seq')::text, 6, '0')),
  user_id uuid references profiles(user_id) on delete set null,
  nome text not null,
  email text,
  telefone text,
  categoria text not null default 'duvida'
    check (categoria in ('duvida', 'problema', 'anuncio', 'financeiro', 'dados_pessoais', 'outro')),
  assunto text not null,
  status text not null default 'aberto'
    check (status in ('aberto', 'em_atendimento', 'aguardando_cliente', 'resolvido')),
  prioridade text not null default 'normal' check (prioridade in ('baixa', 'normal', 'alta')),
  responsavel uuid references profiles(user_id) on delete set null,
  property_id uuid references properties(id) on delete set null,
  resolvido_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_support_touch before update on support_tickets for each row execute function fn_touch_updated_at();
create index if not exists idx_support_status on support_tickets (status, created_at desc);
create index if not exists idx_support_user on support_tickets (user_id, created_at desc);

create table if not exists support_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references support_tickets(id) on delete cascade,
  autor_id uuid references profiles(user_id) on delete set null,
  autor_nome text not null,
  da_equipe boolean not null default false,
  interno boolean not null default false,   -- nota interna: o cliente não vê
  corpo text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_support_messages_ticket on support_messages (ticket_id, created_at);

alter table support_tickets enable row level security;
alter table support_messages enable row level security;
-- o dono do chamado lê o próprio chamado e as mensagens que não são nota interna
create policy p_support_proprio on support_tickets for select using (user_id = auth.uid());
create policy p_support_msg_proprio on support_messages for select using (
  not interno and exists (select 1 from support_tickets t where t.id = ticket_id and t.user_id = auth.uid())
);

-- ---------------------------------------------------------------------------
-- LGPD: pedidos dos titulares (art. 18) — acesso, correção, exclusão etc.
-- A lei dá prazo de resposta; o prazo fica gravado para o Jurídico acompanhar.
-- ---------------------------------------------------------------------------
create sequence if not exists lgpd_codigo_seq;
create table if not exists lgpd_requests (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique default ('LGPD-' || lpad(nextval('lgpd_codigo_seq')::text, 5, '0')),
  user_id uuid references profiles(user_id) on delete set null,
  nome text not null,
  email text not null,
  cpf text,
  tipo text not null
    check (tipo in ('acesso', 'correcao', 'exclusao', 'portabilidade', 'revogacao', 'informacao', 'outro')),
  descricao text,
  status text not null default 'recebido' check (status in ('recebido', 'em_analise', 'atendido', 'negado')),
  resposta text,
  prazo date not null default (current_date + 15),
  atendido_em timestamptz,
  atendido_por uuid references profiles(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_lgpd_touch before update on lgpd_requests for each row execute function fn_touch_updated_at();
create index if not exists idx_lgpd_status on lgpd_requests (status, prazo);
alter table lgpd_requests enable row level security;
create policy p_lgpd_proprio on lgpd_requests for select using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Receita por mês (Financeiro): comissões e mensalidades, previstas e recebidas.
-- ---------------------------------------------------------------------------
create or replace function fn_financeiro_mensal(p_meses integer default 12)
returns json language sql stable security definer set search_path = public as $$
  with meses as (
    select date_trunc('month', current_date) - make_interval(months => g) as mes
    from generate_series(0, greatest(p_meses, 1) - 1) g
  )
  select coalesce(json_agg(json_build_object(
    'mes', to_char(m.mes, 'YYYY-MM'),
    'vendas', (select count(*) from sales s where date_trunc('month', s.data_venda) = m.mes),
    'volume_vendido', (select coalesce(sum(s.valor_final), 0) from sales s where date_trunc('month', s.data_venda) = m.mes),
    'comissao_registrada', (select coalesce(sum(c.valor), 0) from commissions c join sales s on s.id = c.sale_id
                            where date_trunc('month', s.data_venda) = m.mes),
    'comissao_recebida', (select coalesce(sum(c.valor), 0) from commissions c
                          where c.pago_em is not null and date_trunc('month', c.pago_em) = m.mes),
    'mensalidade_faturada', (select coalesce(sum(i.valor), 0) from invoices i where date_trunc('month', i.competencia) = m.mes),
    'mensalidade_recebida', (select coalesce(sum(i.valor), 0) from invoices i
                             where i.pago_em is not null and date_trunc('month', i.pago_em) = m.mes)
  ) order by m.mes desc), '[]'::json)
  from meses m
$$;

-- a equipe de hoje: a diretoria continua vendo tudo; o analista que já existia
-- fica nos setores que ele operava (imóveis, funil e visitas)
update profiles set setores = '{operacoes,comercial}'
where role = 'analista_arini' and setores = '{}';
