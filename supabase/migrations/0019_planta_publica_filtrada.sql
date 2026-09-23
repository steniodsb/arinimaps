-- Arini Imóveis Brasil — migration 0019: versão pública da planta, já filtrada.
--
-- Medido em 17/09/2026: Iturama baixava 19,3 MB no zoom da cidade e o navegador
-- descartava 41% (camadas de paisagismo escondidas na calibração). Ao salvar a
-- seleção de camadas, o servidor passa a gravar um GeoJSON sem elas.
--
-- publico_centro: centro do arquivo COMPLETO. Giro e escala são aplicados em
-- volta dele; medir o centro no arquivo filtrado moveria a planta calibrada.

alter table cartography_layers
  add column if not exists publico_path text,
  add column if not exists publico_bytes bigint,
  add column if not exists publico_centro jsonb;
