import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";

/** E-mail via Resend. Sem RESEND_API_KEY, vira no-op silencioso (nunca lança). */
export async function sendEmail(to: string | null | undefined, subject: string, text: string) {
  if (!process.env.RESEND_API_KEY || !to) return;
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM ?? "Arini Imóveis Brasil <naoresponda@arinimaps.com.br>",
        to: [to],
        subject,
        text,
      }),
    });
  } catch (e) {
    console.error("sendEmail falhou:", e);
  }
}

/** E-mail da central Arini: settings.notify_email > env ARINI_NOTIFY_EMAIL. */
export async function ariniEmail(): Promise<string | null> {
  const { data } = await supabaseAdmin().from("settings").select("valor").eq("chave", "notify_email").single();
  const v = data?.valor;
  if (typeof v === "string" && v.includes("@")) return v;
  return process.env.ARINI_NOTIFY_EMAIL ?? null;
}

/** E-mail do usuário dono do profile (vive no auth.users). */
export async function emailDoProfile(userId: string): Promise<string | null> {
  const { data } = await supabaseAdmin().auth.admin.getUserById(userId);
  return data?.user?.email ?? null;
}
