-- Arini Imóveis Brasil — migration 0044: os 3 imóveis de demonstração ainda
-- tinham o código do nome antigo (ARINI-MAP-00000x). Passam para o padrão
-- novo, com o mesmo número (a sequência já está bem acima de 3, sem colisão).
-- Links antigos /imovel/ARINI-MAP-… e /i/ARINI-MAP-… continuam funcionando:
-- a página redireciona para o código novo.
update properties
   set codigo = 'AIB-' || substring(codigo from 'ARINI-MAP-(\d{6})$')
 where codigo ~ '^ARINI-MAP-\d{6}$'
   and not exists (
     select 1 from properties p2 where p2.codigo = 'AIB-' || substring(properties.codigo from 'ARINI-MAP-(\d{6})$')
   );
