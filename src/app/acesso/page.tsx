import type { Metadata } from "next";
import { FlaskConical, Lock, MapPinned } from "lucide-react";
import FormAcesso from "./FormAcesso";
import TelaDividida from "@/components/publico/TelaDividida";

export const metadata: Metadata = {
  title: "Acesso restrito",
  robots: { index: false, follow: false },
};

const BENEFICIOS = [
  { icone: FlaskConical, titulo: "Fase de testes", texto: "O sistema está aberto só para quem recebeu a senha de acesso." },
  { icone: MapPinned, titulo: "Imóveis com a divisa no mapa", texto: "Área medida, fontes oficiais e tour 3D de cada propriedade." },
  { icone: Lock, titulo: "Acesso protegido", texto: "Depois da senha, a navegação segue normal neste aparelho." },
];

/** Porta do site enquanto ele está em testes (senha de bloqueio). */
export default function Acesso() {
  // 4.7: o tema também se escolhe na porta do site (botão dentro da TelaDividida)
  return (
    <TelaDividida linkSite={false} eyebrow="Acesso restrito" titulo="Arini Imóveis" destaque="Brasil"
      subtitulo="Inteligência territorial para comprar, consultar e anunciar imóveis na região."
      beneficios={BENEFICIOS}>
      <FormAcesso />
    </TelaDividida>
  );
}
