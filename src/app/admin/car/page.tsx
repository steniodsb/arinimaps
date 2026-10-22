import Link from "next/link";
import { AlertTriangle, CalendarClock, CheckCircle2, MapPinOff } from "lucide-react";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { exigirSetor } from "@/lib/setores-servidor";
import { municipiosIbge } from "@/lib/geo/carImportacao";
import { ROTULO_STATUS, TEMAS_CAR, type TemaCar } from "@/lib/geo/temasCar";
import { CabecalhoPagina, Cartao, Estatistica, Etiqueta, Secao, Vazio } from "@/components/ui/Pagina";
import ImportarCar from "./ImportarCar";

type Cobertura = {
  cod_ibge: number; municipio: string; uf: string; data_base: string; importado_em: string;
  temas: string[]; feicoes: number; ultima_importacao: string | null; status_ultima: string | null;
};

const fmt = (n: number) => n.toLocaleString("pt-BR");
const dataBr = (d: string | null) => (d ? new Date(d.length === 10 ? `${d}T12:00:00` : d).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—");


/**
 * CAR: importação manual e cobertura nacional (item 1 do levantamento de
 * fontes do Carlos, 22/10/2026). Mostra o que já tem camada ambiental
 * importada, o que falta, a data de cada base e as falhas.
 */
export default async function AdminCar({ searchParams }: PageProps<"/admin/car">) {
  await exigirSetor("cartografia");
  const sp = await searchParams;
  const ufSel = typeof sp.uf === "string" ? sp.uf.toUpperCase() : "";
  const ver = sp.ver === "importados" || sp.ver === "pendentes" ? sp.ver : "todos";

  const admin = supabaseAdmin();
  const [{ data: resumo }, ibge, { data: historico }] = await Promise.all([
    admin.rpc("fn_car_cobertura_resumo"),
    municipiosIbge(),
    admin.from("car_importacoes")
      .select("id, municipio, uf, arquivo_nome, data_base, status, temas, falhas_total, criado_por, criado_em")
      .order("criado_em", { ascending: false }).limit(40),
  ]);
  const r = (resumo ?? { municipios: [], falhas_abertas: 0, enviando: 0 }) as { municipios: Cobertura[]; falhas_abertas: number; enviando: number };
  const cobertos = new Map(r.municipios.map((m) => [m.cod_ibge, m]));
  const ultima = r.municipios.map((m) => m.importado_em).sort().pop() ?? null;

  const ids = [...new Set((historico ?? []).map((h) => h.criado_por).filter(Boolean))];
  const { data: pessoas } = ids.length
    ? await admin.from("profiles").select("user_id, nome").in("user_id", ids)
    : { data: [] as { user_id: string; nome: string }[] };
  const nomeDe = new Map((pessoas ?? []).map((p) => [p.user_id, p.nome]));

  // por UF: total do IBGE x importados
  const ufs = new Map<string, { total: number; importados: number; ultima: string | null }>();
  for (const m of ibge ?? []) {
    const u = ufs.get(m.uf) ?? { total: 0, importados: 0, ultima: null };
    u.total += 1;
    ufs.set(m.uf, u);
  }
  for (const m of r.municipios) {
    const u = ufs.get(m.uf) ?? { total: 0, importados: 0, ultima: null };
    u.importados += 1;
    if (!u.ultima || m.importado_em > u.ultima) u.ultima = m.importado_em;
    ufs.set(m.uf, u);
  }
  const totalBrasil = ibge?.length ?? null;

  const daUf = ufSel
    ? (ibge ?? r.municipios.map((m) => ({ cod_ibge: m.cod_ibge, nome: m.municipio, uf: m.uf })))
        .filter((m) => m.uf === ufSel)
        .map((m) => ({ ...m, cob: cobertos.get(m.cod_ibge) ?? null }))
        .filter((m) => ver === "todos" || (ver === "importados" ? m.cob : !m.cob))
        .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
    : [];

  return (
    <div className="mx-auto max-w-[1280px] space-y-12">
      <CabecalhoPagina
        variante="simples"
        eyebrow="Central · Cartografia"
        titulo="CAR: importação e cobertura"
        subtitulo="APP, reserva legal, vegetação nativa e área consolidada só saem da base de downloads do SICAR, um município por vez. Baixe o zip, importe aqui e acompanhe o que já está no sistema."
      />

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <Estatistica icone={CheckCircle2} valor={<span className="tabular-nums">{fmt(r.municipios.length)}</span>} rotulo="Municípios com camadas ambientais" />
        <Estatistica icone={MapPinOff}
          valor={<span className="tabular-nums">{totalBrasil != null ? fmt(totalBrasil - r.municipios.length) : "—"}</span>}
          rotulo={totalBrasil != null ? `Pendentes, de ${fmt(totalBrasil)} no Brasil` : "Pendentes (IBGE fora do ar)"} />
        <Estatistica icone={CalendarClock} valor={dataBr(ultima)} rotulo="Última importação" />
        <Estatistica icone={AlertTriangle} urgente={r.falhas_abertas > 0 || r.enviando > 0}
          valor={<span className="tabular-nums">{fmt(r.falhas_abertas)}</span>}
          rotulo={`Importações com falha (30 dias)${r.enviando ? ` · ${r.enviando} interrompida(s)` : ""}`} />
      </div>

      <Secao eyebrow="Passo a passo em docs/CAR-IMPORTACAO.md" titulo="Importar arquivo do SICAR">
        <ImportarCar />
      </Secao>

      <Secao eyebrow="Cobertura" titulo="Por estado" subtitulo="Clique no estado para ver os municípios importados e os pendentes.">
        <Cartao padding="p-0" className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-[0.95rem]">
            <thead className="bg-superficie-2 text-left text-[11px] font-semibold uppercase tracking-wider text-texto-2">
              <tr>
                <th className="px-6 py-3">UF</th>
                <th className="px-3 py-3 text-right">Municípios</th>
                <th className="px-3 py-3 text-right">Com dados</th>
                <th className="px-3 py-3">Cobertura</th>
                <th className="px-6 py-3">Última importação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-linha">
              {[...ufs.entries()].sort((a, b) => b[1].importados - a[1].importados || a[0].localeCompare(b[0])).map(([uf, u]) => {
                const p = u.total ? Math.round((100 * u.importados) / u.total) : 0;
                return (
                  <tr key={uf} className={"transition-colors hover:bg-superficie-2/60 " + (uf === ufSel ? "bg-verde/5" : "")}>
                    <td className="px-6 py-3"><Link href={`/admin/car?uf=${uf}#municipios`} className="font-semibold text-texto underline-offset-2 hover:underline">{uf}</Link></td>
                    <td className="px-3 py-3 text-right tabular-nums text-texto-2">{u.total ? fmt(u.total) : "—"}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-texto">{fmt(u.importados)}</td>
                    <td className="px-3 py-3">
                      <span className="flex items-center gap-2">
                        <span className="h-1.5 w-24 overflow-hidden rounded-full bg-superficie-2"><span className="block h-full bg-verde" style={{ width: `${u.importados ? Math.max(p, 2) : 0}%` }} /></span>
                        <span className="text-sm tabular-nums text-texto-2">{u.importados && p === 0 ? "<1" : p}%</span>
                      </span>
                    </td>
                    <td className="px-6 py-3 text-sm text-texto-2">{dataBr(u.ultima)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Cartao>
      </Secao>

      {ufSel && (
        <Secao eyebrow={ufSel} titulo="Municípios" subtitulo={
          <span className="flex flex-wrap gap-2 pt-1">
            {(["todos", "importados", "pendentes"] as const).map((v) => (
              <Link key={v} href={`/admin/car?uf=${ufSel}&ver=${v}#municipios`} className="chip" data-ativo={ver === v}>{v}</Link>
            ))}
          </span>
        }>
          <div id="municipios" className="scroll-mt-36" />
          {daUf.length === 0
            ? <Vazio titulo="Nenhum município nesta lista" texto={ver === "pendentes" ? "Todos os municípios do estado já têm camadas importadas." : "Ainda não há importação neste estado."} />
            : (
              <Cartao padding="p-0" className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-[0.95rem]">
                  <thead className="bg-superficie-2 text-left text-[11px] font-semibold uppercase tracking-wider text-texto-2">
                    <tr>
                      <th className="px-6 py-3">Município</th>
                      <th className="px-3 py-3">IBGE</th>
                      <th className="px-3 py-3">Situação</th>
                      <th className="px-3 py-3">Base de</th>
                      <th className="px-6 py-3">Temas</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-linha">
                    {daUf.map((m) => (
                      <tr key={m.cod_ibge} className="transition-colors hover:bg-superficie-2/60">
                        <td className="px-6 py-3 font-semibold text-texto">{m.nome}</td>
                        <td className="px-3 py-3 font-mono text-sm text-texto-2">{m.cod_ibge}</td>
                        <td className="px-3 py-3">
                          {m.cob
                            ? <Link href={`/admin/car/${m.cob.ultima_importacao}`}><Etiqueta tom={m.cob.status_ultima === "com_falhas" ? "alerta" : "verde"}>{m.cob.status_ultima === "com_falhas" ? "importado, com falhas" : "importado"}</Etiqueta></Link>
                            : <Etiqueta>pendente</Etiqueta>}
                        </td>
                        <td className="px-3 py-3 text-sm tabular-nums text-texto-2">{m.cob ? dataBr(m.cob.data_base) : "—"}</td>
                        <td className="px-6 py-3 text-sm text-texto-2">{m.cob ? m.cob.temas.map((t) => TEMAS_CAR[t as TemaCar] ?? t).join(", ") : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Cartao>
            )}
        </Secao>
      )}

      <Secao eyebrow="Histórico" titulo="Últimas importações" subtitulo="Cada importação guarda o arquivo de origem, a data da base, quem importou e o que foi recusado. As versões anteriores continuam guardadas.">
        {(historico ?? []).length === 0
          ? <Vazio titulo="Nenhuma importação ainda" texto="Baixe o zip de um município na base de downloads do SICAR e importe acima." />
          : (
            <Cartao padding="p-0" className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-[0.95rem]">
                <thead className="bg-superficie-2 text-left text-[11px] font-semibold uppercase tracking-wider text-texto-2">
                  <tr>
                    <th className="px-6 py-3">Quando</th>
                    <th className="px-3 py-3">Município</th>
                    <th className="px-3 py-3">Base de</th>
                    <th className="px-3 py-3 text-right">Gravados</th>
                    <th className="px-3 py-3 text-right">Recusados</th>
                    <th className="px-3 py-3">Situação</th>
                    <th className="px-6 py-3">Quem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-linha">
                  {(historico ?? []).map((h) => {
                    const gravados = Object.values((h.temas ?? {}) as Record<string, { gravados?: number }>).reduce((s, t) => s + (t.gravados ?? 0), 0);
                    const st = ROTULO_STATUS[h.status] ?? { texto: h.status, tom: "neutro" as const };
                    return (
                      <tr key={h.id} className="transition-colors hover:bg-superficie-2/60">
                        <td className="px-6 py-3 text-sm tabular-nums text-texto-2">
                          <Link href={`/admin/car/${h.id}`} className="underline-offset-2 hover:underline">
                            {new Date(h.criado_em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" })}
                          </Link>
                        </td>
                        <td className="px-3 py-3 font-semibold text-texto">{h.municipio} <span className="font-normal text-texto-2">· {h.uf}</span></td>
                        <td className="px-3 py-3 text-sm tabular-nums text-texto-2">{dataBr(h.data_base)}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{fmt(gravados)}</td>
                        <td className={"px-3 py-3 text-right tabular-nums " + (h.falhas_total ? "text-alerta" : "text-texto-2")}>{fmt(h.falhas_total)}</td>
                        <td className="px-3 py-3"><Etiqueta tom={st.tom}>{st.texto}</Etiqueta></td>
                        <td className="px-6 py-3 text-sm text-texto-2">{(h.criado_por && nomeDe.get(h.criado_por)) || "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Cartao>
          )}
      </Secao>
    </div>
  );
}
