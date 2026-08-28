import type { Metadata } from "next";
import dynamicImport from "next/dynamic";
import AppShell from "@/components/shell/AppShell";
import { currentUser } from "@/lib/supabase/server";

const MapaRegional = dynamicImport(() => import("@/components/map/MapaRegional"));

export const metadata: Metadata = {
  title: "Mapa Interativo",
  description: "Navegue pelo mapa da região e encontre fazendas, sítios e imóveis urbanos à venda.",
};

export default async function PaginaMapa() {
  const user = await currentUser();
  const usuario = user
    ? { nome: user.nome || "Conta", papel: user.role === "admin_central" ? "Administrador" : "Usuário" }
    : null;

  return (
    <AppShell usuario={usuario} semPadding>
      <MapaRegional />
    </AppShell>
  );
}
