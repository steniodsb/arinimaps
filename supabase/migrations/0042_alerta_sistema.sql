-- Monitoramento (roadmap 1.10): o worker confere /api/saude a cada 5 minutos e,
-- quando um componente cai (banco, armazenamento, tiles, fila do worker, fontes
-- oficiais), registra aqui — aparece em Segurança › Alertas, ao lado dos
-- alertas de acesso — e manda e-mail aos responsáveis (Resend).
alter table alertas_seguranca drop constraint if exists alertas_seguranca_tipo_check;
alter table alertas_seguranca add constraint alertas_seguranca_tipo_check check (tipo = any (array[
  'novo_aparelho', 'novo_local', 'excesso_falhas', 'entrada_apos_falhas', 'recuperacao_equipe',
  'sistema_instavel'
]));
