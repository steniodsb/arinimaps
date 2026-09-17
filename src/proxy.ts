import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Mantém a sessão do Supabase viva (refresh de token via cookies).
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  await supabase.auth.getUser();
  return response;
}

export const config = {
  // `api/admin/cartografia` fica de fora de propósito: o proxy precisa segurar o
  // corpo inteiro da requisição para renovar a sessão, e planta de cidade passa
  // de 100 MB. A rota confere a sessão por conta própria (ator()) e lê o arquivo
  // em fluxo, sem nunca carregá-lo inteiro na memória.
  matcher: [
    "/((?!api/admin/cartografia|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp)).*)",
  ],
};
