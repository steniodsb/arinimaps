import { supabaseAdmin } from "@/lib/supabase/admin";
import { exigirSetor } from "@/lib/setores-servidor";
import PedidosLgpd, { type Pedido } from "./PedidosLgpd";

/** Pedidos dos titulares de dados (LGPD, art. 18), com prazo e resposta registrada. */
export default async function AdminLgpd() {
  await exigirSetor("juridico");
  const { data } = await supabaseAdmin().from("lgpd_requests")
    .select("id, codigo, nome, email, cpf, tipo, descricao, status, resposta, prazo, atendido_em, created_at")
    .order("created_at", { ascending: false }).limit(200);

  return (
    <div className="space-y-5 max-w-4xl">
      <div>
        <p className="text-[10px] tracking-[0.22em] uppercase text-ouro">Jurídico</p>
        <h1 className="text-2xl font-semibold text-texto">Pedidos de titulares (LGPD)</h1>
        <p className="text-sm text-texto-2 max-w-2xl">
          Quem tem dados no sistema pode pedir acesso, correção, exclusão, portabilidade ou revogar o
          consentimento. Cada pedido tem prazo de 15 dias e a resposta fica registrada. Os pedidos chegam
          pela página de Suporte (categoria “Meus dados pessoais”) ou são lançados aqui.
        </p>
      </div>
      <PedidosLgpd pedidos={(data ?? []) as Pedido[]} />
    </div>
  );
}
