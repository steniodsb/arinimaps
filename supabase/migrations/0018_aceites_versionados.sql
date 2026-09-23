-- Arini Imóveis Brasil — migration 0018: aceites jurídicos versionados.
--
-- A especificação (item 8) exige "guardar a versão do termo/contrato aceito,
-- data, hora e usuário", e não presumir que toda autorização é exclusividade.
-- Até aqui só owners/partners guardavam `aceite_termos_at` (sem versão), o
-- comprador não guardava nada e `property_authorizations` existia desde a 0001
-- sem nenhuma escrita. Os textos ficam em src/lib/juridico.ts; aqui guardamos
-- qual versão cada pessoa aceitou (ex.: "termos-de-uso@1.0,privacidade@1.0").

alter table profiles
  add column if not exists aceite_termos_at timestamptz,
  add column if not exists aceite_termos_versao text,
  add column if not exists aceite_termos_ip text;

alter table owners   add column if not exists aceite_termos_versao text;
alter table partners add column if not exists aceite_termos_versao text;

-- condição comercial do imóvel: autorização simples, exclusividade Arini, ou
-- imóvel de parceiro (a autorização do proprietário é com o parceiro)
alter table property_authorizations drop constraint if exists property_authorizations_tipo_check;
alter table property_authorizations
  add constraint property_authorizations_tipo_check
  check (tipo in ('autorizacao', 'exclusividade', 'parceiro'));

alter table property_authorizations
  add column if not exists versao text,
  add column if not exists aceite_por uuid references profiles(user_id),
  add column if not exists aceite_ip text;

create index if not exists idx_property_authorizations_property
  on property_authorizations (property_id, created_at desc);

-- consentimento do formulário de interesse: qual política a pessoa viu
alter table leads add column if not exists consentimento_versao text;
