-- Arini Maps — migration 0023: limite de tentativas, eventos de autenticação e
-- consulta territorial por área do CAR.
--
-- Vem dos dois documentos do Carlos de 01/10/2026 ("Especificação de alterações
-- e melhorias" e "Requisitos de segurança, LGPD e proteção de dados"):
--   · item 3 de segurança: controlar tentativas, força bruta, atraso progressivo;
--   · item 13: registrar login, falha, recuperação e troca de senha;
--   · item 7 de melhorias: "CONSULTAR INFORMAÇÕES" no clique da cartografia,
--     registrando usuário, área, data e ação.

-- ---------------------------------------------------------------------------
-- Limite de tentativas (rate limiting) — janela fixa por chave.
-- No banco, e não em memória do servidor, porque o contador precisa sobreviver
-- a reinício do container e valer para mais de uma instância.
-- ---------------------------------------------------------------------------
create table if not exists rate_limits (
  chave text not null,
  janela timestamptz not null,
  total integer not null default 1,
  primary key (chave, janela)
);
alter table rate_limits enable row level security;

/**
 * Conta mais uma tentativa e devolve {permitido, total, restante, libera_em}.
 * A janela é alinhada ao relógio (p_janela_s), então duas instâncias contam
 * na mesma linha. Linhas com mais de um dia são varridas de passagem.
 */
create or replace function fn_rate_limit(p_chave text, p_max integer, p_janela_s integer)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_janela timestamptz := to_timestamp(floor(extract(epoch from now()) / p_janela_s) * p_janela_s);
  v_total integer;
begin
  insert into rate_limits (chave, janela, total) values (p_chave, v_janela, 1)
  on conflict (chave, janela) do update set total = rate_limits.total + 1
  returning total into v_total;

  if random() < 0.02 then
    delete from rate_limits where janela < now() - interval '1 day';
  end if;

  return json_build_object(
    'permitido', v_total <= p_max,
    'total', v_total,
    'restante', greatest(0, p_max - v_total),
    'libera_em', v_janela + make_interval(secs => p_janela_s)
  );
end $$;

-- ---------------------------------------------------------------------------
-- Eventos de autenticação. Separado do audit_log porque a maior parte das
-- falhas de login não tem usuário (e-mail errado, robô) e o volume é outro.
-- Append-only: sem policy, só o servidor escreve; ninguém atualiza nem apaga.
-- ---------------------------------------------------------------------------
create table if not exists auth_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  email text,
  evento text not null,        -- login_ok | login_falhou | login_bloqueado | recuperacao_pedida | senha_redefinida | senha_alterada | mfa_ativado | mfa_desativado | mfa_falhou | logout
  ip text,
  agente text,                 -- user-agent, para reconhecer dispositivo
  detalhe jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_auth_events_user on auth_events (user_id, created_at desc);
create index if not exists idx_auth_events_email on auth_events (email, created_at desc);
create index if not exists idx_auth_events_created on auth_events (created_at desc);
alter table auth_events enable row level security;

-- ---------------------------------------------------------------------------
-- Consulta territorial por ÁREA (sem imóvel anunciado): o usuário clica numa
-- área do CAR e pede as informações. O resultado fica em cache por fonte —
-- consultar a mesma fazenda duas vezes no dia não bate de novo nos órgãos.
-- ---------------------------------------------------------------------------
create table if not exists consultas_area (
  id uuid primary key default gen_random_uuid(),
  chave text not null,                       -- 'car:<cod_imovel>'
  fonte_id text not null references fontes_externas(id),
  raio_m integer not null default 0,
  resultado jsonb not null default '{}',
  quantidade integer not null default 0,
  incide boolean not null default false,
  erro text,
  consultado_em timestamptz not null default now(),
  unique (chave, fonte_id, raio_m)
);
alter table consultas_area enable row level security;

/** Envelope de um imóvel do CAR, com folga em metros, no formato dos adaptadores. */
create or replace function fn_car_bbox_imovel(p_cod text, p_buffer_m numeric default 0)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'xmin', st_xmin(e), 'ymin', st_ymin(e), 'xmax', st_xmax(e), 'ymax', st_ymax(e),
    'lng', st_x(st_centroid(e)), 'lat', st_y(st_centroid(e))
  )
  from (
    select st_envelope(
      case when p_buffer_m > 0 then st_buffer(c.geom::geography, p_buffer_m)::geometry else c.geom end
    ) as e
    from car_imoveis c where c.cod_imovel = p_cod
  ) t
$$;

/** Quem já consultou cada área: histórico para auditoria e para a própria pessoa. */
create table if not exists consultas_area_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(user_id) on delete cascade,
  chave text not null,
  acao text not null default 'consulta',     -- consulta | reivindicacao
  ip text,
  created_at timestamptz not null default now()
);
create index if not exists idx_consultas_area_log_user on consultas_area_log (user_id, created_at desc);
create index if not exists idx_consultas_area_log_chave on consultas_area_log (chave, created_at desc);
alter table consultas_area_log enable row level security;
create policy p_consultas_area_log_proprio on consultas_area_log for select using (user_id = auth.uid());
