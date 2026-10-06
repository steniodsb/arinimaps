# Cobertura do Fluxograma Mestre e dos Requisitos Cartográficos

Documentos do Carlos de 05/10/2026: **"Fluxograma Mestre de Desenvolvimento do
Sistema"** e **"Requisitos para desenvolvimento — módulos cartográficos"**. Esta
página diz, seção por seção, onde cada regra vive no sistema, o que entrou na
rodada de 05/10 e o que ainda depende de decisão.

Legenda: ✅ existe e está no ar · 🆕 entrou em 05/10/2026 · ⏳ reservado/parcial · ❓ depende do Carlos

## Fluxograma Mestre

| § | Regra | Situação | Onde |
|---|---|---|---|
| 1 | Três ambientes (público, profissional, Matriz) sobre o mesmo banco, CRM e auditoria | ✅ | `src/app/(public)`, `src/app/painel`, `src/app/admin`; `audit_log` |
| 2 | Fluxo geral: consulta → interesse → CRM → triagem → parceiro → negociação → fechamento → comissão | ✅ | leads → `opportunities` → funil (`/admin/funil`) → `fn_registrar_venda` → `commissions` |
| 3 | Acesso: identifica perfil → carrega permissões | ✅ + 🆕 | `profiles.role` + **`profiles.nicho` / `plan_id`** (migration 0028); `ator()` em `src/lib/authz.ts` devolve o acesso resolvido |
| 4 | Cadastro do corretor/imobiliária com verificação da Matriz, pendência e reanálise | ✅ | `partners.status`, `/admin/cadastros`, `/api/admin/decisao` |
| 5 | Cadastro do imóvel pelo parceiro → análise → classificação por região/município/tipo | ✅ | `/painel/novo`, `properties`, `municipalities`/`regions` |
| 6 | Revisão da Matriz por setores (operacional, edição, jurídico) | ✅ | setores em `src/lib/setores.ts`; tarefas por setor (`tasks`) |
| 7 | Decisão: aprovar · corrigir · **complementar** · rejeitar | ✅ + 🆕 | `/api/admin/decisao`; **ação `complementar`** grava `properties.pendencia_tipo = 'complemento'` (0029) |
| 8 | Nada publica sem aprovação | ✅ | máquina de estados `fn_property_transition` + prova de propriedade conferida antes de aprovar |
| 9 | Alteração de imóvel publicado vira nova versão para análise; a versão pública anterior fica no ar | 🆕 | **`property_revisions`** (0029), `POST /api/imoveis/[id]/revisao`, decisão `alvo: "revisao"`; painel "Propor alteração" e ficha admin "Alteração proposta" |
| 10 | Comprador: pesquisa → mapa/lista → imóvel → interesse → demanda no CRM | ✅ | `/mapa`, `/imoveis`, `/imovel/[codigo]`, `InteresseForm` → `/api/leads` |
| 11 | Lead: CRM central → triagem → primeiro contato pela Matriz → aciona parceiro | ✅ | `opportunities.etapa`, encaminhamento A/B em `/admin/oportunidades/[id]` |
| 12 | Cliente não gosta do imóvel → Matriz pesquisa outro → novo responsável | ✅ (parcial) | a oportunidade pode ser reencaminhada; não há "registro de demanda sem imóvel" dedicado — ❓ se o Carlos quiser um cadastro de demanda |
| 13 | Proprietário: identidade → cadastro → documentos → termos → assinaturas → aprovação → publicação | ✅ | CPF obrigatório (0014), documentos (`property_documents`), aceites versionados (0018), selfie na exclusividade (0025) |
| 14 | Documento com pendência → avisa → novo documento → reanálise | ✅ | `property_documents.verificado`, decisão `correcao` com e-mail |
| 15 | Negociação: visita → proposta → registro → acordo/encerra | ✅ | `visits`, `proposals`, `contracts`, `sales` |
| 16 | Comissão / financeiro / histórico | ✅ | `commissions`, `/admin/comissoes`, `/admin/financeiro` |
| 17 | Franquia / região / municípios; nova região sem reconstruir | ✅ | `regions`, `municipalities` (IBGE), `partners.region_id`, `/admin/regioes` |
| 18 | Matriz: parceiros, imóveis, leads, fechamento, financeiro | ✅ | `/admin` (Matriz por setores) |
| 19 | Auditoria: usuário, data/hora, ação, registro, alteração, resultado | ✅ + 🆕 | `audit_log` (append-only) + **`property_events`** por imóvel (0029) + `auth_events` |
| 20 | Permissões: tenta acessar → tem permissão? não → bloqueia → **registra tentativa** | 🆕 | **`access_attempts`** (0028); `conferirRecurso()` em `src/lib/planos-servidor.ts`, `exigirSetor()` registra negação; tela em `/admin/seguranca` |
| 21 | O grande fluxo do imóvel | ✅ | soma dos itens acima |
| 22 | Regras de retorno (correção, documento pendente, alteração, lead, imóvel não serve) | ✅ + 🆕 | as de alteração entram com `property_revisions` |
| 23 | Status: rascunho → enviado → pendente de revisão → em análise → pendência → reenviado → aprovado → publicado → suspenso → encerrado | ✅ | `property_status`: `rascunho, pendente, em_analise, correcao (pendência), aprovado, publicado, suspenso, inativo/historico (encerrado)`; "reenviado" = `correcao → em_analise` |
| 24 | Centralização absoluta na Arini | ✅ | lead nunca vai direto ao parceiro; publicação só pela Matriz |
| 25 | Os 20 módulos a construir | ✅ (18/20) + ⏳ | faltam só **indicadores avançados** e **pré-avaliação** (reservados no plano `pre_avaliacao`) |
| 26 | Diretriz final | ✅ | arquitetura relacional, histórico em toda alteração, responsável/status/retorno em toda etapa |

### Personas (fluxos das personas)

| Persona | Papel (`role`) | Nicho (`nicho`) | Plano padrão | Situação |
|---|---|---|---|---|
| 1 Visitante | — | — | acesso de visitante | ✅ mapa, anúncios, interesse |
| 2 Comprador / investidor | `comprador` | `comprador_investidor` | `consulta_basica` | ✅ |
| 3 Vendedor / proprietário | `proprietario` | `proprietario` | `anunciante` | ✅ |
| 4 Corretor / imobiliária | `corretor` / `imobiliaria` | `corretor_imobiliaria` | `parceiro` | ✅ |
| 5 Produtor rural | `proprietario` ou `consulta` | `produtor_rural` | `consulta_profissional` | ⏳ reservado no modelo, como o documento manda; ❓ fluxo próprio |
| 6 Empresa / holding | qualquer | `empresa_holding` | `organizacao` | ⏳ reservado (multiusuário ainda não existe); ❓ |
| 7 Prefeitura / ente público | `consulta` | `ente_publico` | `organizacao` | ⏳ reservado; ❓ |
| 8 Franqueado | `franqueado` | `franqueado` | `franquia` | ✅ território por região |
| 9 Administrador / Matriz | `admin_central` / `analista_arini` | — | tudo pelo papel | ✅ setores |

Nichos reservados só podem ser definidos pela Matriz (em Equipe e usuários → conta
externa); não aparecem no cadastro público.

### Checklist final do desenvolvedor

| Item | Situação |
|---|---|
| Ambientes público, profissional e Matriz integrados | ✅ |
| Autenticação e identificação de perfil | ✅ |
| Permissões por usuário, organização e função | ✅ + 🆕 plano/nicho |
| Cadastro de parceiros e imóveis | ✅ |
| Fila/CRM de revisão da Matriz | ✅ |
| Retorno para correção e reenvio | ✅ + 🆕 complemento |
| Trava de publicação sem aprovação | ✅ |
| Versionamento de alterações | 🆕 `property_revisions` + `property_geometry_versions` |
| Versão pública anterior preservada durante análise | 🆕 |
| Leads centralizados no CRM Arini | ✅ |
| Lead não vai ao CRM do parceiro antes da triagem | ✅ |
| Acionamento do responsável pelo imóvel | ✅ |
| Visitas, propostas, negociações | ✅ |
| Fechamento, financeiro, comissões | ✅ |
| Auditoria das ações relevantes | ✅ + 🆕 eventos do imóvel e tentativas negadas |
| Organização por região e município | ✅ |
| Expansão regional sem reconstrução | ✅ |
| Contatos privados dos parceiros fora do ambiente público | ✅ |
| Dados sensíveis restritos | ✅ (RLS; `docs/SEGURANCA.md`) |
| Integrações externas não assumidas como concluídas | ✅ (`PENDENCIAS.md` §3) |

## Requisitos — módulos cartográficos

| § | Requisito | Situação | Onde |
|---|---|---|---|
| 1 | ID único e histórico próprio por imóvel | ✅ + 🆕 | `properties.id/codigo`; histórico na ficha (`HistoricoImovel`) |
| 1.1 | Registrar visualização, data/hora, usuário/empresa, ação; exibir na ficha | 🆕 | `property_events` — ficha, tour, relatório, documento, mídia, interesse, lead, consulta, compartilhamento, alteração |
| 1.2 | Alterações com quem/quando/o quê, sem apagar histórico | ✅ + 🆕 | `audit_log` + `property_revisions` (antes/depois) |
| 1.3 | Versionamento da geometria: versão, data, responsável, origem, motivo; consultar anteriores | 🆕 | `property_geometry_versions` (gatilho em toda troca da divisa); `fn_upsert_geometry` com origem/motivo/responsável |
| 1.4 | Auditoria de eventos críticos, não editável, relatório | ✅ + 🆕 | `audit_log` append-only; trilha na ficha admin |
| 1.5 | Origem do dado (oficial, proprietário, corretor, Matriz, processamento, estimativa, geometria do usuário, validada) | 🆕 | `property_data_sources`; `ORIGEM_DADO_LABEL` |
| 2.1 | "Não encontrei meu imóvel" / "O mapa está divergente", direto pelo mapa | 🆕 | chip no mapa, link no cartão do CAR e do lote → `/cartografia/solicitar` |
| 2.2 | Ponto, polígono, KML/KMZ, planta/croqui/memorial, foto, descrição | 🆕 | formulário com `DesenhoMapa` + anexos (bucket privado `docs`) |
| 2.3 | Protocolo com solicitante, data, tipo, localização, geometria, documentos; histórico | 🆕 | `cartographic_requests` (`CART-000001`), `cartographic_request_events` |
| 2.4 | Tipos (inclusão, correção, divergência, atualização, desmembramento, unificação, sobreposição, erro de localização, outros) | 🆕 | enum em `cartographic_requests.tipo` |
| 2.5 | Fluxo: protocolo → fila da Matriz → análise → complementação → vetorização → revisão → validação → nova versão → publicação | 🆕 | `/admin/cartografia/solicitacoes`, `fn_cart_request_transicao`, "Aplicar geometria ao imóvel" cria versão validada |
| 2.6 | Status (recebida … cancelada) | 🆕 | gatilho `fn_cart_request_transition` |
| 3 | Geometria do usuário não é oficial até validação; só a Matriz valida; anterior fica no histórico; situação cartográfica ≠ documental ≠ registral | 🆕 | `situacao` da versão (`informada`/`validada`), `fn_validar_geometria`, aprovação do anúncio valida a divisa |
| 4 | Histórico na ficha; eventos do CRM vinculados; território/franquia; permissões por perfil | 🆕 | `HistoricoImovel` (admin/painel), resumo público "Rastreabilidade"; RLS por `fn_property_editable_id` |
| 5 | Estrutura mínima de dados | 🆕 | `properties`, `property_events`, `property_geometry_versions`, `property_documents`, `cartographic_requests`, `cartographic_request_events`, `property_data_sources` |
| 7 | Resultado: cada imóvel rastreável | 🆕 | ficha do imóvel |

## Planos por nicho (pedido de 05/10)

Ver `docs/PLANOS.md`. Resumo: `plans` (recursos + cotas + preço, editável em
`/admin/planos`), `profiles.nicho` e `profiles.plan_id` (padrão pelo gatilho
`fn_profile_plano`, manual pela Diretoria), trava no servidor
(`conferirRecurso`), botões travados na tela, tentativas em `access_attempts`.

**Decisões que só o Carlos pode tomar** (pendências 8.5 e novas):
preço de cada plano, quais nichos entram na v1, plano por conta ou por
organização, cota de degustação do gratuito, e se a assinatura da consulta
substitui ou soma com a mensalidade por anúncio.
