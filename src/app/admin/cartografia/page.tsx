import { supabaseAdmin } from "@/lib/supabase/admin";
import CartografiaUpload from "./CartografiaUpload";
import ListaCamadas from "./ListaCamadas";

export default async function AdminCartografia() {
  const { data: municipios } = await supabaseAdmin()
    .from("municipalities").select("id, nome").eq("ativo", true).order("nome");

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold text-verde-escuro">Cartografia urbana</h1>
        <p className="text-sm text-foreground/60">
          A planta da cidade entra como camada sobre o mapa e o satélite — quadras e lotes
          desenhados por cima da imagem real.
        </p>
      </div>

      <CartografiaUpload municipios={municipios ?? []} />

      <section className="space-y-2">
        <h2 className="font-semibold text-verde-escuro">Camadas no mapa</h2>
        <ListaCamadas />
      </section>

      <div className="rounded-2xl border border-linha bg-areia/50 p-5 text-sm space-y-2">
        <p className="font-semibold text-verde-escuro">Como preparar o arquivo</p>
        <ol className="list-decimal ml-5 space-y-1 text-foreground/75">
          <li>No AutoCAD, abra a planta e confirme que o desenho está em coordenadas do terreno (UTM).</li>
          <li>Salvar como → <strong>DXF</strong> (qualquer versão). O DWG é formato fechado e não pode ser lido direto.</li>
          <li>Suba o DXF aqui: linhas e quadras são convertidas e publicadas na hora.</li>
          <li>
            Se a planta aparecer deslocada, use <strong>Calibrar sobre o satélite</strong> — plantas antigas
            costumam estar em SAD 69, que fica ~66 m fora do lugar em relação ao GPS de hoje.
          </li>
        </ol>
        <p className="text-foreground/60">
          Também aceita imagem georreferenciada (GeoTIFF/PNG/JPG) — nesse caso os tiles são gerados pelo worker.
        </p>
      </div>
    </div>
  );
}
