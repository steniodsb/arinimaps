import type { Metadata } from "next";
import dynamicImport from "next/dynamic";
import AppShell from "@/components/shell/AppShell";
import { currentUser } from "@/lib/supabase/server";
import { acessoDe } from "@/lib/planos-servidor";

const MapaRegional = dynamicImport(() => import("@/components/map/MapaRegional"));

export const metadata: Metadata = {
  title: "Mapa Interativo",
  description: "Navegue pelo mapa da região e encontre fazendas, sítios e imóveis urbanos à venda.",
};

export default async function PaginaMapa() {
  const user = await currentUser();
  // planos por nicho: o mapa recebe os recursos da conta e esconde o que o
  // plano não libera (a trava de verdade fica nas rotas da API)
  const acesso = await acessoDe(user?.id);
  const usuario = user
    ? { nome: user.nome || "Conta", papel: acesso.equipe ? "Matriz" : acesso.planNome ?? "Usuário" }
    : null;

  return (
    <AppShell usuario={usuario} semPadding>
      <MapaRegional recursos={[...acesso.recursos]} logado={!!user} />
    </AppShell>
  );
}
