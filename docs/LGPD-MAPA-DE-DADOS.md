# Mapa de dados pessoais (registro das operações de tratamento)

Item 6.11 do roadmap; requisito 19 do documento de segurança e LGPD; LGPD
art. 37 (registro das operações) e art. 6º (finalidade, necessidade,
transparência). Levantado em 07/10/2026 a partir do esquema real do banco
(`information_schema.columns`, 64 tabelas) e dos buckets de arquivos.

**Leitura:** "Base legal sugerida" é proposta técnica para o jurídico validar
(LGPD art. 7º: I consentimento · II obrigação legal · V execução de contrato ·
VI exercício regular de direitos · IX legítimo interesse · X proteção do
crédito). "Quem acessa" é o que a RLS e as rotas permitem hoje (setores em
`docs/SEGURANCA.md` §2). "Retenção" marcada *8.9* aguarda a decisão 8.9 do
roadmap; os prazos configuráveis ficam em **Configurações › Segurança** e,
enquanto em 0, nada é descartado.

**Onde fica:** banco Postgres do Supabase (projeto `qtpjryvqifcmmabebccf`,
região sa-east-1) · `docs` = bucket privado de arquivos · `media` = bucket
público · Auth = serviço de autenticação do Supabase (tabela `auth.users`).
Criptografia em trânsito (TLS) e em repouso (disco do provedor) em tudo;
CPF/CNPJ cifrado na aplicação quando `CAMPO_CRIPTO_CHAVE` existir.

**Papéis LGPD:** controladora = Arini Negócios Imobiliários; operadores =
Supabase (banco, Auth, arquivos), provedor do servidor da aplicação, Resend
(e-mail), Asaas (cobrança), Esri (imagem de satélite — não recebe dado
pessoal), Anthropic (IA, item 8.2 — só o que a pergunta do usuário contiver).
Encarregado: [PREENCHER — item 7.2].

---

## 1. Contas e identificação

| Tabela / local | Dados pessoais | Finalidade | Base legal sugerida | Quem acessa | Retenção | Onde |
|---|---|---|---|---|---|---|
| `auth.users` | e-mail, hash da senha (bcrypt, ninguém lê), segredo do segundo fator, último acesso, telefone (não usado) | autenticar | V | só o servidor; o próprio usuário | enquanto a conta existir; exclusão a pedido (LGPD art. 18) | Auth |
| `profiles` | nome, CPF/CNPJ (`cpf_cnpj` ou `cpf_cnpj_cifrado` + `cpf_hash`), telefone, foto (`avatar_url`), IP e data do aceite dos termos, preferências, último acesso (`visto_em`) | identificar a pessoa por trás da conta, unicidade, contato, prova do aceite | V; VI (aceite) | o próprio (leitura; altera só nome, telefone, foto, preferências); equipe | enquanto a conta existir; aceite: prazo prescricional — *8.9* | banco |
| `owners` / `partners` | vínculo da conta; razão social, registro profissional (CRECI, JUCEMG), cidade base, território | habilitar anúncio e parceria | V | o próprio (leitura); equipe (Operações aprova) | enquanto a conta existir | banco |
| `partner_documents` | documentos do parceiro | conferir habilitação | V; II (CRECI) | o próprio (leitura); equipe | *8.9* | `docs` |
| `organizations` / `organization_members` | CNPJ, e-mail e papel de cada membro | conta de organização/franquia | V | membros (leitura do próprio); Diretoria/Comercial | enquanto ativa | banco |
| `recuperacao_codigos` | hash do código de confirmação | recuperação de senha da equipe (6.7) | IX (segurança) | só o servidor | 15 minutos (apagado ao usar) | banco |
| avatar | foto do usuário | identificação no sistema | I/V | público (bucket `media`) | até trocar ou excluir a conta | `media` |

## 2. Imóvel, documentos e autorização

| Tabela / local | Dados pessoais | Finalidade | Base legal sugerida | Quem acessa | Retenção | Onde |
|---|---|---|---|---|---|---|
| `properties` | vínculo com dono/parceiro, descrição livre, dados de leilão (processo, comitente) | anunciar | V | público quando publicado; dono/parceiro; equipe | enquanto anunciado + histórico de venda | banco |
| `property_geometries`, `property_geometry_versions` | localização e divisa do imóvel (ligada ao dono) | mapa, área, consulta territorial | V | público quando publicado; dono/parceiro; equipe | histórico permanente (rastreabilidade) — *8.9* | banco |
| `property_documents` + arquivos | matrícula, escritura, CCIR/ITR, edital, procuração (nome, CPF, estado civil, endereço do proprietário), quem enviou e quem conferiu | comprovar propriedade e legitimidade | V; VI | dono/parceiro; Operações, Jurídico, Cartografia — **cada abertura registrada** | anúncio reprovado: `retencao_docs_reprovados_dias`; demais *8.9* | `docs` |
| `property_authorizations` | quem aceitou, IP, data, versão do termo, **selfie** (`selfie_path`), autorização assinada | prova do aceite da autorização/exclusividade | VI; V | selfie: quem aceitou + Operações/Jurídico; autorização: dono/parceiro + equipe — aberturas registradas | selfie: `retencao_selfie_dias` após o fim da autorização; registro do aceite *8.9* | banco + `docs` |
| `property_media` | fotos e vídeos (podem mostrar pessoas, placas) | anúncio | V | público | enquanto anunciado | `media` |
| `property_revisions`, `property_data_sources` | quem propôs/registrou a alteração | rastreabilidade (Fluxograma §1.5, §9) | VI; IX | dono/parceiro (leitura); equipe | permanente — *8.9* | banco |
| `avaliacoes` | quem pediu a pré-avaliação, entradas | pré-avaliação (pacote C) | V | o próprio; equipe | *8.9* | banco |

## 3. Comercial e financeiro

| Tabela / local | Dados pessoais | Finalidade | Base legal sugerida | Quem acessa | Retenção | Onde |
|---|---|---|---|---|---|---|
| `leads` | nome, telefone, e-mail, mensagem, origem/UTM, consentimento e versão | atender o interesse no imóvel | I (consentimento registrado) / procedimentos preliminares (V) | equipe (Comercial) | *8.9* (sugestão: 2 anos sem negócio) | banco |
| `opportunities`, `opportunity_events` | comprador, qualificação (perfil de compra), histórico de atendimento | intermediar a venda | V | equipe; parceiro/dono a quem foi encaminhada | prazo prescricional da comissão — *8.9* | banco |
| `visits`, `proposals` | data, feedback, valores, condições, quem propôs | negociação | V | idem | idem | banco |
| `contracts` + arquivo | contrato com qualificação das partes | formalizar | V; II | quem opera a oportunidade; Comercial, Jurídico, Financeiro — aberturas registradas | prazo legal (contratos/tributos: 5 anos após o fim) — *8.9* | banco + `docs` |
| `sales`, `commissions` | participantes, valor da venda e da comissão | receita e conciliação | V; II (fiscal) | Diretoria (escrita), equipe (leitura) | 5 anos (fiscal) — *8.9* | banco |
| `subscriptions`, `invoices`, `plan_subscriptions` | valor e situação de pagamento do anunciante/assinante | cobrança | V; X | Financeiro | 5 anos (fiscal) | banco + Asaas |
| `demandas`, `demanda_matches` | nome e contato do cliente, preferências de busca | demanda sem imóvel (pacote D) | V / I | Comercial | *8.9* | banco |

## 4. Atendimento, LGPD e cartografia

| Tabela / local | Dados pessoais | Finalidade | Base legal sugerida | Quem acessa | Retenção | Onde |
|---|---|---|---|---|---|---|
| `support_tickets`, `support_messages` | nome, e-mail, telefone, texto livre | suporte | V; IX | o próprio (sem nota interna); Suporte | *8.9* | banco |
| `lgpd_requests` | nome, e-mail, CPF, pedido do titular | atender direitos do titular | II (art. 18) | o próprio; Jurídico | 5 anos (prova do atendimento) — *8.9* | banco |
| `cartographic_requests`, `cartographic_request_events` + anexos | quem pediu, descrição, ponto/área, arquivos, mensagens | solicitação cartográfica | V | solicitante; Cartografia — anexos com abertura registrada | *8.9* | banco + `docs` |
| `consultas_area_geom`, `consultas_area_log` | quem consultou que área, IP | cota do plano, auditoria, cobrança futura | V; IX | o próprio (log); equipe | log: `retencao_logs_acesso_dias` (mín. 180) | banco |
| `tasks` | responsável, texto livre | operação interna | IX | equipe do setor | *8.9* | banco |
| `ia_conversas`, `ia_mensagens` | perguntas e respostas (texto livre pode conter dado pessoal) | assistente de IA (pacote C) | V; IX | o próprio; equipe conforme o pacote C | *8.9* — e item 8.2 (o que pode ir à IA) | banco + Anthropic (no processamento) |

## 5. Segurança e auditoria

Todos **somente-inserção** (gatilho `fn_log_somente_insercao`, migration 0036):
nem o servidor altera ou apaga; só a rotina de retenção, dentro do prazo
configurado.

| Tabela | Dados pessoais | Finalidade | Base legal sugerida | Quem acessa | Retenção | Onde |
|---|---|---|---|---|---|---|
| `auth_events` | e-mail, IP, navegador/aparelho | registro de acesso, prevenção de fraude | II (Marco Civil art. 15); IX | Segurança | `retencao_logs_acesso_dias` (mín. 180) | banco |
| `alertas_seguranca` | e-mail, IP, aparelho | alertas de acesso anormal (6.8) | IX | Segurança | idem | banco |
| `document_access_log` | quem abriu qual documento, IP, aparelho | rastrear acesso a dado sensível (6.3) | IX; VI | Segurança | idem | banco |
| `access_attempts` | quem tentou o quê, IP | tentativas bloqueadas | IX | Segurança | idem | banco |
| `audit_log` | quem fez o quê; antes/depois (pode conter dado pessoal do registro alterado) | auditoria | VI; IX | Segurança, Diretoria | **não entra no descarte** — *8.9* | banco |
| `property_events` | quem viu/abriu o quê no imóvel, IP | rastreabilidade do imóvel | IX | dono/parceiro do imóvel; equipe | não entra no descarte — *8.9* | banco |
| `revisoes_acesso` | quem revisou; lista da equipe | revisão trimestral (6.13) | IX | Segurança, Diretoria | permanente | banco |
| `descartes_log` | caminho do arquivo descartado | provar o descarte | II; IX | Segurança | permanente | banco |
| `rate_limits` | chave com IP ou e-mail | limite de tentativas | IX | só o servidor | janela curta (contador) | banco |

## 6. Não pessoais (para não confundir)

`car_imoveis` (base pública do CAR: código e geometria, sem nome),
`municipalities`, `regions`, `urban_lots`, `cartography_layers`, `pois`,
`plans`, `settings`, `fontes_*`, `consultas_area`/`consultas_rurais` (resultado
de fontes públicas por área), `kb_artigos*`, `jobs`, `presentations`.

## 7. Pendências deste mapa

- Validar bases legais e prazos com o jurídico (decisão 8.9) e preencher o
  encarregado (7.2).
- Selfie: a finalidade é só identificação visual para conferência humana —
  **não há reconhecimento facial** nem extração biométrica (requisito 12).
  Se um dia houver, exige avaliação jurídica prévia e relatório de impacto.
- Compartilhamento com terceiros: listar contratos/DPA dos operadores acima.
- Revisar este mapa a cada migration que crie coluna com dado pessoal
  (consulta: `select table_name, column_name from information_schema.columns where table_schema='public'`).
