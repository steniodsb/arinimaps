import "server-only";

/**
 * Fila com limite de execuções simultâneas (semáforo), em memória do processo.
 *
 * Serve para o que NÃO pode receber pedidos sem freio: os serviços dos órgãos
 * (SICAR, INCRA, IBAMA… — com 25+ consultas de área ao mesmo tempo viram
 * centenas de pedidos por minuto e eles caem ou bloqueiam), as consultas de
 * área inteiras e as conversas com o assistente (limite de chamadas por minuto
 * da Anthropic). Ver docs/INFRA-NACIONAL.md §5.
 *
 * Em memória e não no banco de propósito: o que se protege é a carga gerada
 * POR ESTE processo, e a fila precisa responder em microssegundos. Com mais de
 * um processo cada um tem a sua — o teto efetivo é `max × processos`, o que é
 * aceitável (anotado no §5, item 4, junto do limite por IP).
 *
 * As filas moram em `globalThis`: o Next empacota cada rota separadamente e,
 * em desenvolvimento, recarrega módulos — sem isso cada rota (e cada recarga)
 * teria um semáforo próprio e o limite não valeria para o processo.
 */

/** Devolve a vaga. Pode ser chamada mais de uma vez: só a primeira conta. */
export type Liberar = () => void;

/** A espera estourou, a fila estava cheia ou o pedido foi cancelado antes de ganhar vaga. */
export class EsperaEsgotada extends Error {
  constructor(
    readonly fila: string,
    /**
     * Posição em que o pedido entraria se voltasse agora (fila atual + 1). Não
     * é a posição em que ele estava ao desistir: os mais antigos estouram o
     * prazo primeiro, então essa seria quase sempre 1 — e quem tenta de novo
     * volta para o fim da fila.
     */
    readonly posicao: number,
    readonly motivo: "cheia" | "tempo" | "cancelado",
  ) {
    super(motivo === "cheia" ? `fila ${fila} cheia` : motivo === "tempo" ? `espera esgotada na fila ${fila}` : "cancelado");
    this.name = "EsperaEsgotada";
  }
}

type Aguardando = { acordar: (l: Liberar) => void };

export class Fila {
  private ativos = 0;
  private aguardando: Aguardando[] = [];

  constructor(readonly nome: string, readonly max: number) {}

  /** Retrato para log e para a resposta de "você está na fila". */
  get ocupacao() {
    return { ativos: this.ativos, aguardando: this.aguardando.length, max: this.max };
  }

  /**
   * Pede uma vaga. Resolve com a função que a devolve — chame-a SEMPRE num
   * `finally`. Rejeita com `EsperaEsgotada` se a fila já tem `maxFila` pessoas
   * esperando, se `esperaMs` passar sem vaga ou se `signal` for abortado.
   */
  entrar(opcoes: { esperaMs: number; maxFila?: number; signal?: AbortSignal }): Promise<Liberar> {
    const { esperaMs, maxFila = Infinity, signal } = opcoes;
    if (signal?.aborted) return Promise.reject(new EsperaEsgotada(this.nome, 0, "cancelado"));
    // quem já está esperando passa na frente de quem acabou de chegar
    if (this.ativos < this.max && this.aguardando.length === 0) {
      this.ativos++;
      return Promise.resolve(this.vaga());
    }
    if (this.aguardando.length >= maxFila) {
      return Promise.reject(new EsperaEsgotada(this.nome, this.aguardando.length + 1, "cheia"));
    }
    return new Promise<Liberar>((resolver, rejeitar) => {
      const sair = (motivo: "tempo" | "cancelado") => {
        const i = this.aguardando.indexOf(item);
        if (i < 0) return; // já ganhou a vaga
        this.aguardando.splice(i, 1);
        clearTimeout(relogio);
        signal?.removeEventListener("abort", aoAbortar);
        rejeitar(new EsperaEsgotada(this.nome, this.aguardando.length + 1, motivo));
      };
      const aoAbortar = () => sair("cancelado");
      const item: Aguardando = {
        acordar: (liberar) => {
          clearTimeout(relogio);
          signal?.removeEventListener("abort", aoAbortar);
          resolver(liberar);
        },
      };
      const relogio = setTimeout(() => sair("tempo"), esperaMs);
      signal?.addEventListener("abort", aoAbortar, { once: true });
      this.aguardando.push(item);
    });
  }

  /** Vaga ocupada: ao liberar, passa direto para o primeiro da fila (sem descer o contador). */
  private vaga(): Liberar {
    let liberada = false;
    return () => {
      if (liberada) return;
      liberada = true;
      const proximo = this.aguardando.shift();
      if (proximo) proximo.acordar(this.vaga());
      else this.ativos--;
    };
  }

  /** Executa `fn` dentro de uma vaga, devolvendo-a no fim mesmo se `fn` falhar. */
  async executar<T>(opcoes: { esperaMs: number; maxFila?: number; signal?: AbortSignal }, fn: () => Promise<T>): Promise<T> {
    const liberar = await this.entrar(opcoes);
    try {
      return await fn();
    } finally {
      liberar();
    }
  }
}

const registro = ((globalThis as { __ariniFilas?: Map<string, Fila> }).__ariniFilas ??= new Map<string, Fila>());

/** A fila de nome `nome` deste processo (criada na primeira chamada com o teto `max`). */
export function fila(nome: string, max: number): Fila {
  let f = registro.get(nome);
  if (!f) {
    f = new Fila(nome, Math.max(1, Math.floor(max)));
    registro.set(nome, f);
  }
  return f;
}

/** Inteiro positivo de uma variável de ambiente, ou o padrão. */
export function inteiroDoAmbiente(nome: string, padrao: number): number {
  const v = Number(process.env[nome]);
  return Number.isFinite(v) && v >= 1 ? Math.floor(v) : padrao;
}
