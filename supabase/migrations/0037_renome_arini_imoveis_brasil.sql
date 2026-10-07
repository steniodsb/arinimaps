-- Arini Imóveis Brasil — migration 0037: o sistema deixa de se chamar
-- "Arini Maps" (decisão do Carlos, 08/10/2026). Domínio: ariniimoveisbrasil.com.br.
--
-- · Códigos de anúncio novos saem como AIB-000010 (mesma sequência). Os
--   antigos (ARINI-MAP-…) continuam válidos: o código é só texto único.
-- · Textos já gravados no banco que citam o nome antigo.
-- · Os e-mails de login (@arinimaps.com.br) NÃO mudam aqui: trocar o login de
--   quem já usa o sistema o trancaria fora. Troca-se pela tela de conta.

create or replace function fn_next_property_codigo() returns text language sql as
  $$ select 'AIB-' || lpad(nextval('property_codigo_seq')::text, 6, '0') $$;

-- base de conhecimento da IA: o gatilho de versão guarda o texto anterior
update kb_artigos
   set titulo = replace(replace(titulo, 'Arini Maps', 'Arini Imóveis Brasil'), 'arinimaps.com.br', 'ariniimoveisbrasil.com.br'),
       conteudo = replace(replace(conteudo, 'Arini Maps', 'Arini Imóveis Brasil'), 'arinimaps.com.br', 'ariniimoveisbrasil.com.br')
 where titulo ilike '%arini maps%' or conteudo ilike '%arini maps%' or conteudo ilike '%arinimaps.com.br%';

update plans set descricao = replace(descricao, 'Arini Maps', 'Arini Imóveis Brasil') where descricao ilike '%arini maps%';
update fontes_externas set ficha = replace(ficha::text, 'Arini Maps', 'Arini Imóveis Brasil')::jsonb where ficha::text ilike '%arini maps%';
update settings set valor = to_jsonb(replace(valor #>> '{}', 'Arini Maps', 'Arini Imóveis Brasil'))
 where jsonb_typeof(valor) = 'string' and valor #>> '{}' ilike '%arini maps%';
