import { NextResponse } from "next/server";
import { ator, temSetor } from "@/lib/authz";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { falha, falhaBanco } from "@/lib/erros";
import { municipioIbge, semPermissaoCartografia } from "@/lib/geo/carImportacao";
import { TEMAS_CAR } from "@/lib/geo/temasCar";

/** Nome e UF do município pelo código IBGE (pré-visualização do arquivo). */
export async function GET(request: Request) {
  const a = await ator();
  if (!a || !temSetor(a, "cartografia")) return semPermissaoCartografia();
  const cod = Number(new URL(request.url).searchParams.get("municipio"));
  if (!/^\d{7}$/.test(String(cod))) return falha(400, "codigo_invalido", "Código IBGE deve ter 7 dígitos.", {});
  const m = await municipioIbge(cod);
  if (!m) return falha(404, "municipio_desconhecido", "O IBGE não conhece esse código de município.", {});
  const { data: cob } = await supabaseAdmin().from("car_cobertura")
    .select("data_base, importado_em, temas").eq("cod_ibge", cod).maybeSingle();
  return NextResponse.json({ ...m, cobertura: cob ?? null });
}

/**
 * Abre uma importação manual do CAR (arquivo do SICAR de um município).
 * O navegador já leu o zip; aqui só confere o município, a data da base e se
 * o mesmo arquivo já foi importado. As feições vêm depois, em lotes
 * (./[id]/lote) e só passam a valer em ./[id]/concluir.
 */
export async function POST(request: Request) {
  const a = await ator();
  if (!a || !temSetor(a, "cartografia")) return semPermissaoCartografia();

  const corpo = await request.json().catch(() => null) as {
    cod_ibge?: number; arquivo_nome?: string; arquivo_bytes?: number; arquivo_sha256?: string;
    data_base?: string; temas?: Record<string, number>; avisos?: string[]; forcar?: boolean;
  } | null;
  const cod = Number(corpo?.cod_ibge);
  if (!/^\d{7}$/.test(String(cod))) {
    return falha(400, "codigo_invalido", "Informe o município (código IBGE de 7 dígitos).", {
      solucao: "O sistema tenta achar o município pelo código dos imóveis do arquivo; se não achou, escolha na lista.",
    });
  }
  const data = String(corpo?.data_base ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || Number.isNaN(Date.parse(data)) || Date.parse(data) > Date.now() + 86_400_000) {
    return falha(400, "data_invalida", "Informe a data em que o arquivo foi baixado do SICAR.", {
      motivo: "Ela vira a \"data da base\" mostrada no relatório e no painel.", solucao: "Use a data do download; não pode ser no futuro.",
    });
  }
  const temas = Object.keys(corpo?.temas ?? {}).filter((t) => t in TEMAS_CAR);
  if (!temas.length) {
    return falha(400, "sem_temas", "O arquivo não trouxe nenhuma camada reconhecida.", {
      solucao: "Confira se é o zip da base de downloads do SICAR (APP, RESERVA_LEGAL, VEGETACAO_NATIVA…).",
    });
  }

  const municipio = await municipioIbge(cod);
  if (!municipio) {
    return falha(404, "municipio_desconhecido", "O IBGE não conhece esse código de município.", {
      solucao: "Confira o código ou tente de novo em alguns minutos, se o IBGE estiver fora do ar.",
    });
  }

  const admin = supabaseAdmin();
  const sha = corpo?.arquivo_sha256 && /^[0-9a-f]{64}$/.test(corpo.arquivo_sha256) ? corpo.arquivo_sha256 : null;
  if (sha && !corpo?.forcar) {
    const { data: igual } = await admin.from("car_importacoes")
      .select("id, criado_em, data_base").eq("arquivo_sha256", sha).eq("cod_ibge", cod)
      .in("status", ["concluida", "com_falhas"]).order("criado_em", { ascending: false }).limit(1).maybeSingle();
    if (igual) {
      return falha(409, "arquivo_repetido", "Este mesmo arquivo já foi importado para o município.", {
        motivo: `Importado em ${new Date(igual.criado_em).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}, base de ${new Date(`${igual.data_base}T12:00:00`).toLocaleDateString("pt-BR")}.`,
        solucao: "Baixe um arquivo novo do SICAR para atualizar. Se quiser importar de novo assim mesmo, marque \"importar mesmo assim\".",
        detalhes: { importacao_id: igual.id },
      });
    }
  }

  const { data: imp, error } = await admin.from("car_importacoes").insert({
    cod_ibge: cod, municipio: municipio.nome, uf: municipio.uf,
    arquivo_nome: String(corpo?.arquivo_nome ?? "arquivo.zip").slice(0, 200),
    arquivo_bytes: Number(corpo?.arquivo_bytes) || null, arquivo_sha256: sha, data_base: data,
    avisos: (corpo?.avisos ?? []).slice(0, 200).map((s) => String(s).slice(0, 300)),
    criado_por: a.userId,
  }).select("id").single();
  if (error) return falhaBanco("importacao_nao_abriu", error);

  await logAudit({
    user_id: a.userId, acao: "car_importacao_iniciada", entidade: "car_importacoes", entidade_id: imp.id,
    dados_depois: { cod_ibge: cod, municipio: municipio.nome, arquivo: corpo?.arquivo_nome, data_base: data, temas: corpo?.temas },
  });
  return NextResponse.json({ ok: true, id: imp.id, municipio: municipio.nome, uf: municipio.uf });
}
