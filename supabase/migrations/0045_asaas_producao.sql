-- Arini Imóveis Brasil — migration 0045: Asaas em produção
--
-- 1. invoice_status ganha 'estornada': o Asaas devolveu o dinheiro (estorno)
--    ou o cliente abriu chargeback. A fatura deixa de contar como recebida.
-- 2. profiles.asaas_customer_id: o id do cliente no Asaas fica guardado no
--    perfil, para não criar um cliente novo a cada cobrança da mesma pessoa.
-- 3. asaas_webhook_events: o Asaas entrega "pelo menos uma vez" e reenvia
--    eventos. O id do evento (evt_...) vira chave primária: o segundo envio
--    do mesmo evento é reconhecido e não repete efeito nem auditoria.

alter type invoice_status add value if not exists 'estornada';

alter table profiles add column if not exists asaas_customer_id text;
create unique index if not exists uq_profiles_asaas_customer
  on profiles (asaas_customer_id) where asaas_customer_id is not null;
comment on column profiles.asaas_customer_id is
  'Id do cliente no Asaas (cus_...). Preenchido na primeira cobrança.';

create table if not exists asaas_webhook_events (
  id text primary key,                 -- id do evento no Asaas (evt_...)
  evento text not null,                -- PAYMENT_RECEIVED, PAYMENT_OVERDUE...
  payment_id text,                     -- pay_...
  external_reference text,             -- invoices.id ou commissions.id
  recebido_em timestamptz not null default now()
);
create index if not exists idx_asaas_webhook_events_payment on asaas_webhook_events (payment_id);
alter table asaas_webhook_events enable row level security;
-- sem policy: só a service role (rota do webhook) lê e escreve.
