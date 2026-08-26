-- Arini Imóveis Brasil — migration 0011: WhatsApp da central (botão do anúncio)

insert into settings (chave, valor) values
  ('whatsapp_central', '"553499745140"')
on conflict (chave) do nothing;
