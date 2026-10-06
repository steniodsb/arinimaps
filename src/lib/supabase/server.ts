import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function supabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server Component: o middleware cuida do refresh
          }
        },
      },
    }
  );
}

/** Usuário logado + role, ou null. */
export async function currentUser() {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, nome, setores, nicho, plan_id, plan_valido_ate")
    .eq("user_id", user.id)
    .single();
  return profile
    ? {
        id: user.id, email: user.email, role: profile.role as string, nome: profile.nome as string,
        setores: (profile.setores ?? []) as string[],
        nicho: (profile.nicho ?? null) as string | null,
        planId: (profile.plan_id ?? null) as string | null,
        planValidoAte: (profile.plan_valido_ate ?? null) as string | null,
      }
    : null;
}
