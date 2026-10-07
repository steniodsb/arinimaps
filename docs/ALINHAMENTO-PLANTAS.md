# Alinhamento das plantas urbanas com o satélite (roadmap 2.6)

Medição de 07/10/2026 com `scripts/confere-alinhamento.mjs` (rodar de novo:
`node scripts/confere-alinhamento.mjs --json saida.json`).

## Como foi medido

Ninguém olhou quadra a quadra: o script **mede**. As ruas do OpenStreetMap foram
traçadas sobre imagem de satélite; na planta, a rua é o vão entre as frentes dos
lotes dos dois lados. Se a planta está no lugar, o eixo da rua do OSM passa no
meio desse vão.

1. Ruas do OSM (Overpass) no retângulo dos lotes de cada planta.
2. Um ponto a cada 15 m em cada trecho reto de rua (≥ 20 m, a 8 m das pontas).
3. Em cada ponto, uma linha de ±25 m perpendicular à rua: a primeira divisa de
   lote de cada lado dá as distâncias *a* e *b*. Só vale se o vão *a + b* fica
   entre 6 e 40 m (praça, esquina e rua sem lote ao lado ficam de fora).
4. O desvio naquele ponto é *(a − b) / 2*, na direção perpendicular à rua.
5. Por célula de 500 m × 500 m, o vetor de deslocamento (leste, norte) sai por
   mínimos quadrados — ruas em várias direções resolvem as duas componentes — com
   um corte de discrepantes (> 2,5 σ).

**Leitura do vetor:** é quanto a *planta* (já com a calibração atual) está
deslocada em relação ao OSM. Para corrigir, some **o contrário** do vetor à
calibração. σ é o espalhamento das amostras na célula: σ grande = planta e OSM
discordam de forma irregular (traçado do OSM, rua desenhada torta, loteamento
que não foi executado como projetado), não um deslocamento único.

**Limites.** O OSM tem erro próprio de 2 a 5 m e pode ter sido traçado sobre
outra imagem que não a do mapa (Esri Wayback 2025-10-23). Por isso, desvio
abaixo de ~4 m é ruído de medição. Prédios do OSM seriam um teste melhor, mas
são raros na região (Iturama 160, União de Minas 82; Limeira do Oeste tem
2.085) — as ruas, ao contrário, estão bem mapeadas (Iturama 937 trechos,
Limeira 267, União 47) e foram a base da medição. Não há bairros nomeados no
OSM da região; em Iturama a coluna "referência" é o texto de bairro/rua da
própria planta mais próximo do centro da célula.

## Resumo por cidade

| Cidade | Calibração atual (L, N) | Amostras | Deslocamento da cidade inteira | Mediana por célula | Situação |
|---|---|---|---|---|---|
| Iturama | −25,0 m, +12,4 m | 9.943 | 0,6 m (L −0,2, N +0,6), σ 4,3 m | 3,1 m | **No lugar no geral**; desvios locais de 5–11 m no norte da cidade (abaixo) |
| Limeira do Oeste | 0, 0 (datum SAD 69 convertido) | 1.242 | 1,0 m (L +0,7, N −0,8), σ 5,2 m | 4,3 m | **No lugar**; nada acima do ruído com amostra suficiente |
| União de Minas | −10 m, −10 m | 491 | **5,9 m (L +5,8, N −1,0)**, σ 7,0 m | 6,8 m | **Recalibrar**: planta ~6–8 m a leste no centro |

## Onde recalibrar

### União de Minas — deslocamento consistente para leste

Quatro das sete células apontam a mesma coisa: a planta está 7 a 8 m **a leste**
do OSM no centro e no oeste da cidade.

| Célula (centro) | Amostras | Leste | Norte | Desvio | σ |
|---|---|---|---|---|---|
| −19,52758, −50,33556 | 78 | +7,8 | +1,2 | 7,9 m L | 6,1 |
| −19,52796, −50,33064 | 54 | +7,3 | +2,5 | 7,7 m L | 6,9 |
| −19,52713, −50,33868 | 44 | +7,0 | −1,6 | 7,2 m L | 5,2 |
| −19,53136, −50,33081 | 116 | +6,7 | +1,3 | 6,8 m L | 7,2 |
| −19,52978, −50,32633 | 38 | −4,3 | −4,1 | 5,9 m SO | 3,2 |
| −19,53368, −50,33087 | 22 | −0,9 | +5,3 | 5,4 m N | 7,0 |
| −19,53122, −50,33468 | 138 | +4,1 | −3,1 | 5,2 m SE | 6,7 |

**Ação sugerida:** em Admin › Cartografia, conferir sobre o satélite e, se
confirmar, levar a calibração de (−10, −10) para cerca de **(−16, −9)** — e então
`node scripts/gera-lotes.mjs` e `node scripts/numera-lotes.mjs` (União só tem
DWG; a numeração depende do DXF). O σ alto (6–7 m) indica que parte do desvio
é irregular: vale usar o ajuste por pontos de controle (2+ cantos de quadra) em
vez de só arrastar.

### Iturama — desvios locais (a cidade, no todo, está no lugar)

O deslocamento geral é de 0,6 m: a calibração (−25, +12,4) está certa para a
cidade. Mas células vizinhas no norte apontam em direções diferentes, o que não
se corrige com um arrasto único — é distorção local da planta (loteamento
desenhado à parte e encaixado) ou traçado irregular do OSM. Células com desvio
≥ 5 m, amostra ≥ 50 e σ ≤ 4,5 m (as mais confiáveis):

| Referência na planta | Centro (lat, lng) | Amostras | Leste | Norte | Desvio | σ |
|---|---|---|---|---|---|---|
| Rua San Marino (norte) | −19,71577, −50,19096 | 159 | +0,3 | +7,9 | 7,9 m N | 3,6 |
| Jardim América | −19,72132, −50,20001 | 102 | +5,9 | +4,6 | 7,5 m NE | 2,0 |
| Vila Pádua | −19,72129, −50,19144 | 138 | +6,0 | −0,8 | 6,1 m L | 1,3 |
| Av. Marginal Vicente Delfino de Freitas | −19,71141, −50,19080 | 137 | −6,0 | +0,5 | 6,0 m O | 4,3 |
| Resid. Jardim Botânico II | −19,73381, −50,20029 | 166 | −2,3 | +5,2 | 5,7 m NO | 1,7 |
| Bairro Alto da Boa Vista | −19,74315, −50,19069 | 158 | −5,2 | −2,0 | 5,6 m O | 2,7 |
| Residencial Fênix I | −19,74476, −50,17297 | 55 | +3,7 | +4,2 | 5,6 m NE | 2,8 |
| Residencial Jardim Botânico | −19,73395, −50,20584 | 146 | −1,2 | −5,2 | 5,4 m S | 4,2 |
| Avenida Independência | −19,72101, −50,19590 | 153 | +4,9 | +1,6 | 5,2 m L | 2,9 |

Com poucas amostras (< 50), mas desvio grande — conferir no olho:
Rua José Tomaz Filho (−19,71153, −50,19459; 11,3 m O, 48 amostras),
Residencial Planalto (−19,71715, −50,18091; 8,7 m NE, 23), Bairro N. Sra.
Aparecida oeste (−19,72695, −50,21512; 6,9 m SE, 24).

**Ação sugerida:** abrir cada ponto no mapa (`/mapa#pos=18/<lat>/<lng>`) com a
planta completa ligada e comparar com o satélite. Se o desvio se confirmar num
loteamento inteiro, a correção certa é recalibrar **só aquele bloco** — hoje a
calibração é uma por cidade; corrigir um bairro sem estragar os outros exige
calibração por região (não existe ainda; seria um item novo do roadmap).

As demais 50 células de Iturama ficaram entre 0,8 e 4,9 m — dentro do ruído.

### Limeira do Oeste — sem ação

Todas as células com amostra suficiente ficaram entre 1,1 e 5,4 m, com σ 4–5 m
(ruído). Uma célula (−19,56312, −50,57820) acusou 34,8 m S, mas só tinha ruas
numa direção (a componente ao longo da rua fica indeterminada) — descartada.
