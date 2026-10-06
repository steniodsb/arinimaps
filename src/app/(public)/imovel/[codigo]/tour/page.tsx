import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { formatArea } from "@/lib/format";
import Tour3D from "@/components/tour/Tour3D";
import { currentUser } from "@/lib/supabase/server";
import { registrarEventoImovel } from "@/lib/imovel/eventos";

export const metadata: Metadata = { title: "Tour 3D" };

export default async function TourPage({ params, searchParams }: PageProps<"/imovel/[codigo]/tour">) {
  const { codigo } = await params;
  const sp = await searchParams;
  const record = sp.record === "1";

  const { data } = await supabaseAdmin().rpc("fn_property_tour", { p_codigo: codigo });
  const tour = data as {
    codigo: string; titulo: string; tipo: "urbano" | "rural"; valor: number | null;
    geometry: GeoJSON.Geometry | null; centroid: { lng: number; lat: number } | null;
    area_m2: number | null;
    municipio: { nome: string; uf: string; sede_lng: number | null; sede_lat: number | null } | null;
    pois: { nome: string | null; categoria: string; lng: number; lat: number; distancia_m: number; destaque: boolean }[];
  } | null;
  if (!tour?.geometry || !tour.centroid) notFound();

  // §1.1: tour aberto vira evento do imóvel
  const [{ data: prop }, user] = await Promise.all([
    supabaseAdmin().from("properties").select("id").eq("codigo", codigo).maybeSingle(),
    currentUser(),
  ]);
  if (prop?.id) void registrarEventoImovel({ propertyId: prop.id, tipo: "tour", userId: user?.id, detalhe: { codigo, record } });

  return (
    <Tour3D
      codigo={tour.codigo}
      titulo={tour.titulo}
      valor={tour.valor}
      tipo={tour.tipo}
      areaLabel={formatArea(tour.area_m2, tour.tipo)}
      geometry={tour.geometry}
      centroid={tour.centroid}
      municipio={tour.municipio}
      pois={tour.pois ?? []}
      record={record}
    />
  );
}
