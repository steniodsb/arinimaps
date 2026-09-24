import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { ator } from "@/lib/authz";
import { falha, falhaBanco } from "@/lib/erros";
import { importarCarMunicipio } from "@/lib/geo/car";

// Adiciona município à região buscando nome + malha no IBGE.
export async function POST(request: Request) {
  const a = await ator();
  if (a?.role !== "admin_central") return falha(403, "sem_permissao", "Restrito à diretoria.", { solucao: "Peça a alguém com acesso de diretoria para cadastrar o município." });

  const { codigo_ibge, region_id } = await request.json().catch(() => ({}));
  if (!/^\d{7}$/.test(String(codigo_ibge ?? ""))) {
    return falha(400, "codigo_invalido", "Código IBGE deve ter 7 dígitos.", { solucao: "Consulte o código em cidades.ibge.gov.br — Iturama, por exemplo, é 3134400." });
  }

  const admin = supabaseAdmin();
  const { data: existe } = await admin.from("municipalities").select("id, nome").eq("codigo_ibge", codigo_ibge).maybeSingle();
  if (existe) return falha(409, "municipio_duplicado", "Município já cadastrado.", { motivo: `${existe.nome ?? "Ele"} já está na lista de regiões.`, solucao: "Nada a fazer — ele já aparece no mapa." });

  let regiao = region_id;
  if (!regiao) {
    const { data: r } = await admin.from("regions").select("id").eq("ativa", true).limit(1).single();
    regiao = r?.id;
  }

  const metaRes = await fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/municipios/${codigo_ibge}`);
  const meta = await metaRes.json().catch(() => null);
  if (!meta?.nome) return falha(404, "ibge_sem_municipio", "Código não encontrado no IBGE.", { motivo: "A API de localidades do IBGE não conhece esse código de 7 dígitos.", solucao: "Confira o código em cidades.ibge.gov.br. Código de UF ou de microrregião não serve." });
  const malhaRes = await fetch(`https://servicodados.ibge.gov.br/api/v3/malhas/municipios/${codigo_ibge}?formato=application/vnd.geo+json`);
  const malha = await malhaRes.json().catch(() => null);
  const geom = malha?.features?.[0]?.geometry ?? malha?.geometry ??
    (["Polygon", "MultiPolygon"].includes(malha?.type) ? malha : null);
  if (!geom) return falha(502, "ibge_sem_malha", "O IBGE não devolveu os limites deste município.", { motivo: "A malha territorial respondeu vazio ou fora do ar.", solucao: "Tente de novo em alguns minutos — é indisponibilidade do serviço do IBGE, não do sistema." });

  const uf = meta.microrregiao?.mesorregiao?.UF?.sigla ?? meta["regiao-imediata"]?.["regiao-intermediaria"]?.UF?.sigla ?? "MG";
  const { error } = await admin.rpc("fn_inserir_municipio", {
    p_region_id: regiao,
    p_nome: meta.nome,
    p_uf: uf,
    p_codigo: String(codigo_ibge),
    p_geojson: geom,
  });
  if (error) return falhaBanco("municipio_nao_gravou", error);

  // a malha do CAR do município entra junto: o proprietário já pode clicar na
  // área dele. Falha do SICAR não desfaz o município — dá para repetir em Regiões.
  const car = await importarCarMunicipio(admin, { nome: meta.nome, uf, codigo_ibge })
    .then((r) => ({ imoveis: r.gravados, erro: null as string | null }))
    .catch((e) => ({ imoveis: 0, erro: e instanceof Error ? e.message : String(e) }));

  await logAudit({ user_id: a.userId, acao: "municipio_adicionado", entidade: "municipalities", dados_depois: { codigo_ibge, nome: meta.nome, car } });
  return NextResponse.json({ ok: true, nome: meta.nome, car });
}
