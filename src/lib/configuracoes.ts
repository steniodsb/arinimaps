/**
 * Registro central das configurações do sistema.
 *
 * Uma configuração nova = uma linha aqui. A tela do admin e a rota de
 * gravação são geradas a partir deste registro, então rótulo, ajuda,
 * tipo e validação ficam num lugar só e nunca saem de sincronia.
 *
 * Regra: só entra aqui o que REALMENTE muda o comportamento do sistema.
 */

export type TipoCampo = "texto" | "textarea" | "numero" | "dinheiro" | "percentual" | "email" | "telefone" | "lista" | "coordenada";

export type Campo = {
  chave: string;
  rotulo: string;
  ajuda?: string;
  tipo: TipoCampo;
  padrao: string | number | string[];
  min?: number;
  max?: number;
  sufixo?: string;
  somenteDiretoria?: boolean;
};

export type Grupo = {
  id: string;
  titulo: string;
  descricao: string;
  icone: string;
  campos: Campo[];
};

export const GRUPOS: Grupo[] = [
  {
    id: "marca",
    titulo: "Marca e contato",
    descricao: "Como o sistema se apresenta e por onde a Arini fala com o cliente.",
    icone: "🏷️",
    campos: [
      { chave: "nome_sistema", rotulo: "Nome do sistema", tipo: "texto", padrao: "Arini Imóveis Brasil",
        ajuda: "Aparece no topo do site, nos e-mails e no título das páginas." },
      { chave: "whatsapp_central", rotulo: "WhatsApp da central", tipo: "telefone", padrao: "553499745140",
        ajuda: "Botão “Chamar no WhatsApp” em cada anúncio. Use DDI+DDD+número, só dígitos." },
      { chave: "notify_email", rotulo: "E-mail que recebe os leads", tipo: "email", padrao: "",
        ajuda: "Toda demonstração de interesse chega neste endereço." },
      { chave: "email_contato", rotulo: "E-mail público de contato", tipo: "email", padrao: "",
        ajuda: "Exibido no rodapé do site." },
      { chave: "telefone_contato", rotulo: "Telefone público", tipo: "texto", padrao: "",
        ajuda: "Exibido no rodapé do site." },
    ],
  },
  {
    id: "site",
    titulo: "Página inicial",
    descricao: "Os textos que o visitante lê antes de entrar no mapa.",
    icone: "🖥️",
    campos: [
      { chave: "hero_eyebrow", rotulo: "Linha de topo", tipo: "texto", padrao: "Pontal do Triângulo Mineiro",
        ajuda: "Texto pequeno acima do título principal." },
      { chave: "hero_titulo", rotulo: "Título principal", tipo: "texto", padrao: "O mercado imobiliário da região,",
        ajuda: "Primeira parte do título (fica em branco)." },
      { chave: "hero_destaque", rotulo: "Destaque do título", tipo: "texto", padrao: "visto do mapa",
        ajuda: "Segunda parte, exibida em dourado." },
      { chave: "hero_subtitulo", rotulo: "Texto de apoio", tipo: "textarea",
        padrao: "Fazendas, sítios, lotes e casas com a divisa real da propriedade sobre o satélite, área medida, tour 3D e pontos de interesse ao redor. Toda negociação intermediada pela Arini Negócios Imobiliários." },
    ],
  },
  {
    id: "comercial",
    titulo: "Regras comerciais",
    descricao: "Comissão, mensalidade do anúncio e prazo de inadimplência.",
    icone: "💰",
    campos: [
      { chave: "comissao_percentual_padrao", rotulo: "Comissão padrão", tipo: "percentual", padrao: 1, min: 0, max: 100, sufixo: "%",
        ajuda: "Sugerida ao registrar uma venda; pode ser ajustada caso a caso.", somenteDiretoria: true },
      { chave: "mensalidade_valor_padrao", rotulo: "Mensalidade do anúncio", tipo: "dinheiro", padrao: 0, min: 0, sufixo: "R$",
        ajuda: "Cobrada por imóvel publicado. Zero = anúncio gratuito.", somenteDiretoria: true },
      { chave: "suspensao_dias", rotulo: "Tolerância de atraso", tipo: "numero", padrao: 15, min: 1, max: 180, sufixo: "dias",
        ajuda: "Depois disso, “Processar inadimplência” marca a fatura como vencida." },
      { chave: "regra_comissao_texto", rotulo: "Regra contratual da comissão", tipo: "textarea",
        padrao: "1% sobre o valor da operação, conforme contrato de intermediação.",
        ajuda: "Texto gravado junto de cada comissão registrada." },
    ],
  },
  {
    id: "mapa",
    titulo: "Mapa e território",
    descricao: "Onde o mapa abre e o alcance da busca de pontos de interesse.",
    icone: "🗺️",
    campos: [
      { chave: "mapa_centro_lng", rotulo: "Longitude inicial", tipo: "coordenada", padrao: -50.196,
        ajuda: "Centro do mapa quando alguém abre o site." },
      { chave: "mapa_centro_lat", rotulo: "Latitude inicial", tipo: "coordenada", padrao: -19.728 },
      { chave: "mapa_zoom_inicial", rotulo: "Zoom inicial", tipo: "numero", padrao: 9, min: 3, max: 18,
        ajuda: "9 mostra a região inteira; 13 mostra uma cidade." },
      { chave: "poi_raio_rural_m", rotulo: "Raio de busca — rural", tipo: "numero", padrao: 15000, min: 1000, max: 60000, sufixo: "m",
        ajuda: "Distância para procurar postos, escolas e acessos ao redor de imóveis rurais." },
      { chave: "poi_raio_urbano_m", rotulo: "Raio de busca — urbano", tipo: "numero", padrao: 4000, min: 500, max: 20000, sufixo: "m" },
      { chave: "poi_categorias", rotulo: "Categorias de ponto de interesse", tipo: "lista",
        padrao: ["combustivel", "farmacia", "supermercado", "hospital", "escola", "centro", "acesso_rodovia"],
        ajuda: "Uma por linha. Vale para os próximos imóveis publicados." },
    ],
  },
];

export const TODOS_CAMPOS: Campo[] = GRUPOS.flatMap((g) => g.campos);
export const CHAVES_VALIDAS = new Set(TODOS_CAMPOS.map((c) => c.chave));

/** Normaliza e valida um valor conforme o tipo declarado. Erro = string. */
export function validarCampo(campo: Campo, bruto: unknown): { valor: unknown } | { erro: string } {
  if (campo.tipo === "lista") {
    const itens = Array.isArray(bruto)
      ? bruto.map(String)
      : String(bruto ?? "").split("\n").map((s) => s.trim()).filter(Boolean);
    return { valor: itens };
  }

  if (["numero", "dinheiro", "percentual", "coordenada"].includes(campo.tipo)) {
    const n = typeof bruto === "number" ? bruto : Number(String(bruto ?? "").replace(",", "."));
    if (!Number.isFinite(n)) return { erro: `${campo.rotulo}: informe um número.` };
    if (campo.min != null && n < campo.min) return { erro: `${campo.rotulo}: mínimo ${campo.min}.` };
    if (campo.max != null && n > campo.max) return { erro: `${campo.rotulo}: máximo ${campo.max}.` };
    return { valor: n };
  }

  const s = String(bruto ?? "").trim();
  if (campo.tipo === "email" && s && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) {
    return { erro: `${campo.rotulo}: e-mail inválido.` };
  }
  if (campo.tipo === "telefone" && s && !/^\d{10,15}$/.test(s.replace(/\D/g, ""))) {
    return { erro: `${campo.rotulo}: use DDI+DDD+número, só dígitos (ex.: 553499745140).` };
  }
  return { valor: campo.tipo === "telefone" ? s.replace(/\D/g, "") : s };
}

/** Lê settings do banco aplicando os padrões do registro. */
export function comPadroes(linhas: { chave: string; valor: unknown }[]): Record<string, unknown> {
  const mapa = Object.fromEntries(linhas.map((l) => [l.chave, l.valor]));
  const saida: Record<string, unknown> = {};
  for (const campo of TODOS_CAMPOS) {
    const v = mapa[campo.chave];
    saida[campo.chave] = v === undefined || v === null || v === "" ? campo.padrao : v;
  }
  return saida;
}
