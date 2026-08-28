-- Arini Imóveis Brasil — migration 0014: CPF/CNPJ como identidade da conta
--
-- Regra de negócio: quem anuncia ou demonstra interesse num imóvel precisa ser
-- rastreável a uma pessoa real. E-mail identifica a caixa, não a pessoa.
-- O CPF passa a ser obrigatório no cadastro e único no sistema.

-- normaliza o que já existe (tira pontuação) antes de criar o índice único
update profiles set cpf_cnpj = regexp_replace(cpf_cnpj, '\D', '', 'g')
where cpf_cnpj is not null;

-- índice único ignora nulos: contas antigas seguem válidas até completarem o dado
create unique index if not exists uq_profiles_cpf_cnpj
  on profiles (cpf_cnpj) where cpf_cnpj is not null;

comment on column profiles.cpf_cnpj is
  'Somente dígitos. CPF (11) para pessoa física, CNPJ (14) para imobiliária. Único.';
