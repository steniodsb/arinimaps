# Ambiente de homologação — roteiro (roadmap 1.5)

Cópia separada da produção para testar cada mudança antes de publicar, sem dados reais
sensíveis. Tudo abaixo está pronto no código; só faltam as contas e credenciais.

## 1. Banco (Supabase)

1. Criar um projeto novo no Supabase (região São Paulo), ligar a extensão **PostGIS**.
2. Num `.env.homolog` local, copiar o `.env.local` trocando:
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
   `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD`.
3. Aplicar todas as migrations e os dados de demonstração — um comando, sem tocar no `.env.local`
   (recusa se o `.env.homolog` apontar para a produção):

```bash
node scripts/homologacao.mjs
```

4. Subir as plantas pela tela Admin › Cartografia (ou `scripts/converte-dxf.mjs`) e gerar os lotes
   (`scripts/gera-lotes.mjs`).

**Nunca** copiar a base de produção para a homologação: documentos, selfies e CPFs são dados
pessoais (LGPD). A homologação usa só a seed e contas de teste.

## 2. Aplicação (Dokploy)

- Segundo app no Dokploy apontando para o mesmo repositório, branch `main` (ou `homolog`, se
  preferir publicar lá primeiro).
- Variáveis de ambiente: as do item 1 + `SITE_SENHA` diferente da produção +
  `NEXT_PUBLIC_SITE_URL=https://homolog.<domínio>`.
- Asaas em **sandbox** (`ASAAS_BASE_URL=https://sandbox.asaas.com/api/v3`), Resend com domínio de
  teste, IA com limite baixo.

## 3. Roteiro de testes antes de publicar

```bash
BASE_URL=https://homolog.<domínio> node scripts/testa-planos.mjs
BASE_URL=https://homolog.<domínio> node scripts/testa-tiles.mjs
BASE_URL=https://homolog.<domínio> node scripts/testa-perfis.mjs
```

Ver também `npm run testa` (todos os testes automáticos) e o roteiro manual em `docs/MANUAL.md`.
