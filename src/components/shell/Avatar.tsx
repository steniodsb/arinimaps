/**
 * Foto do perfil (4.6) em círculo, com a inicial do nome quando não há foto.
 * Sem "use client": serve em página do servidor e em componente cliente.
 */
export default function Avatar({
  nome, url, tamanho = 32, className = "",
}: { nome: string | null | undefined; url?: string | null; tamanho?: number; className?: string }) {
  const inicial = (nome || "?").trim().charAt(0).toUpperCase() || "?";
  const estilo = { width: tamanho, height: tamanho };
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- foto pequena do Storage público, sem otimização
      <img src={url} alt={nome ? `Foto de ${nome}` : "Foto do perfil"} style={estilo} loading="lazy"
        className={"shrink-0 rounded-full object-cover border border-linha bg-superficie-2 " + className} />
    );
  }
  return (
    <span aria-hidden style={{ ...estilo, fontSize: Math.max(10, Math.round(tamanho * 0.42)) }}
      className={"shrink-0 rounded-full bg-verde/15 text-verde grid place-items-center font-semibold " + className}>
      {inicial}
    </span>
  );
}
