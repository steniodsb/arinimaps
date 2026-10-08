-- Camadas oficiais desenhadas no mapa (08/10/2026): SIGEF, embargos do IBAMA,
-- mineração (ANM), terras indígenas, unidades de conservação, quilombolas e
-- desmatamento (PRODES), no Brasil inteiro.
--
-- O mapa pede a camada por janela; o servidor divide a janela em células
-- (tiles de zoom fixo por camada) e busca no órgão só a célula que não está
-- aqui ou venceu. Assim os serviços do governo — que caem com frequência —
-- são consultados uma vez por célula no prazo de validade, não a cada
-- movimento de cada usuário, e uma queda do órgão não apaga o que já foi visto.

create table if not exists camadas_celulas (
  camada text not null,
  z integer not null,
  x integer not null,
  y integer not null,
  buscado_em timestamptz not null default now(),
  quantidade integer not null default 0,
  -- FeatureCollection já simplificada, só com os campos públicos do cartão
  geojson jsonb,
  erro text,
  primary key (camada, z, x, y)
);

comment on table camadas_celulas is
  'Cache por célula das camadas oficiais do mapa (src/lib/geo/camadasMapa.ts). Só o servidor lê e grava.';

create index if not exists idx_camadas_celulas_buscado on camadas_celulas (buscado_em);

alter table camadas_celulas enable row level security;
revoke all on camadas_celulas from anon, authenticated;
