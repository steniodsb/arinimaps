import SiteHeader from "@/components/SiteHeader";
import dynamic from "next/dynamic";

const MapaRegional = dynamic(() => import("@/components/map/MapaRegional"));

export default function Home() {
  return (
    <div className="flex flex-col h-screen">
      <SiteHeader />
      <div className="bg-verde text-white/90 text-sm px-4 py-2 text-center">
        Navegue pelo mapa da região, clique num imóvel destacado e demonstre interesse — a Arini cuida do resto.
      </div>
      <MapaRegional />
    </div>
  );
}
