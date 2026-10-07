import "server-only";
import { createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync, randomBytes } from "node:crypto";

/**
 * Criptografia de campo na aplicação (item 6.5 do roadmap).
 *
 * Chave: variável de ambiente CAMPO_CRIPTO_CHAVE (32 bytes aleatórios em
 * base64 — `openssl rand -base64 32`). Dela saem, por HKDF, duas chaves
 * independentes: uma para cifrar (AES-256-GCM) e outra para o hash de busca
 * (HMAC-SHA256). O banco nunca vê a chave: quem copiar o banco inteiro não lê
 * o CPF.
 *
 * SEM a variável, tudo aqui fica inerte (`criptoAtiva()` = false) e o sistema
 * continua gravando como antes — nada quebra no cadastro nem no login.
 *
 * Rotação: CAMPO_CRIPTO_CHAVE_ANTERIOR mantém a chave velha só para LER
 * enquanto `node scripts/cifra-cpf.mjs` regrava tudo com a nova (procedimento
 * em docs/SEGURANCA.md §11). O hash de busca muda com a chave — o script
 * recalcula `cpf_hash` junto.
 *
 * Formato do valor cifrado: `enc1:<id da chave>:<iv>:<tag>:<texto cifrado>` (base64url).
 */
type Chaves = { id: string; cifra: Buffer; hmac: Buffer };

function derivar(segredo: string): Chaves {
  const bruto = Buffer.from(segredo, "base64").length >= 32 ? Buffer.from(segredo, "base64") : Buffer.from(segredo, "utf8");
  const cifra = Buffer.from(hkdfSync("sha256", bruto, "arini-maps", "campo:cifra:v1", 32));
  const hmac = Buffer.from(hkdfSync("sha256", bruto, "arini-maps", "campo:hmac:v1", 32));
  const id = createHash("sha256").update(cifra).digest("hex").slice(0, 8);
  return { id, cifra, hmac };
}

let cache: { atual: Chaves | null; anterior: Chaves | null; fonte: string } | null = null;
function chaves() {
  const atual = process.env.CAMPO_CRIPTO_CHAVE ?? "";
  const anterior = process.env.CAMPO_CRIPTO_CHAVE_ANTERIOR ?? "";
  const fonte = atual + "|" + anterior;
  if (!cache || cache.fonte !== fonte) {
    cache = {
      atual: atual.length >= 16 ? derivar(atual) : null,
      anterior: anterior.length >= 16 ? derivar(anterior) : null,
      fonte,
    };
  }
  return cache;
}

/** A criptografia de campo está ligada (há chave no ambiente)? */
export function criptoAtiva() {
  return !!chaves().atual;
}

/** Cifra um texto. Sem chave, devolve null (quem chama grava como antes). */
export function cifrar(texto: string): string | null {
  const k = chaves().atual;
  if (!k) return null;
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", k.cifra, iv);
  const corpo = Buffer.concat([c.update(texto, "utf8"), c.final()]);
  return ["enc1", k.id, iv.toString("base64url"), c.getAuthTag().toString("base64url"), corpo.toString("base64url")].join(":");
}

/** Decifra; aceita a chave atual e a anterior (rotação). Valor em claro passa direto. */
export function decifrar(valor: string | null | undefined): string | null {
  if (!valor) return null;
  if (!valor.startsWith("enc1:")) return valor;
  const [, id, iv, tag, corpo] = valor.split(":");
  const { atual, anterior } = chaves();
  const k = [atual, anterior].find((x) => x?.id === id);
  if (!k) return null;
  try {
    const d = createDecipheriv("aes-256-gcm", k.cifra, Buffer.from(iv, "base64url"));
    d.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([d.update(Buffer.from(corpo, "base64url")), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/**
 * Hash de busca (HMAC): igualdade e unicidade sem guardar o valor. Mesmo
 * valor → mesmo hash; sem a chave, ninguém calcula o hash de um CPF para
 * conferir se ele está na base. Sem chave no ambiente, devolve null.
 */
export function hashBusca(valor: string, usar: "atual" | "anterior" = "atual"): string | null {
  const k = chaves()[usar];
  if (!k) return null;
  return createHmac("sha256", k.hmac).update(valor.normalize("NFKC")).digest("hex");
}

/** CPF/CNPJ do perfil, venha cifrado ou (legado) em claro. */
export function cpfDoPerfil(p: { cpf_cnpj?: string | null; cpf_cnpj_cifrado?: string | null }): string | null {
  return decifrar(p.cpf_cnpj_cifrado) ?? p.cpf_cnpj ?? null;
}

/**
 * Colunas a gravar para um CPF/CNPJ novo: cifrado + hash quando há chave; sem
 * chave, só `cpf_cnpj` em claro, exatamente como antes (nem cita as colunas novas).
 */
export function colunasCpf(valor: string): Record<string, string | null> {
  const cifrado = cifrar(valor);
  const hash = hashBusca(valor);
  if (!cifrado || !hash) return { cpf_cnpj: valor };
  return { cpf_cnpj: null, cpf_hash: hash, cpf_cnpj_cifrado: cifrado };
}

/** Hashes possíveis de um CPF (chave atual e, durante a rotação, a anterior). */
export function hashesDeBusca(valor: string): string[] {
  return [hashBusca(valor, "atual"), hashBusca(valor, "anterior")].filter((h): h is string => !!h);
}
