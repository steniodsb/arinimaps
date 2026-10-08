-- Cotas de perguntas ao assistente de IA por plano (08/10/2026, docs/INFRA-NACIONAL.md §5).
--
-- Até aqui só os planos gratuitos tinham `mensagens_ia_mes` (20, migration 0034);
-- os pagos ficavam sem cota — ou seja, ilimitados. Para preparar muitos acessos
-- simultâneos todo plano passa a ter um teto mensal: a conta da Anthropic tem
-- limite de chamadas por minuto, e uma única conta sem teto poderia consumi-lo.
-- A rota /api/ia/chat lê esta chave (src/lib/ia/acesso.ts → limiteMensalIa);
-- a equipe da Matriz continua sem limite.
--
-- `||` só troca a chave `mensagens_ia_mes`: as outras cotas do jsonb
-- (consultas_area_mes, imoveis_ativos…) ficam como estão.

update plans p
   set cotas = coalesce(p.cotas, '{}'::jsonb) || jsonb_build_object('mensagens_ia_mes', v.limite),
       updated_at = now()
  from (values
    ('consulta_basica', 20),
    ('anunciante', 50),
    ('consulta_profissional', 300),
    ('parceiro', 500),
    ('organizacao', 2000),
    ('franquia', 2000)
  ) as v(plano, limite)
 where p.id = v.plano;
