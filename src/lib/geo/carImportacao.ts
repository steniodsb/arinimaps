import "server-only";
import { falha } from "@/lib/erros";

/**
 * Apoio do servidor à importação manual das camadas ambientais do CAR
 * (migration 0050; leitura do zip em ./shapefileCar.ts).
 */

const IBGE = "https://servicodados.ibge.gov.br/api";
const UM_DIA = 86_400_000;

export type MunicipioIbge = { cod_ibge: number; nome: string; uf: string };

let cacheMunicipios: { quando: number; lista: MunicipioIbge[] } | null = null;

/**
 * Os 5.570 municípios do IBGE (código, nome, UF), guardados por um dia na
 * memória do processo. É o denominador do painel de cobertura: "pendente" =
 * está aqui e não está em car_cobertura. Sem o IBGE, devolve null e o painel
 * mostra só o que já foi importado.
 */
export async function municipiosIbge(): Promise<MunicipioIbge[] | null> {
  if (cacheMunicipios && Date.now() - cacheMunicipios.quando < UM_DIA) return cacheMunicipios.lista;
  try {
    const r = await fetch(`${IBGE}/v1/localidades/municipios?view=nivelado`, { signal: AbortSignal.timeout(20_000) });
    if (!r.ok) throw new Error(String(r.status));
    const brutos = (await r.json()) as Record<string, string | number>[];
    const lista = brutos.map((m) => ({
      cod_ibge: Number(m["municipio-id"]), nome: String(m["municipio-nome"]), uf: String(m["UF-sigla"]),
    })).filter((m) => m.cod_ibge && m.uf);
    if (lista.length < 5000) throw new Error(`lista curta (${lista.length})`);
    cacheMunicipios = { quando: Date.now(), lista };
    return lista;
  } catch (e) {
    console.error("IBGE: lista de municípios indisponível:", e);
    return cacheMunicipios?.lista ?? null;
  }
}

/** Nome e UF de um município pelo código (lista em cache; senão pergunta direto ao IBGE). */
export async function municipioIbge(cod: number): Promise<MunicipioIbge | null> {
  const lista = await municipiosIbge();
  const achado = lista?.find((m) => m.cod_ibge === cod);
  if (achado) return achado;
  try {
    const r = await fetch(`${IBGE}/v1/localidades/municipios/${cod}`, { signal: AbortSignal.timeout(15_000) });
    const m = await r.json();
    const uf = m?.microrregiao?.mesorregiao?.UF?.sigla ?? m?.["regiao-imediata"]?.["regiao-intermediaria"]?.UF?.sigla;
    return m?.nome && uf ? { cod_ibge: cod, nome: m.nome, uf } : null;
  } catch {
    return null;
  }
}

/** Limite do município (malha do IBGE, qualidade intermediária). Null se o IBGE não responder. */
export async function limiteMunicipio(cod: number): Promise<GeoJSON.Geometry | null> {
  try {
    const r = await fetch(`${IBGE}/v3/malhas/municipios/${cod}?formato=application/vnd.geo+json&qualidade=intermediaria`,
      { signal: AbortSignal.timeout(30_000) });
    const malha = await r.json();
    return malha?.features?.[0]?.geometry ?? malha?.geometry ??
      (["Polygon", "MultiPolygon"].includes(malha?.type) ? malha : null);
  } catch {
    return null;
  }
}

/** Resposta padrão de quem não é do setor de Cartografia e dados. */
export function semPermissaoCartografia() {
  return falha(403, "sem_permissao", "Restrito ao setor de Cartografia e dados.", {
    solucao: "Peça à diretoria para incluir você no setor de Cartografia.",
  });
}
