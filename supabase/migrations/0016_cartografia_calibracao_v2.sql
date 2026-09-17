-- Arini Imóveis Brasil — migration 0016: calibração afim e seleção de camadas CAD.
--
-- A calibração da 0012 só movia a planta (offset leste/norte). Duas coisas
-- apareceram nas plantas reais que a translação não resolve:
--
--   1. ROTAÇÃO E ESCALA. Planta amarrada por um único ponto de referência
--      fecha o centro e abre nas pontas. Dois pontos de controle (o operador
--      clica o mesmo cruzamento na planta e no satélite) resolvem deslocamento,
--      giro e escala de uma vez — o ajuste afim que a arquitetura previa.
--
--   2. CAMADAS DE CAD QUE NÃO SÃO CADASTRO. O DXF de Iturama (103 MB) trouxe
--      projeto paisagístico junto: VEGET_I com 25.074 linhas, FORRAÇÃO04 com
--      21.103, Paisagismo com 15.785. Desenhar árvore sobre o satélite polui o
--      mapa e pesa no navegador. `layers_ocultos` deixa o operador escolher o
--      que vai ao ar, sem reenviar o arquivo — o original fica no storage.

alter table cartography_layers
  add column if not exists rotacao_graus numeric not null default 0,
  add column if not exists escala numeric not null default 1,
  add column if not exists pontos_controle jsonb,
  add column if not exists layers_ocultos text[] not null default '{}',
  add column if not exists diagnostico jsonb,
  add column if not exists bytes bigint;

comment on column cartography_layers.rotacao_graus is
  'giro aplicado à planta, em graus, no sentido anti-horário, em torno do centro';
comment on column cartography_layers.escala is
  'fator de escala aplicado à planta em torno do centro (1 = original)';
comment on column cartography_layers.pontos_controle is
  'pares [{planta:[lng,lat], satelite:[lng,lat]}] usados na calibração por 2 pontos';
comment on column cartography_layers.layers_ocultos is
  'nomes de layer do CAD que não vão ao mapa (vegetação, paisagismo, cotas)';
comment on column cartography_layers.diagnostico is
  'resumo da conversão: entidades por tipo, layers, pontos descartados, zona UTM';

-- Referência do município para conferir se a planta caiu no lugar certo.
-- Sem isso, uma planta na zona UTM errada é publicada silenciosamente e só
-- aparece quando alguém abre o mapa e não acha a cidade.
create or replace function fn_municipio_referencia(p_municipality_id uuid)
returns json language sql stable as $$
  select json_build_object(
    'nome', m.nome,
    'uf', m.uf,
    'lng', st_x(coalesce(m.sede, st_centroid(m.geom))),
    'lat', st_y(coalesce(m.sede, st_centroid(m.geom))),
    'tem_geom', m.geom is not null
  )
  from municipalities m
  where m.id = p_municipality_id;
$$;

comment on function fn_municipio_referencia is
  'Sede (ou centroide) do município em graus, para validar o enquadramento da planta enviada.';

notify pgrst, 'reload schema';
