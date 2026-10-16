-- Arini Imóveis Brasil — migration 0046: funções fechadas de verdade, setor na RLS
-- (testes de segurança 9.5, 15/10/2026).
--
-- 1. FUNÇÕES (crítico). A 0026 fechou as funções existentes e tentou fazer as
--    novas nascerem fechadas com `alter default privileges IN SCHEMA public
--    revoke ... from public`. Isso não tem efeito: o EXECUTE de PUBLIC em
--    função é um privilégio padrão GLOBAL, e o padrão por schema só acrescenta.
--    Resultado: toda função criada depois da 0026 nasceu executável pela API
--    pública (/rest/v1/rpc), inclusive SECURITY DEFINER como
--    fn_upsert_geometry (troca a divisa de qualquer imóvel), fn_validar_geometria
--    e fn_cart_request_transicao. O app só chama funções pelo servidor
--    (service_role); ficam abertas apenas as que as policies consultam.
--
-- 2. SETOR NA RLS (médio). Várias policies davam leitura e ESCRITA a qualquer
--    membro da equipe (fn_is_arini), sem olhar o setor: pela API pública,
--    alguém do Suporte aprovava parceiro, mexia em fatura ou lia todos os leads.
--    Toda gravação do sistema passa pelo servidor (conferido no código em
--    15/10: nenhuma tela ou rota grava nessas tabelas com a sessão do usuário),
--    então as policies de escrita saem e a leitura passa a exigir o setor.
--
-- 3. consultas_rurais (médio): estava legível por qualquer um (`true`), com o
--    relatório territorial de imóvel em rascunho/análise. Agora segue o imóvel.
--
-- 4. Bucket `media` (baixo): a policy de leitura permitia LISTAR o bucket
--    (ids de imóveis em rascunho); a de apagar deixava qualquer membro da
--    equipe apagar mídia. O acesso público aos arquivos não depende de policy
--    (bucket público) e o servidor apaga com a service_role.

-- ---------------------------------------------------------------- 1. funções
alter default privileges for role postgres revoke execute on functions from public;
alter default privileges for role postgres revoke execute on functions from anon, authenticated;
alter default privileges for role postgres grant execute on functions to service_role;

-- setor do usuário logado (diretoria atua em todos) — usado pelas policies abaixo
create or replace function fn_tem_setor(p_setor text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles
    where user_id = auth.uid()
      and coalesce(ativo, true)
      and (role = 'admin_central' or (role = 'analista_arini' and p_setor = any(setores)))
  );
$$;

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as assinatura, p.proname
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'fn\_%'
      and pg_get_userbyid(p.proowner) = current_user
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.assinatura);
    execute format('grant execute on function %s to service_role', f.assinatura);
    if f.proname in ('fn_is_arini', 'fn_role', 'fn_tem_setor', 'fn_property_visible', 'fn_property_visible_id',
                     'fn_property_editable_id', 'fn_opp_visible', 'fn_opp_visible_id') then
      execute format('grant execute on function %s to anon, authenticated', f.assinatura);
    end if;
  end loop;
end $$;

-- ------------------------------------------------- 2. escrita só pelo servidor
-- remove TODA policy de escrita (ALL/INSERT/UPDATE/DELETE) destas tabelas,
-- qualquer que seja o nome; a leitura é recriada abaixo, com setor
do $$
declare p record;
begin
  for p in
    select tablename, policyname from pg_policies
    where schemaname = 'public' and cmd in ('ALL', 'INSERT', 'UPDATE', 'DELETE')
      and tablename in ('leads', 'owners', 'partners', 'invoices', 'subscriptions', 'presentations',
                        'regions', 'municipalities', 'cartography_layers', 'commissions', 'sales',
                        'settings', 'profiles')
      and not (tablename = 'profiles' and cmd = 'UPDATE')   -- o próprio usuário: nome, telefone, foto (0036)
  loop
    execute format('drop policy %I on %I', p.policyname, p.tablename);
  end loop;
end $$;

-- ------------------------------------------------- 2b. leitura com setor
-- leitura da equipe que antes vinha das policies ALL removidas
create policy invoices_financeiro_select on invoices for select using (fn_tem_setor('financeiro'));
create policy subscriptions_financeiro_select on subscriptions for select using (fn_tem_setor('financeiro'));
create policy commissions_financeiro_select on commissions for select using (fn_tem_setor('financeiro'));
create policy presentations_equipe_select on presentations for select using (fn_is_arini());
-- profiles: a leitura da equipe continua na policy SELECT existente (próprio usuário ou equipe)

-- leitura que era de qualquer membro da equipe passa a exigir o setor
do $$
declare p record;
begin
  for p in
    select tablename, policyname from pg_policies
    where schemaname = 'public' and cmd = 'SELECT' and qual = 'fn_is_arini()'
      and tablename in ('leads', 'audit_log', 'sales', 'settings', 'demandas', 'demanda_matches', 'favoritos')
  loop
    execute format('drop policy %I on %I', p.policyname, p.tablename);
  end loop;
end $$;

create policy leads_setor_select on leads for select
  using (fn_tem_setor('comercial') or fn_tem_setor('marketing'));
create policy audit_log_setor_select on audit_log for select
  using (fn_tem_setor('seguranca') or fn_tem_setor('diretoria'));
create policy sales_setor_select on sales for select
  using (fn_tem_setor('financeiro') or fn_tem_setor('comercial'));
create policy settings_diretoria_select on settings for select using (fn_tem_setor('diretoria'));
create policy demandas_comercial_select on demandas for select using (fn_tem_setor('comercial'));
create policy demanda_matches_comercial_select on demanda_matches for select using (fn_tem_setor('comercial'));
create policy favoritos_setor_select on favoritos for select
  using (fn_tem_setor('comercial') or fn_tem_setor('marketing'));

-- ------------------------------------------------- 3. consultas_rurais
do $$
declare p record;
begin
  for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'consultas_rurais'
  loop
    execute format('drop policy %I on consultas_rurais', p.policyname);
  end loop;
end $$;
create policy consultas_rurais_select on consultas_rurais for select
  using (fn_property_visible_id(property_id) or fn_property_editable_id(property_id));

-- ------------------------------------------------- 4. bucket media
drop policy if exists media_public_read on storage.objects;
drop policy if exists media_owner_delete on storage.objects;
