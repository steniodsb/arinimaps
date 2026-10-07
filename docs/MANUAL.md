# Arini Maps — manual de funcionalidades e permissões

Para a equipe da Arini (Matriz) e para quem vai treinar novos usuários (roadmap 10.4 e 10.5).
Detalhe técnico de permissões: `SEGURANCA.md` §2. Planos: `PLANOS.md`.

## 1. Quem usa o sistema

| Quem | Entra por | Faz |
|---|---|---|
| Visitante | site público | navega no mapa e nos anúncios, demonstra interesse |
| Comprador / consulta | `/entrar` → conta gratuita | o mesmo, mais consultas de área conforme o plano, chat de IA, solicitações cartográficas |
| Proprietário | conta + aprovação da Matriz | anuncia o próprio imóvel, acompanha análise, oportunidades e documentos |
| Corretor, imobiliária, leiloeiro, engenheiro | conta + aprovação da Matriz | anuncia imóveis de terceiros, atende oportunidades encaminhadas |
| Franqueado | definido pela Matriz | o mesmo do parceiro, dentro do território |
| Organização (empresa, holding, prefeitura) | criada pela Matriz | vários usuários sob um plano; o admin da organização convida membros |
| Equipe da Matriz | contas criadas pela Diretoria | trabalha por setor na Central (`/admin`) |

## 2. Planos por nicho

Cada conta tem **papel** (o que faz), **nicho** (o segmento) e **plano** (o que pode usar).
O plano padrão vem do nicho; a Diretoria muda em *Equipe e usuários* (por conta) ou em
*Organizações* (para todos os membros). Planos, recursos, cotas e preços se editam em
*Planos e nichos*. O que fica travado aparece com cadeado e leva a `/planos`.
Toda tentativa bloqueada aparece em *Segurança › Tentativas bloqueadas*.

## 3. Fluxos do dia a dia na Central

| Fluxo | Onde | Setor |
|---|---|---|
| Aprovar cadastro de proprietário/parceiro | Cadastros | Operações |
| Analisar anúncio: checklist, documentos, divisa, consulta territorial | Imóveis › ficha | Operações |
| Pedir correção ou complemento, aprovar, publicar, suspender | Imóveis › ficha › Decisão | Operações |
| Alteração proposta em anúncio publicado (anúncio segue no ar) | Imóveis › ficha › Alteração proposta | Operações |
| Validar a divisa (versão oficial da geometria) | Imóveis › ficha › Rastreabilidade | Operações ou Cartografia |
| Lead → oportunidade → visita → proposta → contrato → venda → comissão | Funil, Oportunidades | Comercial |
| Cliente não gostou de nenhum imóvel → registrar demanda | Oportunidade › Registrar demanda; Demandas | Comercial |
| Imóvel novo que casa com demanda aberta | tarefa automática no setor Comercial | Comercial |
| Solicitação "não encontrei meu imóvel" / "mapa divergente" | Cartografia › Solicitações cartográficas | Cartografia |
| Plantas, calibração, lotes, CAR, municípios | Cartografia, Regiões e CAR | Cartografia |
| Saúde das fontes oficiais, matriz técnica | Cartografia › Fontes oficiais | Cartografia |
| Mensalidades e comissões | Financeiro | Financeiro |
| Pedidos LGPD, termos, contratos | Jurídico | Jurídico |
| Base de conhecimento da IA, conversas e custo | Marketing › Conhecimento | Marketing |
| Chamados de suporte (conversa ao vivo) | Suporte | Suporte |
| Acessos, alertas, documentos abertos, revisão trimestral de permissões | Segurança | Segurança |
| Planos, equipe, organizações, configurações | Diretoria | Diretoria |

## 4. O que o cliente encontra

- **Mapa** (`/mapa`): satélite, malha do CAR desde a visão regional, lotes urbanos com número,
  quadra e metragens de perto, imagens históricas por ano com comparação, ferramentas de
  medição, KML, impressão e captura (conforme o plano), consulta de área desenhada.
- **Consultas**: área do CAR, lote urbano ou área desenhada → cruzamento com 16 fontes oficiais,
  com órgão, data e classificação de cada informação. Cota mensal por plano.
- **Anúncio** (`/imovel/<código>`): fotos, vídeo, tour 3D, pontos de interesse com distância,
  rastreabilidade da divisa, interesse direto para a central.
- **Painel** (`/painel`): meus imóveis, documentos com versões, propor alteração, oportunidades,
  solicitações cartográficas, organização.
- **Conta** (`/conta`): nome, telefone, foto, preferências (tema, mapa), segurança (segundo fator).
- **Suporte** (`/suporte`): chamado com conversa ao vivo.
- **Assistente de IA**: botão flutuante; responde só com dados públicos e autorizados.

## 5. Ligar o que está pronto mas desligado

| Recurso | Como ligar | Depende de |
|---|---|---|
| Chat de IA | variável `ANTHROPIC_API_KEY` no servidor | chave (3.12) |
| Pré-avaliação e aptidão | Configurações › Inteligência | aprovação da metodologia (8.4) |
| Cobrança pelo Asaas | `ASAAS_API_KEY` | conta (8.3) |
| E-mails automáticos e alertas | `RESEND_API_KEY` | conta e domínio (3.2) |
| Criptografia do CPF | `CAMPO_CRIPTO_CHAVE` + `node scripts/cifra-cpf.mjs` | — |
| Descarte por prazo | Configurações › Segurança | prazos (8.9) |
| Segundo fator obrigatório da equipe | Configurações › Segurança | cada pessoa cadastrar o app |

## 6. Testes antes de publicar

```bash
npm run testa
```

Roda a auditoria das rotas, as fontes oficiais e os testes de ponta a ponta (planos, mapa,
conta e suporte, perfis). Cada teste apaga o que cria. Roteiro de homologação: `HOMOLOGACAO.md`.
