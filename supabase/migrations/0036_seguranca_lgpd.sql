-- 0036 — Segurança e LGPD (itens 6.3 a 6.13 do roadmap, 07/10/2026)
--
--  · document_access_log  — quem abriu cada documento, selfie, contrato ou anexo (6.3)
--  · descartes_log + fn_descarte_* — retenção e descarte, simulação por padrão (6.4)
--  · profiles.cpf_hash / cpf_cnpj_cifrado — CPF cifrado na aplicação, com hash para busca (6.5)
--  · recuperacao_codigos  — segunda etapa da recuperação de senha da equipe (6.7)
--  · alertas_seguranca    — novo aparelho, novo local, excesso de falhas (6.8)
--  · revisoes_acesso      — revisão trimestral de permissões (6.13)
--  · fn_log_somente_insercao — registros protegidos contra alteração e exclusão (6.12)
--  · revisão das APIs (6.2): papel de equipe só pelo servidor no cadastro do Auth,
--    escrita direta pela API pública fechada (imóvel, documentos, oportunidades…)
--
-- Tudo idempotente. Tabelas com RLS ligada e SEM policy: só o servidor
-- (service_role) lê e grava. Funções nascem fechadas (default privileges da 0026).

-- ---------------------------------------------------------------------------
-- 6.12 Proteção dos registros: somente-inserção, inclusive para a service_role
-- ---------------------------------------------------------------------------
-- A RLS não segura a service_role (ela ignora policies); gatilho segura.
-- Passam só:
--  · o descarte por prazo de guarda, que liga `arini.descarte_autorizado`
--    apenas dentro da própria transação (fn_descarte_aplicar);
--  · ações em cascata de chave estrangeira (apagar um imóvel leva junto o
--    histórico dele; excluir um titular anula o user_id) — elas rodam dentro
--    do gatilho de integridade, por isso pg_trigger_depth() > 1.
-- Um superusuário do banco ainda pode desligar o gatilho: isso fica no log do
-- Postgres e está descrito em docs/SEGURANCA.md.
create or replace function fn_log_somente_insercao() returns trigger
language plpgsql as $$
begin
  if current_setting('arini.descarte_autorizado', true) = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_level = 'ROW' and pg_trigger_depth() > 1 then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  raise exception 'O registro "%" é somente-inserção: % não é permitido.', tg_table_name, tg_op
    using errcode = 'insufficient_privilege',
          hint = 'Descarte por prazo de guarda só pela rotina de retenção (fn_descarte_aplicar).';
end $$;

-- ---------------------------------------------------------------------------
-- 6.3 Registro de quem abre cada documento
-- ---------------------------------------------------------------------------
create table if not exists document_access_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  categoria text not null check (categoria in ('documento', 'selfie', 'autorizacao', 'contrato', 'cartografia')),
  documento_id uuid,
  storage_path text not null,
  property_id uuid,
  opportunity_id uuid,
  cartographic_request_id uuid,
  acao text not null check (acao in ('visualizar', 'baixar')),
  permitido boolean not null default true,
  motivo text,
  ip text,
  agente text,
  created_at timestamptz not null default now()
);
create index if not exists idx_document_access_log_data on document_access_log (created_at desc);
create index if not exists idx_document_access_log_user on document_access_log (user_id, created_at desc);
create index if not exists idx_document_access_log_imovel on document_access_log (property_id, created_at desc);
alter table document_access_log enable row level security;
comment on table document_access_log is
  'Quem abriu (visualizou ou baixou) cada arquivo do cofre privado docs, inclusive as tentativas negadas. Somente-inserção.';

-- ---------------------------------------------------------------------------
-- 6.4 Retenção e descarte
-- ---------------------------------------------------------------------------
create table if not exists descartes_log (
  id uuid primary key default gen_random_uuid(),
  simulacao boolean not null,
  categoria text not null,          -- selfie | documento_reprovado | log:<tabela>
  referencia text,                  -- id do registro ou nome da tabela
  storage_path text,
  quantidade integer not null default 1,
  detalhe jsonb,
  job_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists idx_descartes_log_data on descartes_log (created_at desc);
alter table descartes_log enable row level security;
comment on table descartes_log is 'Tudo o que a rotina de retenção descartou (ou simulou descartar). Somente-inserção.';

-- Lista o que já passou do prazo. Prazo 0 = não descartar aquela categoria.
--  · selfie: N dias depois do fim da autorização (validade) — a selfie é a
--    prova do aceite enquanto a exclusividade vale;
--  · documento de imóvel reprovado: N dias depois da última mudança do imóvel;
--  · registros de acesso (auth_events, document_access_log, access_attempts,
--    consultas_area_log, alertas_seguranca): N dias depois de criados.
-- audit_log e property_events NÃO entram: são registro de operação e negócio,
-- guardados até a decisão 8.9 dizer outra coisa.
create or replace function fn_descarte_candidatos(p_selfie_dias int, p_docs_dias int, p_logs_dias int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_selfies jsonb := '[]';
  v_docs jsonb := '[]';
  v_logs jsonb := '{}';
  v_limite timestamptz;
  v_n bigint;
  t text;
begin
  if coalesce(p_selfie_dias, 0) > 0 then
    select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'property_id', a.property_id, 'path', a.selfie_path)), '[]')
      into v_selfies
    from property_authorizations a
    where a.selfie_path is not null
      and coalesce(a.validade::timestamptz, a.created_at) + make_interval(days => p_selfie_dias) < now();
  end if;

  if coalesce(p_docs_dias, 0) > 0 then
    select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'property_id', d.property_id, 'path', d.storage_path,
                                                 'tipo', d.tipo, 'nome', d.nome_arquivo)), '[]')
      into v_docs
    from property_documents d join properties p on p.id = d.property_id
    where p.status = 'reprovado'
      and p.updated_at + make_interval(days => p_docs_dias) < now();
  end if;

  if coalesce(p_logs_dias, 0) > 0 then
    v_limite := now() - make_interval(days => p_logs_dias);
    foreach t in array array['auth_events', 'document_access_log', 'access_attempts', 'consultas_area_log', 'alertas_seguranca'] loop
      if to_regclass('public.' || t) is not null then
        execute format('select count(*) from %I where created_at < $1', t) into v_n using v_limite;
        v_logs := v_logs || jsonb_build_object(t, v_n);
      end if;
    end loop;
  end if;

  return jsonb_build_object('selfies', v_selfies, 'documentos', v_docs, 'logs', v_logs,
                            'prazos', jsonb_build_object('selfie', p_selfie_dias, 'documentos', p_docs_dias, 'logs', p_logs_dias));
end $$;

-- Aplica o descarte. Recebe os caminhos cujos arquivos o worker JÁ apagou do
-- armazenamento e só mexe nas linhas que continuam sendo candidatas — a
-- função não serve para apagar registro qualquer.
create or replace function fn_descarte_aplicar(
  p_paths_removidos text[], p_selfie_dias int, p_docs_dias int, p_logs_dias int, p_job_id uuid default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_cand jsonb := fn_descarte_candidatos(p_selfie_dias, p_docs_dias, p_logs_dias);
  v_item jsonb;
  v_selfies int := 0;
  v_docs int := 0;
  v_logs jsonb := '{}';
  v_limite timestamptz;
  v_n bigint;
  t text;
begin
  perform set_config('arini.descarte_autorizado', 'on', true);

  for v_item in select * from jsonb_array_elements(v_cand->'selfies') loop
    if (v_item->>'path') = any(coalesce(p_paths_removidos, '{}')) then
      update property_authorizations set selfie_path = null where id = (v_item->>'id')::uuid;
      insert into descartes_log (simulacao, categoria, referencia, storage_path, detalhe, job_id)
      values (false, 'selfie', v_item->>'id', v_item->>'path', jsonb_build_object('property_id', v_item->>'property_id'), p_job_id);
      v_selfies := v_selfies + 1;
    end if;
  end loop;

  for v_item in select * from jsonb_array_elements(v_cand->'documentos') loop
    if (v_item->>'path') = any(coalesce(p_paths_removidos, '{}')) then
      begin
        delete from property_documents where id = (v_item->>'id')::uuid;
        insert into descartes_log (simulacao, categoria, referencia, storage_path, detalhe, job_id)
        values (false, 'documento_reprovado', v_item->>'id', v_item->>'path',
                jsonb_build_object('property_id', v_item->>'property_id', 'tipo', v_item->>'tipo', 'nome', v_item->>'nome'), p_job_id);
        v_docs := v_docs + 1;
      exception when others then
        insert into descartes_log (simulacao, categoria, referencia, storage_path, detalhe, job_id)
        values (false, 'documento_reprovado_erro', v_item->>'id', v_item->>'path', jsonb_build_object('erro', sqlerrm), p_job_id);
      end;
    end if;
  end loop;

  if coalesce(p_logs_dias, 0) > 0 then
    v_limite := now() - make_interval(days => p_logs_dias);
    foreach t in array array['auth_events', 'document_access_log', 'access_attempts', 'consultas_area_log', 'alertas_seguranca'] loop
      if to_regclass('public.' || t) is not null then
        execute format('delete from %I where created_at < $1', t) using v_limite;
        get diagnostics v_n = row_count;
        if v_n > 0 then
          insert into descartes_log (simulacao, categoria, referencia, quantidade, detalhe, job_id)
          values (false, 'log:' || t, t, v_n, jsonb_build_object('anteriores_a', v_limite), p_job_id);
        end if;
        v_logs := v_logs || jsonb_build_object(t, v_n);
      end if;
    end loop;
  end if;

  perform set_config('arini.descarte_autorizado', 'off', true);
  return jsonb_build_object('selfies', v_selfies, 'documentos', v_docs, 'logs', v_logs);
end $$;

-- Simulação registrada (modo padrão): grava no descartes_log o que SERIA descartado.
create or replace function fn_descarte_simular(p_selfie_dias int, p_docs_dias int, p_logs_dias int, p_job_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_cand jsonb := fn_descarte_candidatos(p_selfie_dias, p_docs_dias, p_logs_dias);
  k text;
  v jsonb;
begin
  insert into descartes_log (simulacao, categoria, quantidade, job_id)
  values (true, 'selfie', jsonb_array_length(v_cand->'selfies'), p_job_id),
         (true, 'documento_reprovado', jsonb_array_length(v_cand->'documentos'), p_job_id);
  for k, v in select key, value from jsonb_each(v_cand->'logs') loop
    insert into descartes_log (simulacao, categoria, referencia, quantidade, job_id)
    values (true, 'log:' || k, k, (v #>> '{}')::int, p_job_id);
  end loop;
  return v_cand;
end $$;

-- ---------------------------------------------------------------------------
-- 6.5 CPF/CNPJ cifrado (inerte sem CAMPO_CRIPTO_CHAVE no servidor)
-- ---------------------------------------------------------------------------
alter table profiles add column if not exists cpf_hash text;
alter table profiles add column if not exists cpf_cnpj_cifrado text;
create unique index if not exists uq_profiles_cpf_hash on profiles (cpf_hash) where cpf_hash is not null;
comment on column profiles.cpf_hash is
  'HMAC-SHA256 do CPF/CNPJ com chave derivada de CAMPO_CRIPTO_CHAVE: unicidade e busca sem guardar o número em claro.';
comment on column profiles.cpf_cnpj_cifrado is
  'CPF/CNPJ cifrado na aplicação (AES-256-GCM, src/lib/seguranca/cripto.ts). Com a chave configurada, cpf_cnpj fica nulo.';

-- O CPF ia também para o user_metadata do Auth — que viaja dentro do token
-- de sessão (cookie legível pelo navegador). Não precisa estar lá.
update auth.users set raw_user_meta_data = raw_user_meta_data - 'cpf_cnpj'
where raw_user_meta_data ? 'cpf_cnpj';

-- ---------------------------------------------------------------------------
-- 6.7 Recuperação reforçada para a equipe: código por e-mail (segunda etapa)
-- ---------------------------------------------------------------------------
create table if not exists recuperacao_codigos (
  user_id uuid primary key,
  codigo_hash text not null,
  expira_em timestamptz not null,
  tentativas integer not null default 0,
  created_at timestamptz not null default now()
);
alter table recuperacao_codigos enable row level security;

-- ---------------------------------------------------------------------------
-- 6.8 Alertas de acesso anormal
-- ---------------------------------------------------------------------------
create table if not exists alertas_seguranca (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  email text,
  tipo text not null check (tipo in ('novo_aparelho', 'novo_local', 'excesso_falhas', 'entrada_apos_falhas', 'recuperacao_equipe')),
  severidade text not null default 'media' check (severidade in ('baixa', 'media', 'alta')),
  detalhe jsonb,
  ip text,
  agente text,
  notificado boolean not null default false,
  visto_por uuid,
  visto_em timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_alertas_seguranca_data on alertas_seguranca (created_at desc);
create index if not exists idx_alertas_seguranca_abertos on alertas_seguranca (created_at desc) where visto_em is null;
create index if not exists idx_alertas_seguranca_email on alertas_seguranca (email, tipo, created_at desc);
alter table alertas_seguranca enable row level security;

-- só "visto" e "notificado" mudam; o conteúdo do alerta não
create or replace function fn_alerta_so_visto() returns trigger language plpgsql as $$
begin
  if current_setting('arini.descarte_autorizado', true) = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'DELETE' then
    if pg_trigger_depth() > 1 then return old; end if;
    raise exception 'Alerta de segurança não pode ser apagado.' using errcode = 'insufficient_privilege';
  end if;
  if (to_jsonb(new) - 'visto_por' - 'visto_em' - 'notificado') is distinct from
     (to_jsonb(old) - 'visto_por' - 'visto_em' - 'notificado') then
    raise exception 'Alerta de segurança: só "visto" e "notificado" podem mudar.' using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;
drop trigger if exists trg_alertas_so_visto on alertas_seguranca;
create trigger trg_alertas_so_visto before update or delete on alertas_seguranca
  for each row execute function fn_alerta_so_visto();

-- ---------------------------------------------------------------------------
-- 6.13 Revisão periódica de permissões
-- ---------------------------------------------------------------------------
create table if not exists revisoes_acesso (
  id uuid primary key default gen_random_uuid(),
  revisado_por uuid not null,
  observacoes text,
  resumo jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_revisoes_acesso_data on revisoes_acesso (created_at desc);
alter table revisoes_acesso enable row level security;

-- ---------------------------------------------------------------------------
-- 6.12 Gatilhos de somente-inserção nos registros
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['audit_log', 'auth_events', 'access_attempts', 'property_events', 'consultas_area_log',
                           'document_access_log', 'descartes_log', 'revisoes_acesso'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists trg_%s_somente_insercao on %I', t, t);
      execute format('create trigger trg_%s_somente_insercao before update or delete on %I
                      for each row execute function fn_log_somente_insercao()', t, t);
      execute format('drop trigger if exists trg_%s_sem_truncate on %I', t, t);
      execute format('create trigger trg_%s_sem_truncate before truncate on %I
                      for each statement execute function fn_log_somente_insercao()', t, t);
    end if;
  end loop;
end $$;

-- funções novas: só o servidor (a 0026 já faz isso por padrão; aqui fica explícito)
do $$
declare f text;
begin
  foreach f in array array['fn_descarte_candidatos(integer,integer,integer)',
                           'fn_descarte_aplicar(text[],integer,integer,integer,uuid)',
                           'fn_descarte_simular(integer,integer,integer,uuid)'] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

-- ===========================================================================
-- 6.2 Revisão de segurança das APIs — achados no banco (07/10/2026)
-- ===========================================================================

-- CRÍTICO: o cadastro direto no Auth (POST /auth/v1/signup com a chave
-- pública, que está no navegador) está aberto, e o gatilho criava o perfil com
-- o papel que viesse em user_metadata — inclusive "admin_central". Qualquer um
-- virava Diretoria. Agora papel de equipe só vem de app_metadata (que só o
-- servidor grava) e, na falta dele, a conta nasce "comprador"; a rota
-- /api/admin/usuarios já grava o papel no perfil logo depois de criar a conta.
-- Os papéis públicos (proprietário, corretor…) continuam vindo do cadastro.
-- Recomendação adicional em docs/SEGURANCA.md: desligar "Allow new users to
-- sign up" no painel do Supabase (o cadastro do site usa a API administrativa).
create or replace function fn_handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_pedido text := coalesce(new.raw_app_meta_data->>'role', new.raw_user_meta_data->>'role');
  v_role user_role := 'comprador';
begin
  begin
    v_role := coalesce(v_pedido::user_role, 'comprador');
  exception when others then
    v_role := 'comprador';
  end;
  if v_role in ('admin_central', 'analista_arini')
     and coalesce(new.raw_app_meta_data->>'role', '') <> v_role::text then
    v_role := 'comprador';
  end if;
  insert into public.profiles (user_id, nome, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'nome', ''), v_role)
  on conflict (user_id) do nothing;
  return new;
end $$;

-- ALTO: escrita direta pela API pública (PostgREST com a sessão do usuário).
-- Toda gravação do sistema passa pelas rotas do servidor (service_role); estas
-- policies sobravam da F0 e permitiam, sem passar pelas regras das rotas:
--  · criar o próprio cadastro de proprietário/parceiro já "aprovado" e então
--    inserir e PUBLICAR imóvel sem a Matriz (p_*_insert, p_properties_*);
--  · marcar o próprio documento como conferido, trocar storage_path para o
--    arquivo de outro imóvel, alterar aceite/selfie da autorização;
--  · alterar oportunidade, proposta, visita, contrato e histórico.
-- Passam a ser só leitura (mesmo filtro de antes); a escrita é do servidor.
drop policy if exists p_owners_insert on owners;
drop policy if exists p_partners_insert on partners;
drop policy if exists p_properties_insert on properties;
drop policy if exists p_properties_update on properties;
drop policy if exists p_opps_insert on opportunities;
drop policy if exists p_opps_write on opportunities;

do $$
declare r record;
begin
  for r in
    select * from (values
      ('property_documents', 'p_docs_rw', 'fn_property_editable_id(property_id)'),
      ('property_authorizations', 'p_auth_rw', 'fn_property_editable_id(property_id)'),
      ('property_geometries', 'p_geometries_write', 'fn_property_editable_id(property_id)'),
      ('property_media', 'p_media_write', 'fn_property_editable_id(property_id)'),
      ('contracts', 'p_contracts', 'fn_opp_visible_id(opportunity_id)'),
      ('proposals', 'p_proposals', 'fn_opp_visible_id(opportunity_id)'),
      ('visits', 'p_visits', 'fn_opp_visible_id(opportunity_id)'),
      ('opportunity_events', 'p_opp_events', 'fn_opp_visible_id(opportunity_id)'),
      ('partner_documents', 'p_partner_docs',
       'fn_is_arini() or exists (select 1 from partners pa where pa.id = partner_documents.partner_id and pa.profile_id = auth.uid())')
    ) as t(tabela, politica, filtro)
  loop
    execute format('drop policy if exists %I on %I', r.politica, r.tabela);
    execute format('drop policy if exists %I on %I', r.politica || '_leitura', r.tabela);
    execute format('create policy %I on %I for select using (%s)', r.politica || '_leitura', r.tabela, r.filtro);
  end loop;
end $$;

-- MÉDIO: o próprio usuário podia alterar pela API pública colunas que não são
-- dele: setores (membro da equipe se dava acesso a outro setor), ativo (conta
-- desativada se reativava), CPF, aceite dos termos. Agora só nome, telefone,
-- foto e preferências mudam por ali — o resto, só pelo servidor.
drop policy if exists p_profiles_self_update on profiles;
create policy p_profiles_self_update on profiles for update
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and (to_jsonb(profiles) - array['nome', 'telefone', 'avatar_url', 'preferencias', 'updated_at'])
      = (select to_jsonb(p2) - array['nome', 'telefone', 'avatar_url', 'preferencias', 'updated_at']
         from profiles p2 where p2.user_id = auth.uid())
  );

-- MÉDIO: qualquer conta logada subia QUALQUER arquivo (inclusive HTML) direto
-- no bucket público `media`, sem limite. Os envios legítimos do navegador usam
-- URL de envio assinada pelo servidor (vídeo), que não depende desta policy
-- (testado em 07/10: envio por token funciona sem ela); fotos sobem pelo servidor.
drop policy if exists media_auth_insert on storage.objects;
