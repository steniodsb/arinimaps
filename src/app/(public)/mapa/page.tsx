import type { Metadata } from "next";
import SiteHeader from "@/components/SiteHeader";
import dynamic from "next/dynamic";

const MapaRegional = dynamic(() => import("@/components/map/MapaRegional"));

export const metadata: Metadata = {
  title: "Mapa da região",
  description: "Navegue pelo mapa do Pontal do Triângulo e encontre fazendas, sítios e imóveis urbanos à venda.",
};

export default function PaginaMapa() {
  return (
    <div className="flex flex-col h-screen">
      <SiteHeader />
      <MapaRegional />
    </div>
  );
}
