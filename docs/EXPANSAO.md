# Abrir uma região nova (roadmap 2.13)

Testado em 08/10/2026 com Frutal/MG, raio de 150 km: 117 municípios (21 MG, 96 SP), gravados em
10 s sem geometria inválida, CAR clicável no mapa pelo arquivo nacional; teste desfeito depois.

1. **Ensaio** (não grava nada): lista os municípios, a UF e a distância.
   ```bash
   node scripts/nova-regiao.mjs --polo <código IBGE da cidade-polo> --raio 150
   ```
2. **Gravar sem aparecer no site** (para a Arini conferir antes):
   ```bash
   node scripts/nova-regiao.mjs --polo 3127107 --raio 150 --nome "Região de Frutal" --executar --inativa
   ```
   A região aparece em Central › Regiões e CAR como "inativa".
3. **CAR**: nada a fazer — o arquivo nacional (`scripts/car-nacional`) já cobre o Brasil; sem ele, a
   busca sob demanda no SICAR preenche ao navegar. Não importar o CAR de 100+ municípios no banco.
4. **Plantas urbanas**: cidade a cidade, em Central › Cartografia (DXF/DWG da prefeitura → calibração
   → lotes). Sem planta, a cidade aparece com ruas e quadras do mapa base.
5. **Abrir ao público**: rodar de novo sem `--inativa` (ou marcar os municípios como ativos na Central).
   Município ativo entra nos filtros da busca, no cadastro de anúncio e nos números da página inicial.
6. **Franquia/território** (se a região tiver franqueado): vincular o parceiro à região em Central › Parceiros.
7. **Desfazer** (só municípios sem imóvel nem planta): `node scripts/nova-regiao.mjs --remover "Região de Frutal"`.
