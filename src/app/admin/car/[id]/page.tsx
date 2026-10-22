import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { exigirSetor } from "@/lib/setores-servidor";
import { ROTULO_STATUS, TEMAS_CAR, type TemaCar } from "@/lib/geo/temasCar";
import { CabecalhoPagina, Cartao, Etiqueta, Secao, Vazio } from "@/components/ui/Pagina";
import DescartarImportacao from "./DescartarImportacao";

type Contagem = { lidos?: number; gravados?: number; duplicados?: number; invalidos?: number; corrigidos?: number; area_ha?: number };
const fmt = (n: number | undefined) => (n ?? 0).toLocaleString("pt-BR");

/** Ficha de uma importação do CAR: origem, contagens por tema e cada feição recusada. */
export default async function FichaImportacaoCar({ params }: PageProps<"/admin/car/[id]">) {
  await exigirSetor("cartografia");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();

  const admin = supabaseAdmin();
  const [{ data: imp }, { data: falhas, count }] = await Promise.all([
    admin.from("car_importacoes").select("*").eq("id", id).maybeSingle(),
    admin.from("car_importacao_falhas").select("tema, indice, cod_imovel, motivo", { count: "exact" })
      .eq("importacao_id", id).order("tema").order("indice").limit(500),
  ]);
  if (!imp) notFound();
  const { data: pessoa } = imp.criado_por
    ? await admin.from("profiles").select("nome").eq("user_id", imp.criado_por).maybeSingle()
    : { data: null };
  const st = ROTULO_STATUS[imp.status] ?? { texto: imp.status, tom: "neutro" as const };
  const temas = Object.entries((imp.temas ?? {}) as Record<string, Contagem>);
  const avisos = (imp.avisos ?? []) as string[];
  const quando = (d: string | null) => (d ? new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }) : "—");

  return (
    <div className="mx-auto max-w-[1100px] space-y-10">
      <CabecalhoPagina
        variante="simples"
        eyebrow="Central · CAR: importação e cobertura"
        titulo={`${imp.municipio}/${imp.uf}`}
        subtitulo={<>Importação de {quando(imp.criado_em)} · <Link href="/admin/car" className="underline">voltar ao painel</Link></>}
      />

      <Cartao className="grid gap-x-8 gap-y-3 text-[0.95rem] sm:grid-cols-2">
        <p><span className="text-texto-2">Situação:</span> <Etiqueta tom={st.tom}>{st.texto}</Etiqueta></p>
        <p><span className="text-texto-2">Base do SICAR de:</span> <strong>{new Date(`${imp.data_base}T12:00:00`).toLocaleDateString("pt-BR")}</strong></p>
        <p className="break-all"><span className="text-texto-2">Arquivo:</span> {imp.arquivo_nome}{imp.arquivo_bytes ? ` (${(imp.arquivo_bytes / 1048576).toFixed(1)} MB)` : ""}</p>
        <p><span className="text-texto-2">Importado por:</span> {pessoa?.nome ?? "—"}</p>
        <p><span className="text-texto-2">Código IBGE:</span> <span className="font-mono">{imp.cod_ibge}</span></p>
        <p><span className="text-texto-2">Concluída em:</span> {quando(imp.concluido_em)}</p>
        {imp.arquivo_sha256 && <p className="break-all text-sm text-texto-2 sm:col-span-2">SHA-256: <span className="font-mono">{imp.arquivo_sha256}</span></p>}
      </Cartao>

      {imp.status === "enviando" && (
        <Cartao className="space-y-3">
          <p className="text-[0.95rem] text-texto">
            Esta importação não foi concluída (o envio parou no meio). Os polígonos dela não estão valendo.
            Descarte e importe o arquivo de novo.
          </p>
          <DescartarImportacao id={imp.id} />
        </Cartao>
      )}

      <Secao eyebrow="Contagens" titulo="Por tema">
        <Cartao padding="p-0" className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-[0.95rem]">
            <thead className="bg-superficie-2 text-left text-[11px] font-semibold uppercase tracking-wider text-texto-2">
              <tr>
                <th className="px-6 py-3">Tema</th>
                <th className="px-3 py-3 text-right">Lidos</th>
                <th className="px-3 py-3 text-right">Gravados</th>
                <th className="px-3 py-3 text-right">Corrigidos</th>
                <th className="px-3 py-3 text-right">Repetidos</th>
                <th className="px-3 py-3 text-right">Recusados</th>
                <th className="px-6 py-3 text-right">Área (ha)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-linha">
              {temas.map(([t, c]) => (
                <tr key={t}>
                  <td className="px-6 py-3 font-semibold text-texto">{TEMAS_CAR[t as TemaCar] ?? t}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{fmt(c.lidos)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{fmt(c.gravados)}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-texto-2">{fmt(c.corrigidos)}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-texto-2">{fmt(c.duplicados)}</td>
                  <td className={"px-3 py-3 text-right tabular-nums " + (c.invalidos ? "text-alerta" : "text-texto-2")}>{fmt(c.invalidos)}</td>
                  <td className="px-6 py-3 text-right tabular-nums">{(c.area_ha ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Cartao>
        <p className="mt-3 text-sm text-texto-2">
          Corrigidos: geometria inválida no arquivo (autointerseção, anel aberto) que o sistema consertou.
          Repetidos: mesmo imóvel, mesmo tema e mesma geometria mais de uma vez no arquivo.
        </p>
      </Secao>

      {avisos.length > 0 && (
        <Secao eyebrow="Leitura do arquivo" titulo="Avisos">
          <Cartao>
            <ul className="ml-5 list-disc space-y-1 text-sm text-texto-2">
              {avisos.slice(0, 200).map((a, i) => <li key={i}>{a}</li>)}
            </ul>
          </Cartao>
        </Secao>
      )}

      <Secao eyebrow="Falhas" titulo={`Polígonos recusados (${fmt(count ?? 0)})`}
        subtitulo={count && count > 500 ? "Mostrando os 500 primeiros." : "O registro é a linha do shapefile, contada do zero."}>
        {!falhas?.length
          ? <Vazio titulo="Nenhum polígono recusado" />
          : (
            <Cartao padding="p-0" className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-[0.95rem]">
                <thead className="bg-superficie-2 text-left text-[11px] font-semibold uppercase tracking-wider text-texto-2">
                  <tr>
                    <th className="px-6 py-3">Tema</th>
                    <th className="px-3 py-3 text-right">Registro</th>
                    <th className="px-3 py-3">Imóvel</th>
                    <th className="px-6 py-3">Motivo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-linha">
                  {falhas.map((f, i) => (
                    <tr key={i}>
                      <td className="px-6 py-3">{TEMAS_CAR[f.tema as TemaCar] ?? f.tema}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{f.indice ?? "—"}</td>
                      <td className="px-3 py-3 font-mono text-sm text-texto-2">{f.cod_imovel ?? "—"}</td>
                      <td className="px-6 py-3 text-sm">{f.motivo}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Cartao>
          )}
      </Secao>
    </div>
  );
}
