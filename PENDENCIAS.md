# ARINI MAPS — Roadmap de pendências (02/10/2026)

> Repositório: github.com/steniodsb/arinimaps · migrations até a 0027.
> Site travado pela senha de bloqueio (`SITE_SENHA`) até o lançamento.
> Acessos e senhas: `ACESSOS - NAO COMPARTILHAR.md`, fora do repositório.
>
> **Quem:** Stênio (desenvolvimento) · Carlos (Arini) · Stênio + Carlos (decisão conjunta).
> **Situação:** Pendente · Parcial · Bloqueado (esperando outra coisa).

---

## 1. Colocar no ar (infraestrutura)

| # | Pendência | Situação | Quem | Depende de |
|---|---|---|---|---|
| 1.1 | Cadastrar as variáveis no Dokploy, incluindo `SITE_SENHA` e `SITE_BLOQUEIO_SEGREDO` | Pendente | Stênio | — |
| 1.2 | Deploy da `main` | Pendente | Stênio | 1.1 |
| 1.3 | Domínio (`arinimaps.com.br` ou subdomínio) e `NEXT_PUBLIC_SITE_URL` + rebuild | Bloqueado | Stênio + Carlos | decisão 7.6 |
| 1.4 | Worker como 2º serviço (vídeo, tiles de imagem, imagem de compartilhamento e **geração dos lotes urbanos**) | Pendente | Stênio | 1.2 |
| 1.5 | Ambiente de homologação separado da produção (pedido no item 22 do documento do Carlos) | Pendente | Stênio | segundo projeto no Supabase |
| 1.6 | Backup automático e teste de restauração | Bloqueado | Stênio | plano pago do banco (7.8) |
| 1.7 | Domínio atrás da Cloudflare (proteção de borda) | Bloqueado | Stênio | 1.3 |
| 1.8 | Limpar dados de demonstração no lançamento (`scripts/limpa-demo.mjs --tudo --executar`) | Pendente | Stênio | dia do lançamento |

## 2. APIs e integrações

| # | Pendência | Situação | Quem | Depende de |
|---|---|---|---|---|
| 2.1 | **Esri ArcGIS** — criar conta e chave (privilégio Basemaps, restrita ao domínio) → `NEXT_PUBLIC_ARCGIS_KEY` e rebuild. Depois, conferir nuvem nos municípios | Pendente | Stênio | 1.3 |
| 2.2 | **Resend** — e-mails de lead, aprovação, recuperação de senha e alertas | Bloqueado | Stênio | domínio (1.3) |
| 2.3 | **Asaas** — cobrança de mensalidade e baixa automática | Bloqueado | Carlos cria a conta no CNPJ da Arini, Stênio liga | 7.3 |
| 2.4 | **SIGEF, IBAMA embargos, quilombolas e IPHAN** — baixar os dados abertos e importar para o relatório territorial | Pendente | Stênio | — |
| 2.5 | **MapBiomas** (uso do solo) — token com aceite de termos ou raster importado | Bloqueado | Stênio | decisão 7.7 |
| 2.6 | **API de avaliação de imóveis** para a pré-avaliação de valor | Bloqueado | Carlos indica qual | 7.4 |
| 2.7 | **Chave de IA** (Anthropic) para o chat | Bloqueado | Carlos aprova o custo | 7.2 |
| 2.8 | **ANM/SIGMINE** devolvendo erro do servidor deles — acompanhar; o relatório já mostra "indisponível" | Parcial | Stênio | órgão |
| 2.9 | Catálogo das APIs: fonte, finalidade, autenticação, atualização, limites, licença e campos (item 19) | Pendente | Stênio | — |
| 2.10 | Monitor de disponibilidade e tempo de resposta das fontes, com alerta | Parcial | Stênio | 2.2 |

## 3. Design

| # | Pendência | Situação | Quem | Depende de |
|---|---|---|---|---|
| 3.1 | Revisar o **modo claro** tela por tela: virou o padrão para quem usa o aparelho no claro | Pendente | Stênio | — |
| 3.2 | Testar layout e velocidade no **celular real** (mapa, anúncio, painel) | Pendente | Stênio | 1.2 |
| 3.3 | Logo e cores oficiais da Arini Maps (hoje é logotipo em texto) | Pendente | Carlos envia, Stênio aplica | — |
| 3.4 | Fotos reais na página inicial e nos imóveis de vitrine, no lugar das de demonstração | Pendente | Carlos | — |
| 3.5 | Botão de tema na tela "Acesso restrito" | Pendente | Stênio | — |
| 3.6 | Plantas de **Limeira do Oeste e União de Minas** completas (hoje sem os blocos de loteamento) — exportar o DWG como DXF no AutoCAD e subir em Admin › Cartografia | Bloqueado | Stênio | AutoCAD |

## 4. Funcionalidades

| # | Pendência | Situação | Quem | Depende de |
|---|---|---|---|---|
| 4.1 | **Chat de IA** em linguagem natural ("lotes de R$ 40 mil em Iturama"), respeitando as permissões do usuário, com base de conhecimento auditável (itens 16 e 17) | Pendente | Stênio | 2.7 e 7.2 |
| 4.2 | **Pré-avaliação de valor** e **aptidão territorial**, com fatores, limitações e encaminhamento a profissional (item 18) | Bloqueado | Stênio | 2.6 e 7.4 |
| 4.3 | **Consulta básica × profissional**: o que cada uma mostra e como se libera (item 15) | Bloqueado | Stênio | 7.5 |
| 4.4 | **"Consultar informações" no lote urbano** — o rural já tem (consulta do CAR); falta o painel equivalente do lote (item 7) | Pendente | Stênio | — |
| 4.5 | **Número de lote e quadra** no lote urbano: tentar ler os textos do CAD e casar com cada lote | Pendente | Stênio | qualidade do CAD |
| 4.6 | Pasta digital do imóvel com **histórico de versões** de documentos e fotos (item 13) — upload e organização já existem | Parcial | Stênio | — |
| 4.7 | Separação por **organização** (vários clientes no mesmo SaaS). Hoje há território por região para franquia (item 1) | Parcial | Stênio | 7.10 |
| 4.8 | Botão de tema e preferências salvos na conta, não só no navegador | Pendente | Stênio | — |

## 5. Segurança e LGPD

| # | Pendência | Situação | Quem | Depende de |
|---|---|---|---|---|
| 5.1 | Varredura de vulnerabilidades e pentest externo antes do lançamento | Pendente | contratação externa | 1.2 |
| 5.2 | Plano de resposta a incidentes (quem faz o quê) | Pendente | Stênio + Carlos | — |
| 5.3 | Registro formal das operações de tratamento de dados (mapa de dados LGPD) | Parcial | Stênio + Carlos | 6.2 |
| 5.4 | Alertas ativos por e-mail (login suspeito, bloqueios, fonte fora do ar) | Bloqueado | Stênio | 2.2 |
| 5.5 | Limite de requisições nas leituras do mapa | Parcial | Stênio | tráfego real |
| 5.6 | Rotina mensal de `npm audit` e atualização de dependências | Pendente | Stênio | — |
| 5.7 | Carlos trocar a senha e ativar o código do celular no primeiro acesso; tornar o segundo fator obrigatório para a equipe | Pendente | Carlos | — |

## 6. Dados e conteúdo que vêm do Carlos

| # | Pendência | Situação | Onde entra |
|---|---|---|---|
| 6.1 | CNPJ, CRECI-J, endereço da sede e foro | Pendente | Admin › Configurações › Dados jurídicos (aparecem nos termos) |
| 6.2 | E-mail do encarregado de dados (LGPD) e e-mail que recebe os leads | Pendente | Admin › Configurações |
| 6.3 | E-mail real do Carlos para a conta de admin (hoje `carlos@arinimaps.com.br`, provisório) | Pendente | conta dele |
| 6.4 | Lista final de municípios do piloto | Pendente | Admin › Regiões (só o código IBGE) |
| 6.5 | Mensalidade do anúncio e dias de tolerância (hoje R$ 0 / 15 dias) | Pendente | Admin › Configurações |
| 6.6 | Contas reais da equipe e o setor de cada pessoa | Pendente | Admin › Usuários |

## 7. Dúvidas gerais e decisões para seguir

| # | Decisão | Quem | O que destrava |
|---|---|---|---|
| 7.1 | **Prazo e custo por etapa** do escopo novo (item 22 do documento) | Stênio apresenta, Carlos aprova | tudo da seção 4 |
| 7.2 | Chat de IA: aprovar o custo por uso da chave | Carlos | 4.1 |
| 7.3 | Asaas: conta no CNPJ da Arini e quais cobranças passam por ele | Carlos | 2.3 |
| 7.4 | Pré-avaliação: qual API ou metodologia, e validação jurídica do uso | Carlos | 4.2 |
| 7.5 | Consulta profissional: o que libera, para quem e quanto custa | Carlos | 4.3 |
| 7.6 | Domínio: `arinimaps.com.br` ou subdomínio | Carlos | 1.3, 2.1, 2.2 |
| 7.7 | MapBiomas: token com aceite de termos ou raster importado | Stênio + Carlos | 2.5 |
| 7.8 | Plano pago do banco (~US$ 25/mês) para backup | Carlos | 1.6 |
| 7.9 | Selfie na exclusividade: finalidade, base legal, retenção e descarte validados pelo jurídico dele | Carlos | uso definitivo da selfie |
| 7.10 | Franquias: regras de território e o que cada franqueado enxerga | Carlos | 4.7 |
| 7.11 | Data de lançamento (quando tirar a senha de bloqueio) | Stênio + Carlos | 1.8 |

## 8. Testes e revisão

| # | Teste | Situação | Quem |
|---|---|---|---|
| 8.1 | Envio real de vídeo de ponta a ponta (com o worker no ar) | Pendente | Stênio |
| 8.2 | Roteiro completo em homologação: cadastro, anúncio pelo CAR e pelo lote, documentos, aprovação, lead, proposta, venda e comissão | Pendente | Stênio |
| 8.3 | Rodada de teste com o Carlos usando a conta dele, com lista de ajustes | Pendente | Stênio + Carlos |
| 8.4 | Teste em celular Android e iPhone, em 4G | Pendente | Stênio |
| 8.5 | Regressão automática (`testa-rodada`, `testa-matriz`, `testa-perfis`, `testa-lotes`) antes de cada deploy | Parcial | Stênio |

---

## Já entregue (resumo)

- **Mapa:** satélite como padrão, alternância satélite/mapa, marcadores regionais, CAR clicável ("Esta área é minha"), **25.910 lotes urbanos clicáveis** em Iturama (4.166 em Limeira, 1.169 em União) com metragens, planta do CAD como camada opcional, cores rural/urbano/leilão, tour 3D mais lento com pontos de referência.
- **Anúncio:** pelo CAR, pelo lote ou desenhando; documentos obrigatórios conferidos pela Arini antes de publicar; vídeos; selfie na exclusividade; leilão com edital.
- **Perfis:** proprietário, comprador, corretor, imobiliária, engenheiro, leiloeiro, franqueado, consulta e equipe; território por franquia.
- **Matriz por setores:** Operações, Comercial, Financeiro (com exportação), Jurídico (com pedidos LGPD), Marketing, Cartografia, Suporte (chamados), Segurança e Diretoria; tarefas internas; trava de setor no servidor.
- **Segurança:** segundo fator (TOTP), recuperação por link de uso único, limite de tentativas, registro de acessos, expiração da sessão da equipe, funções do banco fechadas, **senha de bloqueio do site**, tema claro/escuro seguindo o aparelho.
- **Jurídico:** 6 termos versionados com aceite registrado (versão, data, hora, IP).
- **Conta de admin geral do Carlos** criada (Diretoria).
