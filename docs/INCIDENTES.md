# Plano de resposta a incidentes de segurança

Item 6.10 do roadmap e requisito 20 do documento de segurança e LGPD
("identificação, contenção, investigação, recuperação e documentação").
Versão 1 — 07/10/2026. Os campos `[PREENCHER]` dependem da Arini (Carlos) e
do jurídico; enquanto estiverem vazios, o plano não está valendo.

> Regra de ouro: **conter primeiro, preservar a evidência sempre, comunicar
> no prazo**. Nada de apagar log, "limpar" conta ou restaurar backup antes de
> copiar o que vai servir para entender o que aconteceu.

---

## 1. Papéis

| Papel | Quem | Contato | Substituto |
|---|---|---|---|
| Coordenador do incidente (decide e registra) | [PREENCHER — Diretoria da Arini] | [PREENCHER] | [PREENCHER] |
| Responsável técnico (contém e investiga) | Stênio (desenvolvedor) | [PREENCHER] | [PREENCHER] |
| Encarregado de dados — DPO (ANPD e titulares) | [PREENCHER — item 7.2 do roadmap] | [PREENCHER] | [PREENCHER] |
| Jurídico (avalia risco e redige comunicações) | [PREENCHER] | [PREENCHER] | — |
| Comunicação com clientes e parceiros | [PREENCHER] | [PREENCHER] | — |

Canal interno do incidente: [PREENCHER — ex.: grupo de WhatsApp "Incidente Arini Maps", criado só na hora].
Fornecedores a acionar: Supabase (banco, autenticação e arquivos — suporte pelo painel),
provedor do servidor da aplicação [PREENCHER], registro do domínio [PREENCHER],
Cloudflare (quando houver, item 1.7), Resend (e-mail), Asaas (cobrança).

## 2. Gravidade

| Nível | Exemplos | Quem acionar | Tempo para começar |
|---|---|---|---|
| **S1 — Crítico** | Vazamento ou acesso indevido a dados pessoais (documentos, selfies, CPF), conta da Diretoria tomada, chave mestra (`SUPABASE_SERVICE_ROLE_KEY`) exposta, banco apagado ou sequestrado | Todos os papéis | Imediato, inclusive fora do horário |
| **S2 — Alto** | Conta de parceiro/proprietário tomada, alteração indevida de anúncio publicado, abuso que derruba o site, segredo secundário exposto (Resend, Asaas, Esri, IA) | Coordenador + técnico | Até 4 horas |
| **S3 — Médio** | Tentativas em massa barradas pelo limite, vulnerabilidade achada sem sinal de uso, alerta de acesso anormal confirmado como falso | Técnico | Próximo dia útil |
| **S4 — Baixo** | Erro de configuração sem exposição | Técnico | Na rotina |

Na dúvida entre dois níveis, use o mais alto. Envolvendo dado pessoal, a
avaliação de risco ao titular (seção 5) é obrigatória em qualquer nível.

## 3. Como um incidente chega

- Alerta em **Central › Segurança** (novo aparelho/local, excesso de falhas,
  entrada após falhas, recuperação de senha da equipe) — `alertas_seguranca`.
- Muitas tentativas negadas de documentos ("Documentos negados em 7 dias") —
  `document_access_log`.
- Relato de usuário (suporte, e-mail do encarregado), de parceiro ou de
  pesquisador de segurança.
- Aviso de fornecedor (Supabase, provedor, GitHub alertando segredo no código).

Quem receber anota hora, canal e o que foi relatado e passa ao coordenador.

## 4. Primeiras 24 horas — checklist

### Hora 0–1: conter

- [ ] Abrir o registro do incidente (modelo na seção 7) com hora de início.
- [ ] Conta tomada: desativar em **Equipe e usuários** (o login passa a ser
      recusado) e encerrar as sessões (Supabase › Authentication › Users ›
      "Sign out user"); trocar a senha pelo fluxo de recuperação.
- [ ] Chave exposta: girar na hora pelo procedimento de `docs/SEGURANCA.md` §11.
      Chave mestra exposta = S1 e troca imediata, mesmo com o site fora do ar
      alguns minutos.
- [ ] Ataque em andamento ao site: ligar a senha de bloqueio (`SITE_SENHA`),
      que fecha todas as páginas e APIs (o webhook do Asaas continua).
- [ ] Arquivo do cofre exposto: a URL assinada vale 60 s; o link interno
      (`/api/arquivos/...`) confere permissão a cada clique. Se o problema for
      permissão errada, corrigir a regra antes de reabrir.
- [ ] **Não** apagar logs, contas, arquivos nem restaurar backup ainda.

### Hora 1–4: preservar evidências

- [ ] Exportar (SQL, somente leitura) e guardar fora do servidor, com data/hora:
      `auth_events`, `alertas_seguranca`, `document_access_log`, `access_attempts`,
      `audit_log`, `property_events` do período. Esses registros são
      somente-inserção (nem o servidor apaga) — mesmo assim, copie.
- [ ] Logs do servidor da aplicação e do Supabase (Logs Explorer: API, Auth,
      Storage) do período — o plano gratuito guarda pouco tempo.
- [ ] Anotar IPs, contas, aparelhos (`agente`) e horários envolvidos.
- [ ] Gerar hash (SHA-256) dos arquivos exportados e anotar no registro.

### Hora 4–24: investigar e decidir

- [ ] O que aconteceu, desde quando, por onde entrou, o que foi acessado,
      alterado ou copiado; quais titulares e quais dados.
- [ ] O vetor ainda está aberto? Corrigir (código, permissão, chave).
- [ ] Avaliar risco aos titulares (seção 5) e decidir as comunicações.
- [ ] Recuperar: restaurar dado alterado a partir do histórico (`audit_log`,
      `property_geometry_versions`, `property_revisions`) ou do backup (item 1.6).
- [ ] Reabrir o acesso só depois da correção conferida.

## 5. Comunicação à ANPD e aos titulares (LGPD, art. 48)

O controlador (Arini) comunica à **ANPD** e aos **titulares** o incidente que
possa acarretar **risco ou dano relevante** — por exemplo, quando envolve dado
sensível, documentos de identificação, selfie, CPF, dados financeiros, ou um
volume grande de pessoas.

- **Prazo:** 3 (três) dias úteis contados do conhecimento de que o incidente
  afetou dados pessoais — Regulamento de Comunicação de Incidente de Segurança
  (Resolução CD/ANPD nº 15/2024). Informação que ainda faltar pode ser
  complementada depois, dentro do prazo do regulamento. **Confirmar o texto
  vigente com o jurídico** antes de usar.
- **Como:** formulário de comunicação de incidente no site da ANPD (gov.br/anpd),
  pelo encarregado.
- **Conteúdo mínimo (art. 48, § 1º):** natureza dos dados afetados; titulares
  envolvidos; medidas técnicas e de segurança usadas para proteger os dados;
  riscos relacionados; motivos da demora, se a comunicação não foi imediata;
  medidas adotadas ou que serão adotadas para reverter ou mitigar o prejuízo.
- **Aos titulares:** linguagem simples, pelo e-mail cadastrado (e outro canal se
  necessário), dizendo o que aconteceu, quais dados, o que a Arini fez e o que
  a pessoa deve fazer (trocar senha, ativar segundo fator, desconfiar de contato
  em nome da Arini).
- **Registro:** todo incidente com dado pessoal fica registrado, comunicado ou
  não, com a justificativa da decisão — guardar por no mínimo 5 anos.

Modelo de aviso ao titular:

> Assunto: Aviso de segurança sobre sua conta no Arini Maps
>
> Em [DATA], identificamos [O QUE ACONTECEU, em uma frase]. Os dados
> envolvidos foram: [LISTA]. Assim que soubemos, [MEDIDAS: ex.: bloqueamos o
> acesso, trocamos as chaves, corrigimos a falha]. Recomendamos que você
> [AÇÕES: trocar a senha em Minha segurança, ativar o segundo fator]. A Arini
> nunca pede senha ou código por telefone ou WhatsApp. Dúvidas:
> [E-MAIL DO ENCARREGADO].

## 6. Depois do incidente

- Pós-incidente em até 10 dias úteis (modelo abaixo), sem buscar culpado:
  o objetivo é a causa e a correção.
- Ações viram pendências no roadmap com responsável e prazo.
- Revisar este plano se algo nele não funcionou.

## 7. Modelos

### Registro do incidente

```
Código: INC-AAAA-NN          Gravidade: S_          Situação: aberto | contido | encerrado
Detectado em: ____/____/____ __:__   por: __________   canal: __________
Coordenador: __________   Técnico: __________   Encarregado: __________

Linha do tempo (hora — fato — quem):
-

Dados pessoais envolvidos? sim | não    Quais: __________    Quantos titulares: ____
Risco relevante aos titulares? sim | não — justificativa: __________
ANPD comunicada em: ____/____  protocolo: ______   Titulares comunicados em: ____/____
Evidências guardadas (arquivo — hash SHA-256 — onde):
-
Encerrado em: ____/____/____
```

### Pós-incidente (post-mortem)

```
1. Resumo (3 linhas): o que aconteceu, impacto, duração.
2. Linha do tempo: detecção → contenção → correção → reabertura.
3. Causa raiz: o que permitiu (técnico e de processo). Por que não foi detectado antes?
4. O que funcionou bem.
5. O que não funcionou.
6. Ações (o quê — responsável — prazo — item do roadmap):
   -
7. Comunicações feitas (ANPD, titulares, parceiros), com datas.
```

## 8. Testes do plano

Uma vez por semestre, simulação de mesa (1 hora): o coordenador descreve um
cenário (ex.: "a chave mestra apareceu num print no grupo") e o time percorre
o checklist da seção 4. Registrar a data e o que precisou mudar aqui.
