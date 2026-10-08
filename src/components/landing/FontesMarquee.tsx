/**
 * Faixa infinita com os órgãos consultados, como marcas em texto (nenhum logo
 * baixado). Só CSS: a lista vai duas vezes e a animação anda meia largura.
 * Pausa com o mouse em cima e para com `prefers-reduced-motion`.
 */

const FONTES: { sigla: string; nome: string }[] = [
  { sigla: "SICAR", nome: "Cadastro Ambiental Rural" },
  { sigla: "INCRA", nome: "Malha fundiária" },
  { sigla: "IBAMA", nome: "Áreas embargadas" },
  { sigla: "INPE", nome: "Focos de queimadas" },
  { sigla: "FUNAI", nome: "Terras indígenas" },
  { sigla: "ANM", nome: "Processos minerários" },
  { sigla: "ANA", nome: "Corpos d'água" },
  { sigla: "ANEEL", nome: "Linhas de energia" },
  { sigla: "DNIT", nome: "Rodovias federais" },
  { sigla: "IPHAN", nome: "Patrimônio" },
  { sigla: "IBGE", nome: "Limites municipais" },
];

function Linha({ oculta = false }: { oculta?: boolean }) {
  return (
    <ul className="flex shrink-0 items-center" aria-hidden={oculta || undefined}>
      {FONTES.map((f) => (
        <li key={f.sigla} className="mx-7 flex shrink-0 items-baseline gap-3 md:mx-12">
          <span className="lp-display text-3xl tracking-tight text-texto/80 md:text-[2.6rem]">{f.sigla}</span>
          <span className="text-sm font-medium text-texto-2">{f.nome}</span>
        </li>
      ))}
    </ul>
  );
}

export default function FontesMarquee() {
  return (
    <div className="lp-marquee-grupo relative flex overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_8%,#000_92%,transparent)]">
      <div className="lp-marquee flex w-max shrink-0 items-center" style={{ ["--lp-marquee-dur" as string]: "55s" }}>
        <Linha />
        <Linha oculta />
      </div>
    </div>
  );
}
