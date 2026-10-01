-- Arini Maps — migration 0026: fecha as funções do banco para quem não é o servidor.
--
-- ACHADO DA AUDITORIA DE 01/10/2026. O Postgres dá EXECUTE a PUBLIC em toda
-- função nova, e a API do Supabase expõe as funções do schema `public` como
-- /rpc/<nome>. Resultado: 34 funções SECURITY DEFINER — que rodam com poder de
-- dono e ignoram a RLS — podiam ser chamadas por qualquer visitante com a chave
-- pública (que vai no JavaScript do site). Entre elas:
--   · fn_registrar_venda      → registrar uma venda e gerar comissão;
--   · fn_upsert_geometry      → trocar a divisa de qualquer imóvel;
--   · fn_financeiro_mensal    → ler a receita da empresa;
--   · fn_inserir_municipio, fn_car_upsert, fn_gerar_faturas, fn_rate_limit…
-- A RLS das tabelas estava certa; o buraco era por fora dela.
--
-- O aplicativo só chama essas funções pelo servidor (service_role), então
-- fechar não muda nada no uso. Ficam abertas apenas as sete funções que as
-- policies de RLS consultam — elas precisam rodar com o papel de quem está
-- fazendo a consulta, e só respondem "este usuário pode ver esta linha?".

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
    if f.proname in ('fn_is_arini', 'fn_role', 'fn_property_visible', 'fn_property_visible_id',
                     'fn_property_editable_id', 'fn_opp_visible', 'fn_opp_visible_id') then
      execute format('grant execute on function %s to anon, authenticated', f.assinatura);
    end if;
  end loop;
end $$;

-- função criada daqui em diante já nasce fechada: quem precisar abrir, abre de propósito
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon, authenticated;
alter default privileges in schema public grant execute on functions to service_role;

-- a tabela de controle das migrations estava sem RLS e, portanto, legível e
-- gravável pela API pública
alter table _migrations enable row level security;
