-- CAR sob demanda (08/10/2026): a malha do CAR no mapa passa a ser nacional.
-- A base regional continua importada por município (scripts/importa-car.mjs);
-- fora dela, quando alguém aproxima o mapa, o servidor busca o CAR daquela
-- janela no SICAR e grava em car_imoveis. Esta tabela anota quais células já
-- foram buscadas e quando, para não perguntar ao SICAR de novo a cada visita.
--
-- Célula = tile z11 da grade Web Mercator (~19 km de lado no Brasil).

create table if not exists car_celulas (
  z integer not null,
  x integer not null,
  y integer not null,
  buscado_em timestamptz not null default now(),
  quantidade integer not null default 0,
  erro text,
  primary key (z, x, y)
);

comment on table car_celulas is
  'Células (tiles z11) cujo CAR já foi buscado no SICAR sob demanda. Só o servidor lê e grava.';

-- só o servidor (service role) usa; nenhum acesso pelo navegador
alter table car_celulas enable row level security;
revoke all on car_celulas from anon, authenticated;
