# Backup e recuperação (roadmap 1.6 e 9.6)

## Camadas
| Camada | O quê | Onde | Frequência | Retenção |
|---|---|---|---|---|
| 1. Supabase Pro | banco inteiro | dentro do Supabase | diária (automática) | 7 dias |
| 2. `scripts/backup.mjs` | banco (`public` + dados de `auth` e `storage`), **criptografado AES-256-GCM** | Cloudflare R2, `backups/banco/AAAA-MM-DD/` | diária, 03:30 | 7 diários, 4 semanais, 12 mensais |
| 3. `scripts/backup-arquivos.mjs` | fotos, vídeos, documentos, selfies, plantas (todos os buckets) | R2 privado, `backups/arquivos/` | diária, 04:00 (incremental) | apagado no Supabase sai da cópia após 30 dias |

A camada 2 existe porque a 1 fica na mesma conta: conta perdida, bloqueada ou projeto apagado por
engano levaria o backup junto.

## Metas
- **RPO 24 h**: no pior caso perde-se o que entrou desde o último backup diário. (PITR do Supabase
  reduz para minutos, +US$ 100/mês — quando houver cobrança real passando pelo sistema.)
- **RTO 2 h**: projeto Supabase novo + restauração + trocar as variáveis do app.

## A chave
`BACKUP_CHAVE` (`openssl rand -base64 32`) fica no servidor **e** guardada fora dele, com o Carlos
(cofre de senhas). Sem ela os backups não abrem — é de propósito.

## Teste mensal (obrigatório)
```bash
node scripts/backup-restaurar.mjs <arquivo>.dump.enc --conferir     # decifra e confere o índice
```
Restauração completa num banco vazio com PostGIS (na VPS, descartável — nunca na homologação):
```bash
docker run -d --name restaura -e POSTGRES_PASSWORD=x -p 5499:5432 postgis/postgis:17-3.5
node scripts/backup-restaurar.mjs <data>-public.dump.enc --destino postgres://postgres:x@localhost:5499/postgres
# conferir contagens (imóveis, perfis, CAR) e apagar: docker rm -f restaura
```
Medido em 08/10/2026: banco `public` = 28 MB criptografado em 20 s; conferência íntegra; chave errada recusada.

## Recuperar de verdade
1. Projeto Supabase novo (São Paulo) com PostGIS; aplicar `node scripts/migrate.mjs` só se for
   restaurar dados sem estrutura — o dump `public` já traz a estrutura.
2. `backup-restaurar.mjs <public> --destino <url do novo>` e depois `<auth-storage>`.
3. Copiar os arquivos de `backups/arquivos/<bucket>/` de volta para os buckets.
4. Trocar `NEXT_PUBLIC_SUPABASE_URL`, chaves e `SUPABASE_PROJECT_REF` no app e no worker; novo build.

## Cron na VPS
```
30 3 * * * cd /app && node scripts/backup.mjs >> /var/log/arini-backup.log 2>&1
0 4 * * *  cd /app && node scripts/backup-arquivos.mjs >> /var/log/arini-backup.log 2>&1
```
