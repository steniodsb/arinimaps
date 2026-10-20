-- Arini Imóveis Brasil — migration 0048: número da matrícula do anúncio (20/10/2026)
--
-- Pedido do Carlos: ver o número da matrícula do imóvel para pedir o espelho no
-- cartório e confirmar a exclusividade. O SIGEF dá o número só de imóvel rural
-- certificado (src/lib/rural/matricula.ts); urbano e rural não certificado não
-- têm fonte gratuita. Aqui o anunciante informa o número e o cartório junto do
-- documento que já é obrigatório, e a Matriz confere com o documento.
--
-- Tabela própria, sem política de leitura para anon/authenticated: só o
-- servidor (service role) lê. O site público mostra apenas "matrícula
-- conferida pela Arini", nunca o número.

create table if not exists property_matriculas (
  property_id uuid primary key references properties(id) on delete cascade,
  numero text not null check (char_length(numero) between 1 and 120),
  cartorio text check (cartorio is null or char_length(cartorio) <= 200),
  conferida_em timestamptz,
  conferida_por uuid,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table property_matriculas enable row level security;

comment on table property_matriculas is
  'Número e cartório da matrícula informados no anúncio; conferidos pela Matriz contra o documento (property_documents tipo matricula). Leitura só pelo servidor.';
