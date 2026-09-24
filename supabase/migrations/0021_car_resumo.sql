-- Arini Imóveis Brasil — migration 0021: resumo da malha do CAR por município
-- (tela Admin › Regiões mostra quantos imóveis há e quando foi a última importação).
create or replace function fn_car_resumo() returns json
language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(r order by r.municipio), '[]'::json) from (
    select m.nome as municipio, m.codigo_ibge,
           count(c.cod_imovel) as imoveis,
           max(c.importado_em) as importado_em
    from municipalities m
    left join car_imoveis c on c.cod_ibge = m.codigo_ibge::integer
    group by m.nome, m.codigo_ibge
  ) r
$$;
