"use client";

import dynamic from "next/dynamic";
import type { ItemMapaBusca } from "./MapaBusca";

// o mapa só existe no navegador; a página da busca é renderizada no servidor
const MapaBusca = dynamic(() => import("./MapaBusca"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse rounded-2xl border border-linha bg-superficie-2" />,
});

export default function MapaBuscaCliente(props: { itens: ItemMapaBusca[]; listaId: string }) {
  return <MapaBusca {...props} />;
}
