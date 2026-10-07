import "server-only";
import { ipDoPedido, respostaLimite, type Limite } from "@/lib/seguranca/limite";

/**
 * Limite de requisições das LEITURAS DO MAPA (tiles e /api/geo), por IP, em
 * memória do processo (roadmap 6.14).
 *
 * POR QUE NÃO O `limitar()` DO BANCO. Uma tela de mapa pede de 20 a 60 tiles a
 * cada movimento, e um usuário navegando faz centenas por minuto. Contar cada
 * um no banco (`fn_rate_limit`) colocaria uma ida e volta ao Postgres na frente
 * de cada tile — dobraria a latência e o limite viraria o gargalo que ele
 * deveria evitar. Aqui a conta é um Map no processo: custo de microssegundos.
 *
 * O PREÇO. Cada instância do servidor conta separado e o contador zera no
 * reinício. Para leitura de mapa isso é aceitável: o objetivo é cortar robô
 * raspando a malha inteira, não contabilidade exata. O limite do banco
 * continua nos endpoints caros (login, cadastro, consulta de área), onde uma
 * ida ao banco a mais não pesa e a precisão importa.
 *
 * JANELA DESLIZANTE APROXIMADA. Dois baldes fixos (o atual e o anterior); a
 * contagem é atual + anterior × fração da janela anterior que ainda vale. É o
 * esquema clássico de limitador de borda: memória constante por IP e sem a
 * rajada dupla na virada de uma janela fixa.
 *
 * Os tetos ficam muito acima do uso normal: cada movimento do mapa pede algumas
 * dezenas de tiles (CAR + lotes), então 3.000 em 5 minutos são mais de uma
 * centena de movimentos sem parar — e o navegador ainda guarda tile em cache.
 */
type Balde = { inicio: number; atual: number; anterior: number };

const MAX_CHAVES = 50_000;
const baldes = new Map<string, Balde>();
let ultimaLimpeza = Date.now();

export const LIMITES_MAPA = {
  tiles: { max: 3000, janelaS: 300 },
  geo: { max: 600, janelaS: 300 },
} as const;

/** Conta mais uma requisição para a chave e diz se ainda pode. */
export function limitarEmMemoria(chave: string, max: number, janelaS: number, agora = Date.now()): Limite {
  const janela = janelaS * 1000;
  limpar(agora, janela);
  let b = baldes.get(chave);
  if (!b) {
    if (baldes.size >= MAX_CHAVES) baldes.delete(baldes.keys().next().value as string);
    b = { inicio: agora - (agora % janela), atual: 0, anterior: 0 };
    baldes.set(chave, b);
  }
  const inicioAtual = agora - (agora % janela);
  if (inicioAtual !== b.inicio) {
    // virou a janela: o atual vira anterior (ou zera, se ficou mais de uma janela parado)
    b.anterior = inicioAtual - b.inicio === janela ? b.atual : 0;
    b.atual = 0;
    b.inicio = inicioAtual;
  }
  const pesoAnterior = 1 - (agora - b.inicio) / janela;
  const estimado = b.atual + b.anterior * pesoAnterior;
  if (estimado >= max) {
    return { permitido: false, restante: 0, liberaEm: new Date(b.inicio + janela) };
  }
  b.atual++;
  return { permitido: true, restante: Math.max(0, Math.floor(max - estimado - 1)), liberaEm: null };
}

function limpar(agora: number, janela: number) {
  if (agora - ultimaLimpeza < 60_000) return;
  ultimaLimpeza = agora;
  for (const [k, b] of baldes) if (agora - b.inicio > 2 * janela) baldes.delete(k);
}

/**
 * Atalho para as rotas do mapa: devolve a resposta 429 pronta quando o IP
 * passou do teto, ou null para seguir.
 */
export function limiteLeituraMapa(request: Request, tipo: keyof typeof LIMITES_MAPA) {
  const { max, janelaS } = LIMITES_MAPA[tipo];
  const l = limitarEmMemoria(`${tipo}:${ipDoPedido(request)}`, max, janelaS);
  return l.permitido ? null : respostaLimite(l, "leitura do mapa");
}

/** Só para teste: zera os contadores. */
export function _zerarLimitesMapa() {
  baldes.clear();
}
