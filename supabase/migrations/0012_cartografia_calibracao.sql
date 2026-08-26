-- Arini Imóveis Brasil — migration 0012: calibração da planta sobre o mapa.
--
-- Planta de prefeitura raramente vem em SIRGAS 2000: SAD69 desloca ~66 m e
-- Córrego Alegre ~53 m no Pontal do Triângulo. Além do datum, a imagem de
-- satélite também tem erro próprio. Guardamos o datum usado e um ajuste fino
-- em metros para o operador alinhar no olho — foi o que o cliente descreveu
-- ("mover até bater o centro de referência").

alter table cartography_layers
  add column if not exists datum text not null default 'sirgas',
  add column if not exists offset_leste_m numeric not null default 0,
  add column if not exists offset_norte_m numeric not null default 0;

comment on column cartography_layers.datum is 'sirgas | sad69 | corrego — datum de origem do CAD';
comment on column cartography_layers.offset_leste_m is 'ajuste fino aplicado ao servir a camada (metros)';
