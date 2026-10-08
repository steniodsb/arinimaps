-- Arini Imóveis Brasil — migration 0043: imóveis favoritos.
--
-- Quem tem conta guarda os favoritos aqui (vale em qualquer aparelho). O
-- visitante sem conta guarda num cookie (`arini_fav`); ao entrar, a rota
-- /api/favoritos junta o cookie na conta. Cada favorito novo também vira um
-- evento 'favorito' no histórico do imóvel (property_events).

create table if not exists favoritos (
  user_id uuid not null references auth.users(id) on delete cascade,
  property_id uuid not null references properties(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, property_id)
);
create index if not exists idx_favoritos_property on favoritos(property_id);

alter table favoritos enable row level security;

drop policy if exists p_favoritos_proprios on favoritos;
create policy p_favoritos_proprios on favoritos for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- a Matriz vê quantas pessoas favoritaram (interesse no anúncio), não quem
drop policy if exists p_favoritos_matriz on favoritos;
create policy p_favoritos_matriz on favoritos for select using (fn_is_arini());
