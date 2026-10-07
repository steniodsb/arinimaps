# Pré-avaliação de valor e aptidão territorial — metodologia v0

PENDÊNCIAS 5.3 e 5.4 (Melhorias 18). Versão da metodologia: **`v0-2026-10-07`**
(constante `METODOLOGIA_VERSAO` em `src/lib/avaliacao/metodologia.ts`).

> **Estimativa automatizada, não substitui avaliação profissional.**
> A frase aparece em todo resultado, junto do botão "Falar com um avaliador".

**Situação:** construída e **desligada para clientes** até a Arini aprovar a
metodologia e a validação jurídica do uso (decisão 8.4). A equipe da Matriz
pode calcular a qualquer momento na ficha do imóvel na Central, para validar.
A Diretoria liga em **Configurações › Inteligência**:

| Configuração | Padrão | Efeito |
|---|---|---|
| `pre_avaliacao_ativa` | Não | clientes com o recurso `pre_avaliacao` no plano veem a estimativa na ficha pública |
| `aptidao_ativa` | Não | idem para a aptidão territorial (só imóvel rural) |
| `pre_avaliacao_min_comparaveis` | 5 | abaixo disso: "dados insuficientes" |
| `pre_avaliacao_raio_km` | 60 | raio entre sedes municipais para buscar comparáveis vizinhos |

Cada cálculo é gravado em `avaliacoes` (tipo, imóvel, quem pediu, entradas —
imóvel, comparáveis, incidências e parâmetros —, resultado e versão da
metodologia) e gera `avaliacao_calculada` no `audit_log`.

---

## 1. Pré-avaliação de valor (comparáveis)

### 1.1 Dados de entrada

Função `fn_avaliacao_contexto(imóvel, raio_km)` (migration 0034):

- **Imóvel avaliado:** tipo, área medida no mapa (`property_geometries.area_m2`)
  ou, na falta, a declarada (ha no rural, m² no urbano); distância do centro do
  imóvel à sede municipal; distância ao acesso de rodovia mais próximo (pontos
  `acesso_rodovia` do OpenStreetMap, tabela `pois`).
- **Comparáveis:** imóveis do sistema **do mesmo tipo** (rural × urbano), com
  status publicado, em negociação ou vendido, **fora leilão** (lance mínimo não é
  preço de mercado), no mesmo município ou em município cuja sede esteja a até
  `raio_km` da sede do município do avaliado. Para cada um: preço anunciado,
  valor de venda registrado (`sales.valor_final`, quando houver), área e as
  mesmas distâncias.

Só entram comparáveis com preço e área conhecidos. Se houver pelo menos o
mínimo no **mesmo município**, só eles são usados; senão, entram os vizinhos.

### 1.2 Normalização

Preço unitário: **R$/ha** (rural) ou **R$/m²** (urbano) = preço ÷ área.

### 1.3 Fatores de homogeneização (cada comparável → condição do avaliado)

| Fator | Fórmula v0 | Limite | Por quê |
|---|---|---|---|
| Oferta × venda | anúncio × **0,90**; venda registrada × 1,00 | — | preço pedido costuma ter margem de negociação de ~10% |
| Tamanho da área | (área do comparável ÷ área avaliada) ^ **0,125** | 0,80 a 1,25 | áreas maiores costumam ter R$/ha menor |
| Distância à sede municipal | 1 + k × (dist. do comparável − dist. do avaliado) em km; k = **0,2%/km** rural, **2%/km** urbano | ±10% rural, ±15% urbano | mais perto da cidade, mais valor |
| Acesso a rodovia (só rural) | 1 + **0,4%/km** × (dist. do comparável − dist. do avaliado) | ±8% | logística e escoamento |

Valor unitário homogeneizado = unitário bruto × produto dos fatores aplicáveis
(fator sem dado dos dois lados não é aplicado). A tela mostra, para cada fator,
o efeito médio e em quantos comparáveis foi aplicado. A equipe vê ainda a
tabela comparável a comparável; o cliente vê só o agregado (valores de venda
são dado de negociação).

### 1.4 Resultado

- **Mediana** dos unitários homogeneizados × área avaliada.
- **Faixa:** 1º a 3º quartil quando há 8 ou mais comparáveis; abaixo disso,
  mínimo a máximo.
- **Confiança:**
  - alta: ≥ 10 comparáveis e coeficiente de variação < 25%;
  - média: ≥ mínimo e CV < 40%;
  - baixa: o resto;
  - rebaixa um nível se houver restrição territorial (TI, UC, embargo,
    quilombola) incidente; no máximo "média" se usar municípios vizinhos ou se
    a área for só declarada.
- **Dados insuficientes:** menos comparáveis que o mínimo, ou imóvel sem área →
  a tela diz isso e **não mostra número**.

### 1.5 Alertas territoriais (bandeiras, sem desconto numérico)

Lidos **só do que já foi consultado** (`consultas_rurais` do imóvel e
`consultas_area` do CAR vinculado — nunca dispara consulta nova):

- restrição: FUNAI (terra indígena), unidades de conservação, embargos IBAMA,
  territórios quilombolas;
- atenção: PRODES/DETER (desmatamento), ANM (mineração), IPHAN.

A v0 **não quantifica** o efeito dessas incidências no valor: mostra a bandeira
e reduz a confiança. Sem consulta territorial feita, avisa que não foram
verificadas.

### 1.6 Limitações conhecidas da v0

- A base de comparáveis é pequena enquanto o sistema tem poucos anúncios — o
  resultado esperado hoje é "dados insuficientes".
- Os coeficientes (0,90; 0,125; 0,2%/km; 0,4%/km) são valores de partida usuais
  em avaliação por comparação, **a calibrar** com as vendas registradas quando
  houver volume (NBR 14653 pede tratamento estatístico com amostra maior).
- Não considera benfeitorias, solo, topografia, situação documental nem data
  do anúncio (não há correção monetária na v0).

---

## 2. Aptidão territorial (só rural)

Indicação **qualitativa**: "mais propícia para lavoura (mecanizável)", "mais
propícia para pecuária", "área com restrições relevantes" ou "indeterminado".
**Não há número de rentabilidade**: faltam produtividade, custos e preços
regionais verificáveis — e a tela diz isso.

### 2.1 Relevo (declividade)

`src/lib/avaliacao/terreno.ts`, com o mesmo modelo de elevação do tour 3D
(Terrarium, AWS Open Data, derivado do SRTM ~30 m):

1. zoom 13 (~18 m/pixel na região), reduzido se a área exigir mais de 16 tiles;
2. grade de até 15 × 15 pontos dentro da divisa;
3. declividade em cada ponto por diferenças centrais com 2 pixels para cada
   lado (~70 m de base);
4. resultado: média, mediana, máxima, fração de pontos acima de 8%, 12% e 20%,
   altitude mínima e máxima.

Classes de relevo (EMBRAPA): plano 0–3%, suave ondulado 3–8%, ondulado 8–20%,
forte ondulado 20–45%, montanhoso 45–75%, escarpado > 75%.

### 2.2 Regra de indicação v0

1. Restrição legal incidente (TI, UC, embargo, quilombola) → **restrições**.
2. Sem relevo (sem divisa ou modelo fora do ar) → **indeterminado**.
3. Mediana ≤ 8% **e** no máximo 20% dos pontos acima de 12% → **lavoura**
   (12% é o limite usual de mecanização eficiente).
4. Mediana ≤ 20% → **pecuária** (lavoura só nos trechos planos).
5. Acima disso → **restrições** (relevo forte: pecuária extensiva, silvicultura
   ou preservação).

### 2.3 Fatores e limitações mostrados

- Água (hidrografia e ANA, se consultadas): favorece pecuária; gera APP.
- Desmatamento registrado (PRODES/DETER): alerta de crédito rural e
  comercialização.
- Solo declarado pelo anunciante: mostrado como "não verificado".
- Dados que faltam: MapBiomas (uso e cobertura), embargos IBAMA enquanto não
  importados, base de solos (EMBRAPA/SiBCS), consulta territorial quando não
  feita, rentabilidade.

---

## 3. Onde está no sistema

| Peça | Arquivo |
|---|---|
| Metodologia (funções puras, parâmetros, rótulos) | `src/lib/avaliacao/metodologia.ts` |
| Relevo (Terrarium + decodificador PNG) | `src/lib/avaliacao/terreno.ts` |
| Coleta de dados e gravação em `avaliacoes` | `src/lib/avaliacao/servidor.ts` |
| API | `POST /api/avaliacao/[propertyId]` (`{ "tipo": "pre_avaliacao" \| "aptidao" \| "ambos" }`) |
| "Falar com um avaliador" | `POST /api/avaliacao/[propertyId]/avaliador` → lead `origem = pre_avaliacao` + oportunidade com `qualificacao.tag = "pre_avaliacao"` |
| Tela da Central | seção na ficha `/admin/imoveis/[id]` |
| Tela pública | cartão na ficha `/imovel/[codigo]` (função ligada + recurso no plano) |

Mudou a regra? Atualize este documento, suba `METODOLOGIA_VERSAO` e o artigo
"Pré-avaliação de valor e aptidão territorial" em Conhecimento e IA.
