# Monitoramento e alertas (roadmap 1.10)

## Dentro do sistema
- **`GET /api/saude`**: 200 quando banco e armazenamento respondem, 503 quando não. Sem token devolve
  só `{ ok }`; com `x-saude-token: <SAUDE_TOKEN>` devolve cada componente com tempo de resposta:
  banco, armazenamento, tiles do CAR, fila do worker (tarefa parada há 30+ min), fontes oficiais
  instáveis e chave de IA. Abre mesmo com o site travado pela senha de testes.
- **Worker** (`worker/jobs/monitorar.mjs`): confere `/api/saude` a cada 5 min; componente com problema
  vira alerta em **Segurança › Alertas** ("Parte do sistema fora do ar") e e-mail para `ALERTA_EMAILS`
  (ou o e-mail de notificação das Configurações). Um alerta por componente por hora. Site sem resposta
  = gravidade alta. Testado em 08/10/2026: fila atrasada (média) e site fora (alta) detectados.
- **Fontes oficiais**: verificação a cada 6 h (`verificar_fontes`), situação em Cartografia › Fontes.

## Fora do sistema (pega a VPS inteira caindo, worker junto)
Uptime Kuma (no Dokploy, 1 container) ou UptimeRobot grátis:
- monitor HTTP em `https://ariniimoveisbrasil.com.br/api/saude`, intervalo 1 min, alerta por
  e-mail/WhatsApp/Telegram após 2 falhas;
- monitor de palavra-chave na página inicial;
- certificado SSL (aviso 14 dias antes de vencer).

## Responsáveis
| Alerta | Quem recebe |
|---|---|
| Site/banco/armazenamento fora | Stenio (técnico) + Carlos |
| Fila do worker, tiles, fontes | Stenio |
| Custo da IA e do satélite (painéis da Anthropic e da Esri) | Carlos, limite de gasto configurado nos dois painéis |
| Segurança (acesso anormal) | já vai para Segurança › Alertas e e-mail do dono da conta |
