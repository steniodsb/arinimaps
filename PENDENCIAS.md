# Arini Maps — pendências (só o que VOCÊ precisa fazer)

> Todo o código está pronto e o SQL **já está aplicado** no Supabase (migrations 0001–0008).
> Nada abaixo bloqueia o uso local: `npm run dev` na pasta `arini-maps/` e entre com
> `admin@arinimaps.com.br` / senha padrão Arini. Isto aqui é o que depende de você.

## Para colocar no ar (deploy)

1. **Deploy do app no Dokploy** (VPSWAVE01, mesmo fluxo do CRM):
   - Novo app apontando para o repo/pasta `arini-maps`, porta padrão do Next.
   - Copiar o `.env.local` para as envs do Dokploy + trocar `NEXT_PUBLIC_SITE_URL` pelo domínio real.
2. **Decidir o domínio** com o Carlos (`arinimaps.com.br` ou `maps.arininegociosimobiliarios.com.br`) e apontar DNS na Cloudflare.
3. **Subir o worker** (vídeo, tiles da cartografia, OG, retry de POIs):
   - `deploy/worker-compose.yml` está pronto; envs necessárias estão comentadas nele
     (`DATABASE_URL` com a senha do banco, `SUPABASE_SERVICE_ROLE_KEY`, `SITE_URL`).
   - Sem o worker o sistema funciona 100% — só vídeo automático, tiles de cartografia e
     imagem OG ficam "pendentes" até ele rodar.

## Chaves de serviços (cada uma destrava um recurso já codado)

4. **RESEND_API_KEY** (+ `RESEND_FROM` verificado) → e-mails automáticos: lead novo para a
   Arini, aprovado/publicado/correção para o anunciante, encaminhamento para parceiro.
   Configure também o e-mail da central em Admin › Configurações.
5. **ASAAS_API_KEY** (+ `ASAAS_WEBHOOK_TOKEN`, webhook `https://SEU_DOMINIO/api/asaas/webhook`)
   → botão "Cobrar via Asaas" nas faturas + baixa automática de pagamento.
6. **Satélite licenciado para produção** (decisão de ~US$25/mês): criar conta MapTiler ou
   Mapbox e me pedir para trocar a fonte — a demo usa Esri, que não é licenciado para
   uso comercial contínuo.

## Decisões de negócio (com o Carlos)

7. **Valor da mensalidade** e dias de tolerância → Admin › Configurações (hoje: R$ 0 e 15 dias).
8. **Textos jurídicos**: termos de uso, autorização de venda, exclusividade, regra escrita do 1%.
9. **Enviar o orçamento** (recomendação registrada: R$ 7.000 em 3 parcelas + sustentação mensal).
10. **Lista final de municípios** do piloto — dá para adicionar sozinho em Admin › Regiões
    (só o código IBGE; nome e mapa vêm automáticos).

## Cartografia (DWG)

11. Os DWG de Limeira do Oeste e União de Minas (em `cartografia/`) são AutoCAD 2018+.
    Para virarem camada no mapa, precisam ser exportados como **GeoTIFF/imagem georreferenciada**
    (quem fez os arquivos consegue exportar; ou instale o ODA File Converter que eu faço a
    conversão DWG→DXF e sigo daqui). Depois é só subir em Admin › Cartografia — o worker
    gera os tiles sozinho.

## Antes de abrir para gente de verdade

12. Trocar as senhas das 3 contas de teste (todas usam a senha padrão) e criar a conta real do Carlos.
13. Apagar/ajustar os imóveis demo (Fazenda Boa Vista está "vendida" pelo teste; o Sítio está publicado).
