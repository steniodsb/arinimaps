# CAR — importação manual das camadas ambientais

Atende o item 1 do levantamento de fontes do Carlos (22/10/2026) e a pendência 3.5.

APP, reserva legal, vegetação nativa e área consolidada **não têm serviço público de consulta**.
O serviço do SICAR só publica o perímetro dos imóveis; os temas saem da base de downloads, um
município por vez e com CAPTCHA (sondagem de 07/10/2026, `docs/FONTES.md`). A equipe baixa o
arquivo à mão e importa na Central. O sistema não resolve o CAPTCHA, e não vai resolver.

Tela: **Central › Cartografia e dados › CAR: importação e cobertura** (`/admin/car`), setor Cartografia.

---

## 1. Procedimento da equipe

1. Abra a base de downloads do SICAR: https://consultapublica.car.gov.br/publico/estados/downloads
2. Escolha o estado e o município e baixe os temas. Pode baixar o zip completo do município ou
   um zip por tema (APP, RESERVA_LEGAL, VEGETACAO_NATIVA, AREA_CONSOLIDADA, AREA_IMOVEL…).
   Resolva o CAPTCHA normalmente. **Não abra nem altere os arquivos.**
3. Na Central, em *Importar arquivo do SICAR*, escolha o(s) zip(s). Pode selecionar vários juntos.
4. Confira a pré-visualização:
   - cada camada aparece com o **tema reconhecido**, a quantidade de polígonos e a projeção;
     camada com tema "não reconhecido" é ignorada;
   - o **município** vem do código dos imóveis do arquivo. Se não vier, digite o código IBGE de 7 dígitos;
   - se o município já tiver base, a tela avisa. Os temas do arquivo novo substituem os antigos,
     e a versão anterior fica no histórico.
5. Informe a **data em que baixou o arquivo**. Ela aparece como "base de …" no relatório e no painel.
6. Clique em **Importar**. Não feche a aba até a barra terminar; um município leva de segundos a
   poucos minutos.
7. Leia o resumo. Se houver recusados, abra a **ficha da importação** para ver cada polígono
   recusado, com o registro do shapefile e o motivo.

Se o envio parar no meio (queda de internet, aba fechada), a importação fica como
"em envio / interrompida" e **não passa a valer**. Abra a ficha, clique em *Descartar importação*
e importe de novo.

### Com que frequência

O SICAR não avisa quando um município muda. Sugestão até o Carlos decidir: municípios do piloto
uma vez por mês; os demais conforme a demanda de consultas (o painel mostra a data da base de cada um).

### Ampliar a cobertura para o Brasil

O painel lista, por estado, os municípios **pendentes** (lista oficial do IBGE: 5.571). A ordem
sugerida é: municípios do piloto, depois os vizinhos, depois os municípios com mais consultas.
Não existe hoje caminho oficial para baixar o Brasil inteiro de uma vez (ver §4).

---

## 2. O que o sistema faz com o arquivo

| Etapa | Onde | O quê |
|---|---|---|
| Leitura | navegador (`src/lib/geo/shapefileCar.ts`) | Abre o zip, inclusive zips dentro de zips. Lê `.shp` e `.dbf` (UTF-8 ou Latin-1 pelo `.cpg`) e reprojeta pelo `.prj` (UTM e outras). Sem `.prj`, lê como SIRGAS 2000 em graus. O tema vem do nome do arquivo |
| Envio | `POST /api/admin/car/importacoes` e `…/[id]/lote` | Polígonos em lotes de até 400 (~1,5 MB). O arquivo inteiro nunca sobe |
| Validação | banco (`fn_car_importacao_lote`) | Cada polígono separadamente: tipo, geometria (corrige autointerseção), dentro do Brasil. Uma falha não derruba o lote; vira registro em `car_importacao_falhas` |
| Duplicidade | banco | O mesmo imóvel, tema e geometria repetidos no arquivo entram uma vez só. O mesmo arquivo (SHA-256) para o mesmo município é recusado, a menos que se marque "importar mesmo assim" |
| Conclusão | `…/[id]/concluir` | Os temas que vieram no arquivo passam a valer. A versão anterior do mesmo município e tema fica guardada (`vigente = false`). Os temas que não vieram continuam como estavam. O limite do município vem do IBGE |

Código de imóvel de outro município **não é erro**: o SICAR guarda o município da inscrição, e um
imóvel na divisa aparece no arquivo do vizinho (4 de 1.543 em Iturama).

### Tabelas (migration 0050)

- `car_importacoes`: uma por arquivo, com município, arquivo, SHA-256, data da base, quem importou,
  contagens por tema, avisos da leitura e situação (`enviando`, `concluida`, `com_falhas`, `falhou`, `descartada`).
- `car_temas`: os polígonos, com `vigente`. Inclui o histórico das versões anteriores.
- `car_importacao_falhas`: cada polígono recusado, com o motivo.
- `car_cobertura`: um registro por município importado, com data da base, temas, limite do IBGE e
  a última importação.

Importação concluída não se apaga pela tela: ela é o histórico do município.

---

## 3. Onde o dado aparece

- **Relatório e consultas** (área do CAR, lote, área desenhada): a fonte "Camadas ambientais do CAR"
  mostra a área de cada tema dentro da área consultada, com a origem (SFB/SICAR, arquivo importado)
  e a data da base. Se a área só tem parte em município importado, aparece "Cobertura parcial: N%".
  Se não tem nada importado, a fonte sai como **"ainda não importado"**, nunca como "nada encontrado".
- **Painel de cobertura** (`/admin/car`): municípios com dados, pendentes, última importação,
  importações com falha nos últimos 30 dias, a tabela por estado e a lista de municípios de cada estado.
- Função `fn_car_ambiental_imovel(cod)`: os temas declarados de um imóvel, pronta para o cartão do
  CAR no mapa (ainda não ligada à tela).

---

## 4. Alternativas oficiais ao download por município (item 1.8)

| Caminho | Situação |
|---|---|
| Serviço de mapas do SICAR (`geoserver.car.gov.br`) | Só o perímetro (`sicar_imoveis_<uf>`); os temas testados não existem (07/10/2026) |
| ArcGIS do IBAMA (`CAR_NACIONAL`) | Só "Área do Imóvel" |
| Base de downloads por estado | Exige CAPTCHA por município; não há arquivo nacional |
| **Pedido formal ao Serviço Florestal Brasileiro** | Ofício ou Lei de Acesso à Informação pedindo a base nacional dos temas, ou um acordo de cooperação, como já foi feito com o INCRA. **Recomendado; depende do Carlos** |
| Serviços comerciais que revendem o download por imóvel | Existem (ex.: APIs pagas de consulta ao SICAR), mas não são fonte oficial; só com avaliação de custo e do jurídico |
