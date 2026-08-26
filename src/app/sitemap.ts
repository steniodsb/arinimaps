import type { MetadataRoute } from "next";
import { supabaseAdmin } from "@/lib/supabase/admin";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const { data: imoveis } = await supabaseAdmin()
    .from("properties")
    .select("codigo, updated_at")
    .in("status", ["publicado", "em_negociacao"]);

  return [
    { url: base, changeFrequency: "hourly", priority: 1 },
    ...(imoveis ?? []).map((p) => ({
      url: `${base}/imovel/${p.codigo}`,
      lastModified: new Date(p.updated_at),
      changeFrequency: "daily" as const,
      priority: 0.8,
    })),
  ];
}
