import Link from "next/link";
import { Inbox, Layers, ListChecks } from "lucide-react";
import { supabaseAdmin } from "@/lib/supabase/admin";
import CartografiaUpload from "./CartografiaUpload";
import ListaCamadas from "./ListaCamadas";
import { exigirSetor } from "@/lib/setores-servidor";
import { CabecalhoPagina, Cartao, Secao } from "@/components/ui/Pagina";

export default async function AdminCartografia() {
  await exigirSetor("cartografia");
  const { data: municipios } = await supabaseAdmin()
    .from("municipalities").select("id, nome").eq("ativo", true).order("nome");

  return (
    <div className="mx-auto max-w-[1280px]">
      <CabecalhoPagina
        variante="simples"
        eyebrow="Central · Cartografia"
        titulo="Cartografia urbana"
        subtitulo="A planta da cidade entra como camada sobre o mapa e o satélite — quadras e lotes desenhados por cima da imagem real."
        acoes={
          <Link href="/admin/cartografia/solicitacoes" className="btn-contorno inline-flex items-center gap-2 px-4 py-2.5 text-sm">
            <Inbox className="size-4" /> Solicitações de planta
          </Link>
        }
      />

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <div className="space-y-12 min-w-0">
          <Secao eyebrow="Nova camada" titulo="Publicar planta">
            <CartografiaUpload municipios={municipios ?? []} />
          </Secao>

          <Secao eyebrow="Publicadas" titulo="Camadas no mapa">
            <ListaCamadas />
          </Secao>
        </div>

        <aside className="lg:sticky lg:top-6">
          <Cartao className="space-y-4 bg-superficie-2">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-verde/12 text-verde">
                <ListChecks className="size-5" />
              </span>
              <p className="lp-display text-lg text-texto">Como preparar o arquivo</p>
            </div>
            <ol className="list-decimal ml-5 space-y-2.5 text-[0.95rem] leading-relaxed text-texto-2">
              <li>No AutoCAD, abra a planta e confirme que o desenho está em coordenadas do terreno (UTM).</li>
              <li>Salvar como → <strong className="text-texto">DXF</strong> (qualquer versão). O DWG é formato fechado e não pode ser lido direto.</li>
              <li>Suba o DXF aqui: linhas e quadras são convertidas e publicadas na hora.</li>
              <li>
                Se a planta aparecer deslocada, use <strong className="text-texto">Calibrar sobre o satélite</strong> — plantas antigas
                costumam estar em SAD 69, que fica ~66 m fora do lugar em relação ao GPS de hoje.
              </li>
            </ol>
            <div className="flex gap-3 border-t border-linha pt-4 text-sm leading-relaxed text-texto-2">
              <Layers className="mt-0.5 size-4 shrink-0 text-ouro" />
              <p>Também aceita imagem georreferenciada (GeoTIFF/PNG/JPG) — nesse caso os tiles são gerados pelo worker.</p>
            </div>
          </Cartao>
        </aside>
      </div>
    </div>
  );
}
