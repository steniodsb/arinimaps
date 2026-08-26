import "server-only";

/**
 * Integração Asaas (mensalidade e cobrança de comissão).
 * Sem ASAAS_API_KEY no env, tudo devolve null — o restante do sistema
 * funciona com controle manual. Sandbox: defina ASAAS_BASE_URL.
 */
const BASE = process.env.ASAAS_BASE_URL ?? "https://api.asaas.com/v3";

function headers() {
  return {
    "Content-Type": "application/json",
    access_token: process.env.ASAAS_API_KEY ?? "",
  };
}

export function asaasConfigurado() {
  return !!process.env.ASAAS_API_KEY;
}

export async function asaasCriarCliente(dados: { name: string; cpfCnpj?: string; email?: string; mobilePhone?: string }) {
  if (!asaasConfigurado()) return null;
  const res = await fetch(`${BASE}/customers`, { method: "POST", headers: headers(), body: JSON.stringify(dados) });
  if (!res.ok) throw new Error(`Asaas customers ${res.status}: ${await res.text()}`);
  return (await res.json()) as { id: string };
}

export async function asaasCriarCobranca(dados: {
  customer: string;
  value: number;
  dueDate: string; // yyyy-mm-dd
  description: string;
  externalReference: string; // invoice.id ou commission.id
}) {
  if (!asaasConfigurado()) return null;
  const res = await fetch(`${BASE}/payments`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ billingType: "UNDEFINED", ...dados }), // UNDEFINED = cliente escolhe Pix/boleto/cartão
  });
  if (!res.ok) throw new Error(`Asaas payments ${res.status}: ${await res.text()}`);
  return (await res.json()) as { id: string; invoiceUrl: string };
}
