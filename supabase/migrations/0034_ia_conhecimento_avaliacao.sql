-- Arini Maps — migration 0034: assistente de IA, base de conhecimento e pré-avaliação.
--
-- PENDÊNCIAS 5.1 a 5.4 (Melhorias 16, 17 e 18; Segurança 18).
--
--  · ia_conversas / ia_mensagens — toda conversa do assistente fica gravada para
--    auditoria: quem perguntou, tokens de entrada e saída, ferramentas usadas.
--    O audit_log recebe só metadados (nunca o texto).
--  · kb_artigos / kb_artigos_versoes — base de conhecimento editável pela
--    Matriz, com fonte, data de referência e versão a cada alteração. A busca é
--    full-text em português (fn_kb_buscar) e vira a ferramenta
--    `buscar_conhecimento` do assistente.
--  · avaliacoes — cada pré-avaliação de valor e cada leitura de aptidão
--    territorial guarda entradas, saídas, versão da metodologia e quem pediu.
--  · fn_avaliacao_contexto — dados do imóvel e dos comparáveis numa só ida ao
--    banco (distâncias calculadas no PostGIS).
--  · plano: recurso `chat_ia` (consulta profissional, parceiro, organização,
--    franquia; planos gratuitos com cota `mensagens_ia_mes` = 20).
--
-- Tudo idempotente. Tabelas com RLS ligada e SEM policy: só o servidor
-- (service role) lê e grava. Funções novas fechadas a anon/authenticated.

-- ---------------------------------------------------------------- IA
create table if not exists ia_conversas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  titulo text,
  modelo text,
  mensagens integer not null default 0,
  tokens_entrada bigint not null default 0,
  tokens_saida bigint not null default 0,
  tokens_cache_leitura bigint not null default 0,
  tokens_cache_escrita bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ix_ia_conversas_user on ia_conversas (user_id, updated_at desc);
create index if not exists ix_ia_conversas_updated on ia_conversas (updated_at desc);

create table if not exists ia_mensagens (
  id uuid primary key default gen_random_uuid(),
  conversa_id uuid not null references ia_conversas(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  papel text not null check (papel in ('user', 'assistant')),
  conteudo text not null default '',
  -- [{ "nome": "buscar_imoveis", "entrada": {...}, "ok": true }]
  ferramentas jsonb not null default '[]'::jsonb,
  modelo text,
  tokens_entrada integer not null default 0,
  tokens_saida integer not null default 0,
  tokens_cache_leitura integer not null default 0,
  tokens_cache_escrita integer not null default 0,
  erro text,
  created_at timestamptz not null default now()
);
create index if not exists ix_ia_mensagens_conversa on ia_mensagens (conversa_id, created_at);
create index if not exists ix_ia_mensagens_user_mes on ia_mensagens (user_id, papel, created_at);

alter table ia_conversas enable row level security;
alter table ia_mensagens enable row level security;

-- ---------------------------------------------------------------- base de conhecimento
create table if not exists kb_artigos (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{2,80}$'),
  titulo text not null check (length(titulo) between 3 and 200),
  conteudo text not null default '',
  fonte text not null default '',
  data_referencia date not null default current_date,
  status text not null default 'rascunho' check (status in ('rascunho', 'publicado', 'arquivado')),
  versao integer not null default 1,
  atualizado_por uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  busca tsvector generated always as (
    setweight(to_tsvector('portuguese', coalesce(titulo, '')), 'A') ||
    setweight(to_tsvector('portuguese', coalesce(conteudo, '')), 'B') ||
    setweight(to_tsvector('portuguese', coalesce(fonte, '')), 'C')
  ) stored
);
create index if not exists ix_kb_artigos_busca on kb_artigos using gin (busca);
create index if not exists ix_kb_artigos_status on kb_artigos (status, updated_at desc);

create table if not exists kb_artigos_versoes (
  id uuid primary key default gen_random_uuid(),
  artigo_id uuid not null references kb_artigos(id) on delete cascade,
  versao integer not null,
  titulo text not null,
  conteudo text not null,
  fonte text not null,
  data_referencia date not null,
  status text not null,
  editado_por uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (artigo_id, versao)
);

alter table kb_artigos enable row level security;
alter table kb_artigos_versoes enable row level security;

-- versão nova só quando o conteúdo muda (mudar só o status também conta: é
-- publicação/arquivamento e precisa ficar na trilha)
create or replace function fn_kb_antes_update() returns trigger
language plpgsql as $$
begin
  if (new.titulo, new.conteudo, new.fonte, new.data_referencia, new.status)
     is distinct from (old.titulo, old.conteudo, old.fonte, old.data_referencia, old.status) then
    new.versao := old.versao + 1;
    new.updated_at := now();
  end if;
  return new;
end $$;

create or replace function fn_kb_depois_gravar() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into kb_artigos_versoes (artigo_id, versao, titulo, conteudo, fonte, data_referencia, status, editado_por)
  values (new.id, new.versao, new.titulo, new.conteudo, new.fonte, new.data_referencia, new.status, new.atualizado_por)
  on conflict (artigo_id, versao) do nothing;
  return new;
end $$;

drop trigger if exists tg_kb_antes_update on kb_artigos;
create trigger tg_kb_antes_update before update on kb_artigos
  for each row execute function fn_kb_antes_update();
drop trigger if exists tg_kb_depois_gravar on kb_artigos;
create trigger tg_kb_depois_gravar after insert or update on kb_artigos
  for each row execute function fn_kb_depois_gravar();

-- Busca full-text (português) só nos artigos publicados. Primeiro tenta a
-- consulta "como no Google" (todas as palavras); sem resultado, aceita qualquer
-- uma das palavras — pergunta em linguagem natural raramente casa com todas.
create or replace function fn_kb_buscar(p_q text, p_limite integer default 5)
returns table (id uuid, slug text, titulo text, trecho text, fonte text, data_referencia date, versao integer, rank real)
language plpgsql stable security definer set search_path = public as $$
declare
  v_q tsquery;
  v_n integer;
begin
  if coalesce(trim(p_q), '') = '' then return; end if;
  v_q := websearch_to_tsquery('portuguese', p_q);
  select count(*) into v_n from kb_artigos a where a.status = 'publicado' and a.busca @@ v_q;
  if v_n = 0 then
    select to_tsquery('portuguese', string_agg(quote_literal(w) || ':*', ' | '))
      into v_q
      from (select distinct w from regexp_split_to_table(lower(p_q), '[^[:alnum:]]+') as w where length(w) >= 3) s;
    if v_q is null then return; end if;
  end if;
  return query
    select a.id, a.slug, a.titulo,
           ts_headline('portuguese', a.conteudo, v_q, 'MaxWords=60, MinWords=25, MaxFragments=2, FragmentDelimiter=" … ", StartSel=**, StopSel=**') as trecho,
           a.fonte, a.data_referencia, a.versao, ts_rank(a.busca, v_q) as rank
      from kb_artigos a
     where a.status = 'publicado' and a.busca @@ v_q
     order by rank desc, a.updated_at desc
     limit greatest(1, least(coalesce(p_limite, 5), 10));
end $$;

-- ---------------------------------------------------------------- avaliações
create table if not exists avaliacoes (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  tipo text not null check (tipo in ('pre_avaliacao', 'aptidao')),
  metodologia_versao text not null,
  entradas jsonb not null default '{}'::jsonb,
  resultado jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists ix_avaliacoes_property on avaliacoes (property_id, tipo, created_at desc);
alter table avaliacoes enable row level security;

-- Imóvel avaliado + comparáveis do mesmo tipo num raio (km) entre sedes
-- municipais. Distâncias em metros, geodésicas. Leilão fica fora dos
-- comparáveis (lance mínimo não é preço de mercado).
create or replace function fn_avaliacao_contexto(p_property_id uuid, p_raio_km numeric default 60)
returns jsonb
language sql stable security definer set search_path = public as $$
  with alvo as (
    select p.id, p.codigo, p.tipo::text as tipo, p.status::text as status, p.valor, p.area_declarada,
           p.caracteristicas, p.car_codigo, p.municipality_id, p.modalidade,
           g.area_m2, g.geom, coalesce(g.centroid, st_pointonsurface(g.geom)) as centro,
           m.nome as municipio, m.uf, coalesce(m.sede, st_pointonsurface(m.geom)) as sede
      from properties p
      left join property_geometries g on g.property_id = p.id
      left join municipalities m on m.id = p.municipality_id
     where p.id = p_property_id
  ),
  comps as (
    select c.id, c.codigo, c.status::text as status, c.valor, c.area_declarada, c.modalidade,
           g.area_m2, coalesce(g.centroid, st_pointonsurface(g.geom)) as centro,
           m.id as municipality_id, m.nome as municipio, coalesce(m.sede, st_pointonsurface(m.geom)) as sede,
           (select s.valor_final from sales s where s.property_id = c.id order by s.data_venda desc nulls last, s.created_at desc limit 1) as valor_venda,
           c.sold_at, c.published_at
      from properties c
      join alvo a on a.tipo = c.tipo::text and c.id <> a.id
      left join property_geometries g on g.property_id = c.id
      left join municipalities m on m.id = c.municipality_id
     where c.status in ('publicado', 'em_negociacao', 'vendido')
       and coalesce(c.modalidade, 'venda') <> 'leilao'
       and c.parent_property_id is distinct from a.id
  )
  select jsonb_build_object(
    'alvo', (
      select jsonb_build_object(
        'id', a.id, 'codigo', a.codigo, 'tipo', a.tipo, 'status', a.status, 'valor', a.valor,
        'area_m2', a.area_m2, 'area_declarada', a.area_declarada, 'caracteristicas', a.caracteristicas,
        'car_codigo', a.car_codigo, 'modalidade', a.modalidade,
        'municipality_id', a.municipality_id, 'municipio', a.municipio, 'uf', a.uf,
        'centroide', case when a.centro is null then null else jsonb_build_object('lng', st_x(a.centro), 'lat', st_y(a.centro)) end,
        'geometria', case when a.geom is null then null else st_asgeojson(a.geom, 6)::jsonb end,
        'dist_sede_m', case when a.centro is null or a.sede is null then null
                            else round(st_distance(a.centro::geography, a.sede::geography)) end,
        'dist_rodovia_m', case when a.centro is null then null else (
            select round(min(st_distance(a.centro::geography, r.geom::geography)))
              from (select po.geom from pois po where po.categoria = 'acesso_rodovia'
                     order by po.geom <-> a.centro limit 5) r) end
      ) from alvo a
    ),
    'comparaveis', coalesce((
      select jsonb_agg(jsonb_build_object(
        'codigo', c.codigo, 'status', c.status, 'valor', c.valor, 'valor_venda', c.valor_venda,
        'area_m2', c.area_m2, 'area_declarada', c.area_declarada,
        'municipio', c.municipio, 'mesmo_municipio', c.municipality_id = a.municipality_id,
        'dist_sedes_km', case when c.sede is null or a.sede is null then null
                              else round((st_distance(c.sede::geography, a.sede::geography) / 1000)::numeric, 1) end,
        'dist_sede_m', case when c.centro is null or c.sede is null then null
                            else round(st_distance(c.centro::geography, c.sede::geography)) end,
        'dist_rodovia_m', case when c.centro is null then null else (
            select round(min(st_distance(c.centro::geography, r.geom::geography)))
              from (select po.geom from pois po where po.categoria = 'acesso_rodovia'
                     order by po.geom <-> c.centro limit 5) r) end,
        'data_ref', coalesce(c.sold_at, c.published_at)
      ) order by c.codigo)
      from comps c, alvo a
      where c.municipality_id = a.municipality_id
         or (c.sede is not null and a.sede is not null
             and st_dwithin(c.sede::geography, a.sede::geography, p_raio_km * 1000))
    ), '[]'::jsonb)
  )
$$;

-- ---------------------------------------------------------------- funções fechadas
revoke execute on function fn_kb_buscar(text, integer) from public, anon, authenticated;
revoke execute on function fn_avaliacao_contexto(uuid, numeric) from public, anon, authenticated;
revoke execute on function fn_kb_antes_update() from public, anon, authenticated;
revoke execute on function fn_kb_depois_gravar() from public, anon, authenticated;
grant execute on function fn_kb_buscar(text, integer) to service_role;
grant execute on function fn_avaliacao_contexto(uuid, numeric) to service_role;

-- ---------------------------------------------------------------- planos
update plans set recursos = array_append(recursos, 'chat_ia'), updated_at = now()
 where id in ('consulta_profissional', 'parceiro', 'organizacao', 'franquia', 'consulta_basica', 'anunciante')
   and not ('chat_ia' = any(recursos));
-- planos gratuitos: cota pequena de mensagens por mês (só se ainda não definida)
update plans set cotas = coalesce(cotas, '{}'::jsonb) || '{"mensagens_ia_mes": 20}'::jsonb, updated_at = now()
 where id in ('consulta_basica', 'anunciante')
   and not (coalesce(cotas, '{}'::jsonb) ? 'mensagens_ia_mes');

-- ---------------------------------------------------------------- artigos iniciais
-- Escritos a partir da documentação do próprio sistema (termos de uso, docs/PLANOS.md,
-- configurações). Entram publicados; a equipe edita em /admin/conhecimento.
insert into kb_artigos (slug, titulo, conteudo, fonte, data_referencia, status) values
('como-funciona-a-publicacao', 'Como um imóvel é publicado no Arini Maps',
$md$Nenhum imóvel vai ao ar sem aprovação manual da Arini.

1. O anunciante (proprietário ou parceiro) cadastra o imóvel em **Meu painel › Anunciar**: dados, valor, fotos e a divisa (desenhada no mapa, importada de KML/KMZ ou trazida do CAR).
2. É obrigatório enviar documento que comprove a propriedade (matrícula atualizada, escritura ou contrato registrado). Parceiro envia também a autorização de venda assinada pelo proprietário.
3. A equipe de Operações confere o anúncio com um checklist (inclusive divergência maior que 10% entre área medida e área declarada) e pode aprovar, pedir correção, pedir complemento ou recusar.
4. Aprovado e publicado, o imóvel aparece no mapa e na busca, com ficha pública, tour 3D e pontos de interesse ao redor.
5. Alterações em anúncio publicado viram uma proposta de revisão: o anúncio atual continua no ar até a Matriz aprovar a nova versão.

O prazo de análise previsto nos termos é de até 10 dias úteis depois do envio completo.$md$,
'Termos de uso e autorização de venda (src/lib/juridico.ts); fluxo de análise da Central', '2026-10-07', 'publicado'),

('comissao-da-arini', 'Comissão da Arini sobre a venda',
$md$A regra padrão de remuneração da Arini é **1% sobre o valor da operação**, conforme o contrato de intermediação.

- O percentual padrão fica em **Configurações › Regras comerciais** (Diretoria) e é sugerido ao registrar cada venda; pode ser ajustado caso a caso no contrato.
- A comissão é registrada no momento da venda e segue as etapas registrada → cobrada → paga → conciliada.
- Se o imóvel for vendido durante o prazo da autorização a um interessado apresentado pela Arini, a remuneração continua devida mesmo que a venda tenha ocorrido sem a mediação dela (art. 726 do Código Civil), pelo prazo de proteção definido nos termos.

Valores e prazos exatos de cada negócio estão no contrato assinado — este artigo é só a regra geral.$md$,
'Configurações › Regras comerciais (comissao_percentual_padrao = 1%); termos de autorização de venda', '2026-10-07', 'publicado'),

('o-que-e-o-car', 'O que é o CAR e por que ele não comprova propriedade',
$md$O **Cadastro Ambiental Rural (CAR)** é o registro ambiental obrigatório dos imóveis rurais, mantido no SICAR. O Arini Maps mostra a malha pública do CAR no mapa para facilitar a localização das áreas.

Pontos importantes:
- O CAR é **autodeclarado**: quem cadastra desenha a área. Ele **não comprova propriedade** nem substitui a matrícula do imóvel.
- A divisa trazida do CAR é um ponto de partida. A prova de propriedade é sempre o documento conferido pela Arini (matrícula, escritura ou contrato registrado).
- A situação do cadastro (ativo, pendente, suspenso, cancelado) e a análise do órgão ambiental aparecem na página de consulta da área (/consulta/car/<código>).
- Os dados são copiados do SICAR periodicamente; a data da cópia aparece na página.$md$,
'Termos de uso (seção Anúncios e aprovação); SICAR', '2026-10-07', 'publicado'),

('consulta-de-area-e-fontes', 'Consulta de área: o que é cruzado e como ler o resultado',
$md$A consulta de área cruza a divisa do imóvel (com 2 km ao redor) com fontes oficiais: processos minerários (ANM), terras indígenas (FUNAI), desmatamento (INPE/PRODES e DETER), focos de calor (INPE), unidades de conservação, corpos d'água (hidrografia e ANA) e empreendimentos de energia (ANEEL).

Como ler:
- Cada resultado mostra o órgão e a data da consulta.
- Fonte que não respondeu aparece como **fonte indisponível** — isso não significa ausência de restrição.
- "Nada encontrado" em uma fonte **não equivale a certidão negativa**.
- Bases que dependem de arquivo oficial (SIGEF, embargos do IBAMA, quilombolas, IPHAN, MapBiomas) só contam quando indicadas como consultadas.

A consulta é informativa: não é laudo, parecer nem certidão. Está nos planos profissionais e tem cota mensal por conta.$md$,
'Termos de uso (consulta territorial); página /consulta/car', '2026-10-07', 'publicado'),

('planos-e-recursos', 'Planos do Arini Maps',
$md$Cada conta tem um **plano** que libera ferramentas e define cotas mensais. Os planos são editados pela Diretoria e listados em /planos.

- **Consulta básica** (gratuito): mapa, fichas dos imóveis, divisas do CAR, lotes urbanos, medição, demonstrar interesse, informar imóvel ausente ou divergente e poucas consultas de área por mês.
- **Anunciante** (gratuito): anunciar imóveis próprios e acompanhar as oportunidades, com limite de imóveis ativos.
- **Consulta profissional**: camadas oficiais no mapa, consulta de área com cota maior, relatório territorial, importar KML/KMZ, imprimir/capturar, histórico do imóvel e pré-avaliação (quando liberada).
- **Parceiro profissional**: recursos profissionais + carteira de imóveis de terceiros e atendimento de oportunidades.
- **Organização** e **Franquia**: definidos pela Matriz.

Quando um recurso não está no plano, o sistema bloqueia e registra a tentativa. Para mudar de plano, fale com a Arini.$md$,
'docs/PLANOS.md; página /planos', '2026-10-07', 'publicado'),

('solicitacoes-cartograficas', 'Não encontrei meu imóvel ou o mapa está divergente',
$md$Pelo mapa (ou em /cartografia/solicitar) qualquer conta pode abrir uma **solicitação cartográfica**: inclusão de imóvel não cartografado, correção de geometria, divergência, atualização de área, desmembramento, unificação, sobreposição ou erro de localização.

- Cada pedido recebe um protocolo (CART-000001…) e pode ter anexos.
- A equipe de Cartografia da Matriz faz a triagem e o pedido passa por: recebida → em triagem → em análise → (aguardando documentação) → em vetorização/correção → em revisão → aprovada → publicada, ou rejeitada/cancelada.
- O solicitante acompanha em **Meu painel › Mapa: solicitações** e conversa com a equipe por mensagens.
- A geometria enviada pelo usuário só vira oficial quando a Matriz aplica e valida.$md$,
'Requisitos cartográficos §2 (Carlos, 05/10/2026); src/lib/cartografia/solicitacoes.ts', '2026-10-07', 'publicado'),

('privacidade-e-lgpd', 'Privacidade, LGPD e como pedir seus dados',
$md$A Arini trata os dados pessoais conforme a Lei Geral de Proteção de Dados (LGPD) e a Política de Privacidade publicada em /termos.

- Você pode pedir acesso, correção, portabilidade ou exclusão dos seus dados ao **encarregado de dados**, pelo e-mail indicado na Política de Privacidade (Configurações › Dados jurídicos; se não houver um específico, vale o e-mail público de contato).
- Documentos dos imóveis ficam em área privada, acessível só ao anunciante e à equipe da Arini.
- O assistente de IA do site não acessa dados pessoais: ele só consulta imóveis publicados, dados públicos do CAR e esta base de conhecimento. As conversas ficam registradas para auditoria.$md$,
'Política de privacidade (src/lib/juridico.ts); Configurações › Dados jurídicos', '2026-10-07', 'publicado'),

('interesse-e-negociacao', 'Demonstrei interesse em um imóvel: o que acontece',
$md$Ao clicar em **Tenho interesse** na ficha do imóvel e autorizar o contato:

1. O pedido vira um lead e uma oportunidade com código (OP-000001…) na central da Arini.
2. A equipe Comercial qualifica o interesse e encaminha ao responsável pelo atendimento.
3. A partir daí vêm visita, propostas (em rodadas, se houver contraproposta), contrato e, na venda, o registro da comissão.

Toda negociação é intermediada pela Arini. Você também pode chamar a central pelo WhatsApp exibido na ficha.$md$,
'Fluxograma do funil comercial; rota /api/leads', '2026-10-07', 'publicado'),

('tour-3d-e-pontos-de-interesse', 'Tour 3D e pontos de interesse da ficha',
$md$Imóveis com divisa no mapa ganham um **tour 3D**: terreno real (modelo de elevação Terrarium) com imagem de satélite, contorno da propriedade, aproximação, órbita e os pontos de interesse ao redor.

Os **pontos de interesse** (postos, farmácias, supermercados, hospital, escolas, centro da cidade e acessos a rodovias) vêm do OpenStreetMap e são vinculados automaticamente quando o imóvel é publicado. As distâncias mostradas na ficha são em linha reta, a partir do centro do imóvel.$md$,
'README-DEV (Tour 3D, POIs reais via Overpass)', '2026-10-07', 'publicado'),

('rastreabilidade-da-divisa', 'Divisa validada, versões e rastreabilidade',
$md$Cada troca da divisa de um imóvel gera uma nova **versão**, com origem (desenho, KML, CAR, cartografia), motivo e responsável.

- "Divisa validada pela Arini" significa que a equipe conferiu e validou aquela versão.
- "Divisa informada pelo anunciante" significa que ainda está em análise.
- O histórico completo (versões, origem de cada dado e eventos) aparece para o dono do anúncio, o parceiro responsável e quem tem o recurso Histórico no plano.

A área medida no mapa é geodésica; a área declarada é a que o anunciante informou.$md$,
'Requisitos cartográficos §1 (rastreabilidade); migration 0029', '2026-10-07', 'publicado'),

('leiloes', 'Imóveis de leilão',
$md$Imóveis de leilão aparecem com o selo **LEILÃO** e mostram 1ª e 2ª praça, lance mínimo, comitente e processo, quando informados.

- O valor exibido é o **lance inicial**, não um preço de mercado.
- Os lances são dados na página do leiloeiro, nas condições do edital. Leia o edital antes de participar.
- Por isso, imóveis de leilão não entram como comparáveis na pré-avaliação de valor.$md$,
'Ficha pública do imóvel (modalidade leilão); docs/PRE-AVALIACAO.md', '2026-10-07', 'publicado'),

('pre-avaliacao-e-aptidao', 'Pré-avaliação de valor e aptidão territorial',
$md$A pré-avaliação é uma **estimativa automatizada, que não substitui avaliação profissional** (laudo de engenheiro ou corretor avaliador).

- Usa como comparáveis os imóveis do próprio sistema, do mesmo tipo, no mesmo município ou em municípios próximos, normalizados em R$/ha (rural) ou R$/m² (urbano).
- Aplica fatores documentados (oferta × venda, tamanho da área, distância à sede municipal e a acessos de rodovia) e mostra o efeito de cada um.
- Com poucos comparáveis, responde "dados insuficientes" em vez de inventar um número.
- A aptidão territorial indica, de forma qualitativa, se a área parece mais propícia a lavoura, pecuária ou se tem restrições, listando os fatores e os dados que faltam. Não estima rentabilidade.

A metodologia completa está em docs/PRE-AVALIACAO.md e só fica disponível ao público quando a Diretoria liga a função.$md$,
'docs/PRE-AVALIACAO.md (metodologia v0)', '2026-10-07', 'publicado')
on conflict (slug) do nothing;

notify pgrst, 'reload schema';
