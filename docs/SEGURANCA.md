# Arini Maps — arquitetura de segurança

Documento pedido no item 22 de "Requisitos de segurança, LGPD e proteção de
dados" (01/10/2026). Descreve o que está implementado, como foi testado e o que
ainda falta. Atualizado em 01/10/2026.

Cada afirmação "implementado" abaixo tem um teste automatizado ou uma medição
citada. O que não foi testado está marcado como tal.

---

## 1. Fluxo de uma requisição

```
navegador → HTTPS → aplicação (Next.js) → autenticação e autorização → banco (Postgres + RLS)
                                        ↘ armazenamento (media público · docs privado)
```

- O banco **não** é acessado direto pelo navegador para escrita: toda gravação
  passa por uma rota do servidor, que confere quem é o usuário e o que ele pode.
- O navegador usa a chave pública do Supabase só para login e leituras; a RLS
  limita o que cada sessão enxerga.
- A chave mestra (`SUPABASE_SERVICE_ROLE_KEY`) existe só no servidor.

## 2. Perfis e matriz de permissões

Três famílias (`src/lib/perfis.ts`):

| Família | Perfis | Onde entra |
|---|---|---|
| Equipe (Matriz) | Diretoria, Equipe | Central Arini (`/admin`), por setor |
| Parceiro | Imobiliária, Corretor, Engenheiro, Leiloeiro, Franqueado | Painel do anunciante (`/painel`) |
| Cliente | Proprietário, Comprador, Consulta | Painel (proprietário) e área pública |

### 2.1 Equipe — por setor (`src/lib/setores.ts`)

A diretoria atua em todos os setores. Os demais membros, só nos setores
marcados em Equipe e usuários. A trava é no servidor: `exigirSetor()` em cada
tela e `temSetor()` em cada rota.

| Ação | Setor exigido |
|---|---|
| Analisar, pedir correção, aprovar, publicar, suspender anúncio | Operações |
| Aprovar cadastro de parceiro e proprietário | Operações |
| Conferir documento do imóvel | Operações ou Jurídico |
| Funil, leads, visitas, propostas | Comercial |
| Comissões, mensalidades, planilha financeira | Financeiro |
| Pedidos de titulares (LGPD), autorizações, contratos | Jurídico |
| Origem de leads, materiais de divulgação | Marketing |
| Plantas urbanas, calibração, CAR, municípios | Cartografia |
| Chamados de suporte | Suporte |
| Eventos de acesso, auditoria | Segurança (auditoria também Diretoria) |
| Configurações, equipe, território de franquia | Diretoria |
| Tarefas internas | Só as do próprio setor |

### 2.2 Parceiros e clientes

| Ação | Proprietário | Parceiro | Leiloeiro | Franqueado | Comprador / Consulta |
|---|---|---|---|---|---|
| Ver mapa, anúncios e termos | sim | sim | sim | sim | sim |
| Consultar informações de área do CAR | sim | sim | sim | sim | sim (com conta) |
| Anunciar imóvel | sim, o próprio | sim, com conta aprovada | sim, em leilão | sim, com conta aprovada | não |
| Documento obrigatório | matrícula | matrícula + autorização do proprietário | edital | matrícula + autorização | — |
| Ver os próprios imóveis e documentos | sim | sim | sim | sim | — |
| Ver imóveis, documentos ou leads de terceiros | não | não | não | não | não |
| Ver oportunidades | as encaminhadas a ele | as encaminhadas a ele | idem | idem | — |
| Aprovar ou publicar | não | não | não | não | não |

Aprovação e publicação são sempre da Matriz, inclusive para o franqueado.

## 3. RLS (Row-Level Security)

Medido em 01/10/2026: 41 tabelas no schema `public`; **39 com RLS ligada**. As
duas sem RLS são `spatial_ref_sys` (tabela do PostGIS, só leitura de sistemas
de coordenadas) e nenhuma outra — `_migrations` foi fechada na migration 0026.

- Tabelas com RLS e **sem policy** só são alcançadas pelo servidor:
  `auth_events`, `car_imoveis`, `consultas_area`, `jobs`, `rate_limits`, `tasks`.
- Imóvel: visível publicamente só quando publicado, em negociação ou vendido;
  editável só pelo dono, pelo parceiro responsável ou pela equipe.
- Documentos do imóvel, autorizações e selfie: só o responsável pelo imóvel e a
  equipe. O bucket `docs` é privado; o acesso é por endereço assinado de 1 hora.
- Chamados e pedidos LGPD: o usuário lê os próprios; nota interna não aparece.
- `audit_log` e `auth_events` são somente-inserção: não há policy de alteração
  nem de exclusão, e só o servidor escreve.

### Funções do banco

Achado e corrigido em 01/10/2026 (migration 0026): 34 funções `SECURITY
DEFINER` estavam executáveis pela API pública (`/rpc/...`), o que permitiria,
com a chave pública, registrar venda, trocar a divisa de um imóvel ou ler a
receita. Agora só o servidor as executa. Ficam abertas as sete funções que as
policies consultam (`fn_is_arini`, `fn_role`, `fn_property_visible*`,
`fn_property_editable_id`, `fn_opp_visible*`). Função nova nasce fechada.

Teste (chave pública, sem login): `fn_financeiro_mensal`, `fn_rate_limit`,
`fn_car_resumo` e `fn_properties_geojson` devolvem "permission denied";
`property_documents` e `auth_events` devolvem vazio.

## 4. Autenticação

| Requisito | Situação |
|---|---|
| Senha nunca em texto puro | Hash bcrypt com salt, do Supabase Auth. Ninguém da equipe vê a senha. O requisito cita Argon2id "ou equivalente"; bcrypt é o que o provedor oferece. |
| Política de senha | Mínimo de 10 caracteres, com letras e números, sem as senhas mais comuns (`src/lib/seguranca/senha.ts`). Vale no cadastro, na troca e na recuperação. |
| Limite de tentativas | Login: 30 por IP a cada 10 min e 8 por e-mail a cada 15 min. Cadastro: 6 por IP por hora. Recuperação: 3 por e-mail por hora. Código do segundo fator: 6 erros a cada 15 min. Contador no banco (`fn_rate_limit`). |
| Registro de tentativas | Tabela `auth_events`: entrada, erro, bloqueio, recuperação, troca de senha, segundo fator, com IP e navegador. Tela em Segurança. |
| Segundo fator (MFA) | TOTP por aplicativo autenticador, em Segurança da conta. A diretoria pode torná-lo obrigatório para a equipe (Configurações › Segurança). |
| Recuperação de senha | Link de uso único com validade de 1 hora; a senha antiga nunca é enviada; a resposta é a mesma exista a conta ou não. |
| Sessões | Trocar a senha encerra as outras sessões. O usuário encerra as outras sessões quando quiser. A sessão da Central expira (padrão: 12 horas, configurável). |
| Mensagem de erro de login | Igual para e-mail inexistente e senha errada. |

Testado em `scripts/testa-matriz.mjs`: ativação do TOTP, login exigindo o
código, eventos gravados.

## 5. Segredos

- Nenhuma chave no código-fonte: todas vêm de variáveis de ambiente do servidor.
- `.env.local` está no `.gitignore`.
- Expostas ao navegador (por serem públicas por natureza): endereço do
  Supabase, chave pública do Supabase e a chave do satélite, que deve ser
  restrita ao domínio do site no painel do fornecedor.

## 6. Criptografia

- Em trânsito: HTTPS/TLS (certificado no proxy do servidor).
- Em repouso: criptografia de disco do provedor do banco e do armazenamento.
- Criptografia por coluna: não aplicada. O dado mais sensível em coluna é o
  CPF/CNPJ, que precisa ser pesquisável (unicidade da conta).

## 7. Dados sensíveis

| Dado | Onde fica | Quem acessa |
|---|---|---|
| Matrícula, edital, CCIR/ITR, autorização, procuração | bucket `docs` (privado) | responsável pelo imóvel e equipe, por endereço assinado |
| Selfie do aceite da exclusividade | bucket `docs` (privado) | equipe (Operações/Jurídico), na análise do imóvel |
| CPF/CNPJ | `profiles.cpf_cnpj` | o próprio usuário e a equipe |
| Fotos e vídeos do anúncio | bucket `media` (público) | públicos por natureza |

A selfie é foto de identificação para conferência humana. **Não há
reconhecimento facial** nem extração de dado biométrico. A exigência pode ser
desligada em Configurações › Dados jurídicos.

## 8. Auditoria

- `audit_log`: cadastro, anúncio, decisão, documento conferido, venda, comissão,
  configuração, tarefa, chamado, exportação financeira. Com usuário, data e o
  antes/depois.
- `auth_events`: acessos (seção 4).
- `consultas_area_log`: quem consultou cada área do CAR.
- Aceites de termos: versão, data, hora, usuário e IP.

## 9. Segurança das rotas

- Toda rota de escrita confere a sessão e a permissão no servidor.
- Entradas validadas; limites de tamanho em arquivos (25 MB por documento,
  50 MB por vídeo, 15 MB por selfie).
- SQL: só consultas parametrizadas (cliente do Supabase e `pg` com parâmetros).
- Upload: tipo e tamanho conferidos; vídeo vai direto ao armazenamento com
  autorização de uso único; o caminho do arquivo é gerado pelo servidor.

## 10. Inteligência artificial

Ainda não há módulo de IA no sistema. Quando houver, a regra é a do requisito
18: a IA consulta os dados com a permissão do usuário que perguntou, nunca com
a chave mestra.

---

## Pendências de segurança

| Item | Situação | Depende de |
|---|---|---|
| Ambientes separados (desenvolvimento, homologação, produção) | **Não atendido.** Hoje há um banco só, usado no desenvolvimento e na produção. | Criar um segundo projeto de banco para homologação. |
| Backups automáticos e teste de restauração | **Não atendido no plano atual.** O plano gratuito do banco não tem backup automático com retenção. | Plano pago do banco (cerca de US$ 25/mês) e um teste de restauração. |
| Monitoramento e alertas | Parcial: eventos de acesso e bloqueios ficam registrados; não há alerta ativo por e-mail. | Serviço de e-mail configurado. |
| WAF / proteção de borda | Não configurado. | Colocar o domínio atrás da Cloudflare. |
| Varredura de vulnerabilidades e pentest | Não feito. | Contratação externa antes do lançamento, como pede o item 21. |
| Plano de resposta a incidentes | Não escrito. | Definição de responsáveis com a Arini. |
| Mapa de dados pessoais (LGPD, item 19) | Parcial: a Política de Privacidade lista dados, finalidades e prazos. Falta o registro formal das operações de tratamento. | Jurídico da Arini. |
| Limite de requisições nas rotas públicas de leitura | Parcial: há limite em login, cadastro, lead, suporte, consulta e envio de mídia; as leituras do mapa não têm. | Avaliar com o tráfego real. |
| Atualização de dependências | Manual. | Rotina mensal de `npm audit`. |
