# ARINI MAPS — Roadmap de pendências (06/10/2026)

> Repositório: github.com/steniodsb/arinimaps · migrations até a 0030.
> Cobertura dos documentos de 05/10 (Fluxograma Mestre e Requisitos cartográficos): `docs/FLUXOGRAMA-COBERTURA.md` · planos por nicho: `docs/PLANOS.md`.
> Site travado pela senha de bloqueio (`SITE_SENHA`) até o lançamento.
> Acessos e senhas: `ACESSOS - NAO COMPARTILHAR.md`, fora do repositório.
> PDF: `Arini Maps - Roadmap de pendencias.pdf` (gerado destes mesmos dados).
>
> **Situação:** Pendente · Parcial · Validar (ajustado, falta conferir com o Carlos) · Bloqueado (aguarda outro item) · Decisão.
> 
> **Origem:** Call = call de 01/10 · Melhorias N = documento de melhorias, item N · Segurança N = requisitos de segurança e LGPD, item N · APIs = levantamento de APIs · Fluxograma N = Fluxograma Mestre (05/10), seção N · Carto N = Requisitos cartográficos (05/10), seção N.

---

## 1. Colocar no ar

Servidor, domínio e a estrutura que sustenta o sistema em produção.

| # | Pendência | Situação | Quem | Depende de | Origem |
|---|---|---|---|---|---|
| 1.1 | **Variáveis de ambiente no servidor** — Inclui a senha de bloqueio, que mantém o site fechado até o lançamento. | Pendente | Stênio | — | — |
| 1.2 | **Publicar a versão atual** — Site, mapa, painel do anunciante e Matriz fora do ambiente de desenvolvimento. | Pendente | Stênio | 1.1 | — |
| 1.3 | **Domínio definitivo** — Apontar o endereço e gerar a versão final com ele. | Bloqueado | Stênio e Carlos | 8.6 | — |
| 1.4 | **Serviço de processamento** — Vídeo automático, imagens de compartilhamento e geração dos lotes urbanos. | Pendente | Stênio | 1.2 | — |
| 1.5 | **Ambiente de homologação** — Cópia separada da produção, sem dados reais sensíveis, para testar cada mudança antes de publicar. | Pendente | Stênio | — | Melhorias 22 · Segurança 9 e 15 |
| 1.6 | **Backup automático e recuperação** — Backup criptografado e fora do ambiente principal, retenção definida, restauração testada e metas de tempo de recuperação. | Bloqueado | Stênio | 8.8 | Call · Melhorias 20 · Segurança 16 |
| 1.7 | **Proteção de borda (Cloudflare)** — Filtro de ataques na frente do site. | Bloqueado | Stênio | 1.3 | Segurança 9 |
| 1.8 | **Acesso direto ao banco restrito** — Banco sem exposição aberta à internet: acesso administrativo só por rede e IPs autorizados. | Pendente | Stênio | — | Segurança 9 |
| 1.9 | **Dimensionar banco e armazenamento** — Capacidade para fotos, vídeos, documentos, geometrias e histórico com o volume esperado da região. | Pendente | Stênio | 8.8 | Call · Melhorias 13 e 20 |
| 1.10 | **Monitoramento com alertas** — Site, banco, APIs, armazenamento e IA, com responsáveis definidos para receber os alertas. | Bloqueado | Stênio | 3.2 | Melhorias 20 · Segurança 17 |
| 1.11 | **Limpeza dos dados de demonstração** — No dia do lançamento. | Pendente | Stênio | 8.13 | — |

## 2. Mapa e cartografia

O que foi apontado no mapa, o que já foi ajustado e precisa ser conferido, e o que falta.

| # | Pendência | Situação | Quem | Depende de | Origem |
|---|---|---|---|---|---|
| 2.1 | **Velocidade do mapa no celular e no 4G** — No computador a cidade passou de 14 MB para cerca de 2 MB na tela. Falta medir em aparelho real e definir metas de tempo. | Parcial | Stênio | 1.2 | Call · Melhorias 2 |
| 2.2 | **Tour 3D só depois do mapa carregar** — Ajustado e mais lento. Conferir no celular. | Validar | Stênio e Carlos | — | Call · Melhorias 4 |
| 2.3 | **Marcações visíveis ao afastar o zoom** — Ajustado com marcadores regionais. Conferir na rodada de testes. | Validar | Stênio e Carlos | — | Call |
| 2.4 | **Mapa limpo, só com o essencial** — Lotes e metragens numa camada limpa; a planta original, com círculos, setas, rodovias e nomes de rua, virou camada opcional. | Validar | Stênio e Carlos | — | Call · Melhorias 3 |
| 2.5 | **Revisar os arquivos de planta com o Miguel** — Limpar os desenhos na origem e corrigir o que veio errado no arquivo. | Pendente | Stênio e Carlos | 7.7 | Call |
| 2.6 | **Regiões onde a planta não bate com o satélite** — Conferir quadra a quadra nas três cidades e recalibrar onde houver deslocamento. | Pendente | Stênio | — | Call |
| 2.7 | **Metragem em todos os lotes** — Agora calculada pela divisa de cada lote, inclusive onde a planta não trazia. Conferir com o Carlos. | Validar | Stênio e Carlos | — | Call |
| 2.8 | **Ferramentas da parte de baixo do mapa** — Medir área e distância estão no mapa. Conferir com o Carlos. | Validar | Stênio e Carlos | — | Call |
| 2.9 | **Plantas completas de Limeira do Oeste e União de Minas** — Exportar os arquivos do AutoCAD no formato que o sistema lê. | Bloqueado | Stênio | — | — |
| 2.10 | **“Consultar informações” no lote urbano** — O rural já tem, pela consulta do CAR. | Pendente | Stênio | — | Melhorias 7 |
| 2.11 | **Número do lote e da quadra** — Ler os textos da planta e associar a cada lote. | Pendente | Stênio | — | Melhorias 6 |
| 2.12 | **Pontos de referência** — Distância até o imóvel e atualização periódica da fonte (OpenStreetMap). | Parcial | Stênio | — | Melhorias 5 |
| 2.13 | **Expansão para novas regiões** — Nova região (por exemplo Frutal, num raio de 150 km) entra só com municípios e plantas, com acesso próprio. O município já entra pelo código do IBGE, com o CAR automático; falta o roteiro e um teste completo. | Parcial | Stênio | — | Call · Melhorias 1 |

## 3. APIs e integrações

Serviços externos e bases oficiais que alimentam o mapa, os avisos e o relatório.

| # | Pendência | Situação | Quem | Depende de | Origem |
|---|---|---|---|---|---|
| 3.1 | **Satélite licenciado (Esri)** — Conta e chave restrita ao domínio; depois, conferir nuvem em cada município. | Pendente | Stênio | 1.3 | — |
| 3.2 | **E-mails automáticos (Resend)** — Novo interessado, imóvel aprovado, recuperação de senha e alertas. | Bloqueado | Stênio | 1.3 | — |
| 3.3 | **Cobrança (Asaas)** — Mensalidade do anúncio e assinatura da consulta, com baixa automática. | Bloqueado | Carlos | 8.3 | Call |
| 3.4 | **SIGEF, IBAMA embargos, quilombolas e IPHAN** — Baixar os dados abertos e importar para o relatório territorial. | Pendente | Stênio | — | APIs |
| 3.5 | **Camadas ambientais do CAR** — APP, reserva legal e demais camadas declaradas, além do perímetro que já está no mapa. | Pendente | Stênio | — | APIs |
| 3.6 | **MapBiomas (uso do solo)** — Por token com aceite de termos ou por arquivo importado. | Bloqueado | Stênio | 8.7 | APIs |
| 3.7 | **SNCR, CNIR, CAFIR e CIB** — Bases cadastrais rurais que exigem acesso autorizado pelo órgão. | Bloqueado | Carlos | 8.12 | APIs |
| 3.8 | **Imagens históricas (Sentinel-2 e Landsat)** — Séries temporais e análises de vegetação. | Pendente | Stênio | — | APIs |
| 3.9 | **Rodovias (DNIT e DER/MG)** — Hoje vêm do OpenStreetMap; os órgãos não oferecem consulta pública. | Parcial | Stênio | — | APIs |
| 3.10 | **ANEEL e ANM** — A ANEEL não publica linhas de transmissão e a ANM está com erro no servidor deles; o relatório mostra a fonte como indisponível. | Parcial | Stênio | — | APIs |
| 3.11 | **API de avaliação de imóveis** — Base para a pré-avaliação de valor. | Bloqueado | Carlos | 8.4 | Call · Melhorias 18 |
| 3.12 | **Chave de inteligência artificial** — Necessária para o chat. | Bloqueado | Carlos | 8.2 | Call |
| 3.13 | **Busca por matrícula** — “Fazenda Santa Maria, matrícula X”: definir a fonte, já que matrícula fica nos cartórios. | Bloqueado | Stênio e Carlos | 8.12 | Call · Melhorias 16 |
| 3.14 | **Matriz técnica das fontes** — Para cada fonte: órgão, endereço oficial, tipo de acesso, autenticação, custo, limites, licença, atualização e campos. | Pendente | Stênio | — | APIs · Melhorias 19 |
| 3.15 | **Origem e data de cada informação** — Separar dados oficiais, de terceiros, derivados e inseridos pelo usuário, com fonte e data visíveis. | Parcial | Stênio | — | APIs · Melhorias 19 |
| 3.16 | **Teste de queda e lentidão das fontes** — Disponibilidade e tempo de resposta acompanhados, com aviso quando uma fonte cair. | Parcial | Stênio | 3.2 | Melhorias 19 |

## 4. Design

Acabamento visual e experiência em cada tela e aparelho.

| # | Pendência | Situação | Quem | Depende de | Origem |
|---|---|---|---|---|---|
| 4.1 | **Interface mais simples e amigável** — Menos informação por tela, botões mais claros e interação mais fácil, para ninguém ter preguiça de usar. | Pendente | Stênio | — | Call |
| 4.2 | **Revisão do modo claro tela por tela** — O site agora segue o tema do aparelho, então o claro passa a ser visto por muita gente. | Pendente | Stênio | — | — |
| 4.3 | **Layout no celular real** — Mapa, anúncio e painel. | Pendente | Stênio | 1.2 | — |
| 4.4 | **Logo e cores oficiais** — Hoje o logotipo é só texto. | Pendente | Carlos | — | — |
| 4.5 | **Fotos reais** — Página inicial e imóveis de vitrine. | Pendente | Carlos | — | — |
| 4.6 | **Foto no perfil de cada usuário** — Imagem vinculada ao cadastro, à parte da selfie da exclusividade. | Pendente | Stênio | — | Melhorias 9 |
| 4.7 | **Botão de tema na tela de acesso restrito** | Pendente | Stênio | — | — |

## 5. Funcionalidades

Recursos novos que ainda não estão no sistema.

| # | Pendência | Situação | Quem | Depende de | Origem |
|---|---|---|---|---|---|
| 5.1 | **Chat de inteligência artificial** — Busca em linguagem natural (“lotes de R$ 40 mil em Iturama”), sem acesso livre ao banco e respeitando as permissões de quem pergunta. | Pendente | Stênio | 3.12 | Call · Melhorias 16 · Segurança 18 |
| 5.2 | **Base de conhecimento da IA** — Atualizável e auditável, com fonte e data, em vez de aprendizado sem controle. | Pendente | Stênio | 5.1 | Melhorias 17 |
| 5.3 | **Pré-avaliação de valor** — Localização, área, topografia, aproveitamento e infraestrutura, sempre como estimativa e com encaminhamento a profissional. | Bloqueado | Stênio | 3.11 | Call · Melhorias 18 |
| 5.4 | **Aptidão territorial** — Indicar se a área é mais propícia para lavoura ou gado de corte e qual a rentabilidade esperada, mostrando os fatores usados. | Bloqueado | Stênio | 8.4 | Call · Melhorias 18 |
| 5.5 | **Consulta básica, profissional e assinatura** — Estrutura pronta: planos por nicho com recursos, cotas e trava no servidor; consulta de área limitada pela cota do plano. Faltam preço e cobrança. | Parcial | Stênio | 8.5 · 8.14 | Call · Melhorias 15 |
| 5.6 | **Consulta nacional** — A consulta vale para o Brasil todo; a venda começa na região de Iturama. As fontes ao vivo já consultam qualquer área, falta abrir a consulta para fora da região. | Parcial | Stênio | — | Call |
| 5.7 | **Acesso do franqueado** — Só consulta e gestão dos próprios imóveis; aprovação continua na Matriz. Perfil e território existem; falta conferir as telas dele. | Validar | Stênio e Carlos | 8.10 | Call · Melhorias 12 |
| 5.8 | **Histórico de versões na pasta do imóvel** — O envio e a organização de documentos, fotos e vídeos já existem. | Parcial | Stênio | — | Melhorias 13 |
| 5.9 | **Separação por organização** — Vários clientes no mesmo sistema; o território por franquia já existe. | Parcial | Stênio | 8.10 | Melhorias 1 |
| 5.10 | **Preferências salvas na conta** — Tema e ajustes acompanham o usuário em qualquer aparelho. | Pendente | Stênio | — | — |
| 5.11 | **Planos por nicho** — Conta tem nicho (persona do fluxograma) e plano; o plano libera ferramentas, camadas e consultas, com cota mensal. Diretoria edita em Planos e nichos e troca o plano de cada conta em Equipe e usuários; página pública /planos; tentativas bloqueadas registradas em Segurança. Preços em zero até a definição. | Validar | Stênio e Carlos | 8.14 · 8.15 | Fluxograma 3 e 20 · Melhorias 1, 10 e 15 |
| 5.12 | **Solicitações cartográficas** — “Não encontrei meu imóvel” e “o mapa está divergente” pelo mapa, com protocolo, anexos, fila do setor de Cartografia, status e devolutiva; a geometria do usuário só vira oficial quando a Matriz aplica e valida. | Validar | Stênio e Carlos | — | Carto 2 e 3 |
| 5.13 | **Histórico e rastreabilidade do imóvel** — Acessos e interações, versões da divisa com origem e responsável, origem de cada dado e trilha de auditoria na ficha (Matriz e anunciante); resumo público “Rastreabilidade”. | Validar | Stênio e Carlos | — | Carto 1 |
| 5.14 | **Alteração de anúncio publicado** — Anunciante propõe mudanças (título, descrição, valor, área, condições); vira versão para a Matriz aprovar ou rejeitar; o anúncio atual continua no ar durante a análise. | Validar | Stênio e Carlos | — | Fluxograma 9 |
| 5.15 | **Pedido de complemento** — Além de “corrigir”, a Matriz pede dados complementares; o anunciante vê a diferença no painel. | Validar | Stênio e Carlos | — | Fluxograma 7 |
| 5.16 | **Cadastro de demanda sem imóvel** — Quando o cliente não gosta de nenhum imóvel, registrar a demanda para busca futura. Hoje só reencaminha a oportunidade. | Decisão | Carlos | — | Fluxograma 12 |

## 6. Segurança e LGPD

O que falta para fechar os requisitos de segurança e proteção de dados.

| # | Pendência | Situação | Quem | Depende de | Origem |
|---|---|---|---|---|---|
| 6.1 | **Varredura de vulnerabilidades e pentest** — Feito por empresa externa antes do lançamento. | Pendente | Externo | 1.2 | Segurança 15 e 21 |
| 6.2 | **Revisão de segurança das APIs** — Injeção, XSS, CSRF, SSRF, upload malicioso e respostas sem dados desnecessários. | Pendente | Stênio | — | Segurança 14 |
| 6.3 | **Registro de quem abre cada documento** — Visualização e download de documentos e selfies ficam registrados. | Pendente | Stênio | — | Segurança 11 e 13 |
| 6.4 | **Retenção e descarte automático** — Documentos, selfies e registros apagados no prazo definido. | Bloqueado | Stênio | 8.9 | Segurança 11, 12 e 19 |
| 6.5 | **Criptografia de campos sensíveis** — Avaliar criptografia por campo para dados como CPF, além da criptografia do disco. | Pendente | Stênio | — | Segurança 10 |
| 6.6 | **Rotação de chaves e segredos** — Troca periódica das chaves do sistema e controle de quem tem acesso. | Pendente | Stênio | — | Segurança 2 e 10 |
| 6.7 | **Recuperação reforçada para a equipe** — Validação extra para recuperar contas com mais privilégios. | Pendente | Stênio | — | Segurança 5 |
| 6.8 | **Alertas de acesso anormal** — Novo aparelho, local diferente e excesso de tentativas avisam por e-mail. | Bloqueado | Stênio | 3.2 | Segurança 3, 6 e 17 |
| 6.9 | **Segundo fator obrigatório para a equipe** — A opção existe; falta ativar e cada pessoa cadastrar o código do celular. | Pendente | Carlos | — | Segurança 4 |
| 6.10 | **Plano de resposta a incidentes** — Quem faz o quê, canais internos e o procedimento perante a lei. | Pendente | Stênio e Carlos | — | Segurança 20 |
| 6.11 | **Mapa de dados pessoais** — Quais dados, para quê, onde ficam e quem acessa; a Política de Privacidade já lista o principal. | Parcial | Stênio e Carlos | 7.2 | Segurança 19 |
| 6.12 | **Proteção dos registros** — Logs protegidos contra alteração e exclusão, com prazo de guarda definido. | Parcial | Stênio | — | Segurança 13 |
| 6.13 | **Revisão periódica de permissões** — Conferir a cada trimestre quem acessa o quê. | Pendente | Stênio e Carlos | — | Segurança 8 |
| 6.14 | **Limite de requisições nas leituras do mapa** — Login, cadastro e consultas já têm limite. | Parcial | Stênio | — | Segurança 14 |
| 6.15 | **Atualização mensal de dependências** | Pendente | Stênio | — | Segurança 15 |

## 7. Dados e conteúdo da Arini

Informações que só a Arini tem e que entram direto no painel.

| # | Pendência | Situação | Quem | Depende de | Origem |
|---|---|---|---|---|---|
| 7.1 | **CNPJ, CRECI-J, endereço da sede e foro** — Aparecem nos termos publicados. | Pendente | Carlos | — | — |
| 7.2 | **E-mail do encarregado de dados e e-mail dos interessados** | Pendente | Carlos | — | — |
| 7.3 | **E-mail definitivo da conta de administrador** — O atual é provisório. | Pendente | Carlos | — | — |
| 7.4 | **Lista final de municípios do piloto** | Pendente | Carlos | — | — |
| 7.5 | **Mensalidade do anúncio e dias de tolerância** | Pendente | Carlos | — | — |
| 7.6 | **Equipe e setor de cada pessoa** — Para criar as contas da Matriz. | Pendente | Carlos | — | — |
| 7.7 | **Contato do Miguel** — Para a revisão dos arquivos de planta. | Pendente | Carlos | — | Call |

## 8. Dúvidas gerais e decisões

Definições que destravam os itens bloqueados.

| # | Pendência | Situação | Quem | Depende de | Origem |
|---|---|---|---|---|---|
| 8.1 | **Prazo, custo e valor do escopo novo** — Por etapa, separando correção, melhoria, novidade e integração, com riscos e dependências. | Decisão | Stênio e Carlos | — | Call · Melhorias 22 |
| 8.2 | **Custo por uso da inteligência artificial** — E quais dados podem ser enviados ao serviço de IA. | Decisão | Carlos | — | Segurança 18 |
| 8.3 | **Conta do Asaas e quais cobranças passam por ele** | Decisão | Carlos | — | — |
| 8.4 | **API ou metodologia da pré-avaliação e da aptidão** — E a validação jurídica do uso. | Decisão | Carlos | — | Call · Melhorias 18 |
| 8.5 | **Regras da consulta profissional** — O que libera, para quem e o valor da assinatura. | Decisão | Carlos | — | Call · Melhorias 15 |
| 8.6 | **Domínio** — arinimaps.com.br ou subdomínio. | Decisão | Carlos | — | — |
| 8.7 | **MapBiomas por token ou por arquivo** | Decisão | Stênio e Carlos | — | — |
| 8.8 | **Plano pago do banco de dados** — Cerca de US$ 25 por mês: backup automático e mais capacidade. | Decisão | Carlos | — | Call |
| 8.9 | **Selfie e prazos de guarda** — Finalidade, base legal, retenção e descarte de selfies e documentos. | Decisão | Carlos | — | Melhorias 9 · Segurança 12 |
| 8.10 | **Regras das franquias** — Território e o que cada franqueado enxerga. | Decisão | Carlos | — | Call · Melhorias 12 |
| 8.11 | **Pacote de suporte pós-lançamento** — Horário comercial, para usuários e para o sistema, e quando passar a ter pessoas dedicadas. | Decisão | Stênio e Carlos | — | Call |
| 8.12 | **Fontes que exigem autorização ou custo** — Matrícula em cartório e bases como SNCR e CNIR: vale contratar ou pedir acesso? | Decisão | Carlos | — | Call · APIs |
| 8.13 | **Data de lançamento** — Quando o site deixa de pedir a senha de acesso. | Decisão | Stênio e Carlos | — | Call |
| 8.14 | **Preço e cobrança dos planos** — Valor de cada plano (consulta profissional, parceiro, organização, franquia), periodicidade, se a assinatura soma ou substitui a mensalidade por anúncio, e cota de degustação do gratuito (hoje 2 consultas de área por mês). | Decisão | Carlos | 8.3 | Fluxograma 3 · Melhorias 15 |
| 8.15 | **Nichos da primeira versão** — Produtor rural, empresa/holding e prefeitura estão reservados no modelo (o fluxograma não define o fluxo deles). Entram agora, com qual plano, ou ficam para depois? Plano por pessoa ou por organização? | Decisão | Carlos | — | Fluxograma personas 5, 6 e 7 |

## 9. Testes e revisão

Validação antes de abrir ao público.

| # | Pendência | Situação | Quem | Depende de | Origem |
|---|---|---|---|---|---|
| 9.1 | **Envio de vídeo de ponta a ponta** — Com o serviço de processamento no ar. | Pendente | Stênio | 1.4 | — |
| 9.2 | **Roteiro completo em homologação** — Cadastro, anúncio pelo CAR e pelo lote, documentos, aprovação, interessado, proposta, venda e comissão. | Pendente | Stênio | 1.5 | Melhorias 22 |
| 9.3 | **Rodada de testes com o Carlos** — Acesso, visualização e rastreio de ajustes, com a conta dele. | Pendente | Stênio e Carlos | — | Call |
| 9.4 | **Android e iPhone em 4G** | Pendente | Stênio | — | Melhorias 2 |
| 9.5 | **Testes de segurança antes do lançamento** — Força bruta, permissões com todos os perfis, acesso direto a endereços e registros de outros usuários, envio de arquivos e segregação por território. | Parcial | Stênio | — | Segurança 21 e 22 |
| 9.6 | **Teste de restauração do backup** | Bloqueado | Stênio | 1.6 | Segurança 22 |
| 9.7 | **Testes automáticos antes de cada publicação** — Já existem (`scripts/testa-*.mjs`, incluindo `testa-planos.mjs` de 06/10); falta torná-los rotina. | Parcial | Stênio | — | — |

## 10. Pós-lançamento e suporte

O que garante o sistema funcionando depois da abertura.

| # | Pendência | Situação | Quem | Depende de | Origem |
|---|---|---|---|---|---|
| 10.1 | **Suporte em horário comercial** — Para os usuários e para o sistema, conforme o pacote definido. | Bloqueado | Stênio | 8.11 | Call |
| 10.2 | **Chat de suporte dentro do sistema** — Os chamados já existem; falta a conversa ao vivo com a equipe de suporte. | Parcial | Stênio | 8.11 | Call |
| 10.3 | **Acompanhamento das primeiras semanas** — Correção rápida do que aparecer com os primeiros anunciantes. | Pendente | Stênio | 8.13 | Call |
| 10.4 | **Treinamento da equipe da Matriz** — Análise de anúncios, documentos, funil e cartografia. | Pendente | Stênio e Carlos | — | — |
| 10.5 | **Manual de funcionalidades e permissões** — A matriz de permissões e a arquitetura de segurança já estão documentadas. | Parcial | Stênio | — | Melhorias 22 · Segurança 22 |
| 10.6 | **Integração com o CRM de atendimento** — O CRM vira um braço deste sistema, com as melhorias pendentes dele, depois desta fase. | Pendente | Stênio | — | Call |

## Já entregue (resumo)

- **Mapa:** Satélite como padrão, marcadores regionais, imóveis rurais do CAR clicáveis (“esta área é minha”), 31 mil lotes urbanos clicáveis com metragens, cores para rural, urbano e leilão, tour 3D esperando o mapa e com pontos de referência.
- **Anúncio:** Pelo CAR, pelo lote ou desenhando a área; documentos conferidos pela Arini antes de publicar; fotos e vídeos; selfie na exclusividade; leilão com edital.
- **Perfis:** Proprietário, comprador, corretor, imobiliária, engenheiro, leiloeiro, franqueado, consulta e equipe interna, com território por franquia.
- **Matriz:** Nove setores com acesso controlado: operações, comercial, financeiro, jurídico, marketing, cartografia, suporte, segurança e diretoria; tarefas internas e chamados.
- **Segurança:** Senhas com hash, segundo fator, recuperação por link de uso único, limite de tentativas, regras de acesso no banco (RLS), registro de acessos e auditoria, sessões com expiração, senha de bloqueio do site.
- **Jurídico:** Seis termos com aceite registrado: versão, data, hora e IP. Pedidos de titulares (LGPD) atendidos pela Matriz.
- **06/10 — documentos de 05/10:** Planos por nicho (recursos, cotas, trava no servidor, tela da Diretoria, página pública), solicitações cartográficas com protocolo e fila da Matriz, histórico/versões/origem dos dados na ficha do imóvel, alteração de anúncio publicado como nova versão, pedido de complemento, tentativas de acesso bloqueadas registradas. Cobertura item a item em `docs/FLUXOGRAMA-COBERTURA.md`.
