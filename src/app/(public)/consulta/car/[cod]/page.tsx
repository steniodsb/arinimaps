import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import AppShell from "@/components/shell/AppShell";
import MiniMapa from "@/components/map/MiniMapa";
import FontesLista, { type FonteConsultada } from "@/components/rural/FontesLista";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { currentUser } from "@/lib/supabase/server";
import { acessoAtual, consultasAreaNoMes } from "@/lib/planos-servidor";
import { formatArea } from "@/lib/format";
import BotaoConsultar from "./BotaoConsultar";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Consulta de área rural" };

const TIPO: Record<string, string> = { IRU: "Imóvel rural", AST: "Assentamento", PCT: "Povos e comunidades tradicionais" };
const STATUS: Record<string, string> = { AT: "Ativo", PE: "Pendente", SU: "Suspenso", CA: "Cancelado" };

type Car = {
  geometry: GeoJSON.Geometry;
  properties: {
    cod: string; area_ha: number | null; condicao: string | null; status: string | null; tipo: string | null;
    municipio: string | null; atualizado_sicar: string | null; importado_em: string | null;
  };
};

/**
 * "Consultar informações" de uma área do CAR: os dados do cadastro e o
 * cruzamento com as fontes oficiais. Os dados do CAR são públicos e aparecem
 * para qualquer visitante; o cruzamento exige conta e fica registrado.
 */
export default async function ConsultaCar({ params }: PageProps<"/consulta/car/[cod]">) {
  const cod = decodeURIComponent((await params).cod);
  const admin = supabaseAdmin();
  const [{ data: carRaw }, { data: fontes }, { data: consultas }, { data: anuncio }, user, { userId, acesso }] = await Promise.all([
    admin.rpc("fn_car_imovel", { p_cod: cod }),
    admin.from("fontes_externas").select("id, nome, orgao, prioridade, ativa, tipo").order("prioridade"),
    admin.from("consultas_area").select("fonte_id, quantidade, raio_m, erro, consultado_em, resultado").eq("chave", `car:${cod}`),
    admin.from("properties").select("codigo, titulo, status").eq("car_codigo", cod)
      .in("status", ["publicado", "em_negociacao"]).limit(1).maybeSingle(),
    currentUser(),
    acessoAtual(),
  ]);
  const car = carRaw as Car | null;
  if (!car?.geometry) notFound();
  const p = car.properties;

  // planos por nicho: a consulta de área é da consulta profissional, com cota mensal
  const podeConsultar = acesso.recursos.has("consulta_area");
  const limiteMes = acesso.cotas.consultas_area_mes;
  const cotaRestante = podeConsultar && userId && limiteMes != null && !acesso.equipe
    ? Math.max(0, Number(limiteMes) - (await consultasAreaNoMes(userId)))
    : null;

  const porFonte = new Map((consultas ?? []).map((c) => [c.fonte_id, c]));
  // as fontes que consultam ao vivo, menos o próprio CAR (que já é o assunto da página)
  const lista: FonteConsultada[] = (fontes ?? [])
    .filter((f) => f.ativa && ["wfs", "arcgis"].includes(f.tipo) && f.id !== "car")
    .map((f) => ({ id: f.id, nome: f.nome, orgao: f.orgao, consulta: (porFonte.get(f.id) as FonteConsultada["consulta"]) ?? null }));
  const pendentes = (fontes ?? []).filter((f) => !f.ativa);
  const jaConsultou = lista.some((f) => f.consulta);

  const usuario = user
    ? { nome: user.nome || "Conta", papel: user.role === "admin_central" ? "Administrador" : "Usuário" }
    : null;

  const dados = [
    ["Área declarada", p.area_ha ? formatArea(Number(p.area_ha) * 10_000, "rural") : "—"],
    ["Município", p.municipio ?? "—"],
    ["Tipo", TIPO[p.tipo ?? ""] ?? p.tipo ?? "—"],
    ["Situação do cadastro", STATUS[p.status ?? ""] ?? p.status ?? "—"],
    ["Análise do órgão", p.condicao ?? "—"],
    ["Atualizado no SICAR", p.atualizado_sicar ? new Date(p.atualizado_sicar).toLocaleDateString("pt-BR") : "—"],
  ];

  return (
    <AppShell usuario={usuario}>
      <div className="max-w-5xl space-y-6">
        <div>
          <p className="text-xs text-texto-2">Cadastro Ambiental Rural · consulta de área</p>
          <h1 className="text-2xl font-semibold text-texto">
            {p.area_ha ? formatArea(Number(p.area_ha) * 10_000, "rural") : "Área rural"}
            {p.municipio && <span className="text-texto-2 font-normal"> em {p.municipio}</span>}
          </h1>
          <p className="font-mono text-xs text-texto-2 break-all mt-1">{p.cod}</p>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
          <MiniMapa geometry={car.geometry} status="publicado"
            className="h-80 w-full rounded-xl overflow-hidden border border-linha" />
          <div className="cartao p-5 space-y-3">
            <dl className="text-sm space-y-2">
              {dados.map(([r, v]) => (
                <div key={r} className="flex justify-between gap-3 border-b border-linha last:border-0 pb-2">
                  <dt className="text-texto-2">{r}</dt><dd className="text-texto text-right">{v}</dd>
                </div>
              ))}
            </dl>
            {anuncio ? (
              <Link href={`/imovel/${anuncio.codigo}`} className="btn-verde w-full text-center py-2.5 text-sm">
                Esta área está à venda — ver o anúncio
              </Link>
            ) : (
              <Link href={`/painel/novo?car=${encodeURIComponent(p.cod)}`} className="btn-ouro w-full text-center py-2.5 text-sm">
                Esta área é minha — anunciar
              </Link>
            )}
            <p className="text-[11px] text-texto-2 leading-snug">
              Dados públicos do SICAR, copiados em{" "}
              {p.importado_em ? new Date(p.importado_em).toLocaleDateString("pt-BR") : "—"}. O CAR é
              autodeclarado: não comprova propriedade nem substitui a matrícula.
            </p>
          </div>
        </div>

        <section className="space-y-3">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h2 className="font-semibold text-texto text-lg">Informações territoriais</h2>
              <p className="text-sm text-texto-2 max-w-2xl">
                Cruzamento da área (com 2 km ao redor) com mineração, terras indígenas, desmatamento,
                queimadas, unidades de conservação, água e energia. Cada resultado mostra o órgão e a data.
              </p>
            </div>
            {!user ? (
              <Link href="/entrar" className="btn-verde px-5 py-2.5 text-sm">Entre para consultar</Link>
            ) : !podeConsultar ? (
              <div className="text-right text-sm space-y-1 max-w-72">
                <p className="text-texto">A consulta de área faz parte da consulta profissional.</p>
                <p className="text-xs text-texto-2">
                  Seu plano{acesso.planNome ? ` (${acesso.planNome})` : ""} não inclui o cruzamento com as fontes oficiais.
                </p>
                <Link href="/planos" className="btn-ouro inline-block px-5 py-2.5 text-sm">Ver planos</Link>
              </div>
            ) : (
              <BotaoConsultar cod={p.cod} jaConsultou={jaConsultou} planNome={acesso.planNome} cotaRestante={cotaRestante} />
            )}
          </div>

          {jaConsultou
            ? <FontesLista fontes={lista} alvo="a área" />
            : (
              <p className="cartao p-5 text-sm text-texto-2">
                {!user
                  ? "Crie uma conta ou entre para consultar as fontes oficiais sobre esta área."
                  : !podeConsultar
                  ? "Nenhuma consulta feita ainda para esta área. O cruzamento com as fontes oficiais está disponível nos planos profissionais."
                  : "Nenhuma consulta feita ainda para esta área. Clique em “Consultar fontes oficiais” — leva de 10 a 40 segundos."}
              </p>
            )}

          {pendentes.length > 0 && (
            <p className="text-xs text-texto-2">
              Ainda não consultadas automaticamente (dependem de arquivo oficial):{" "}
              {pendentes.map((f) => f.nome).join(", ")}. A ausência delas aqui não significa ausência de restrição.
            </p>
          )}
          <p className="text-xs text-texto-2">
            Consulta informativa. Não é laudo, parecer nem certidão, e não substitui os documentos oficiais do imóvel.
          </p>
        </section>
      </div>
    </AppShell>
  );
}
