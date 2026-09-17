"use client";

/**
 * Cliente HTTP do painel. Existe por um motivo específico: o padrão antigo
 *
 *   const data = await res.json().catch(() => ({}));
 *   setErro(data.error ?? "Falha no envio.");
 *
 * transforma TODA falha sem corpo JSON na mesma frase vazia. E é justamente
 * a falha sem corpo que é a mais grave: proxy que corta o upload (413),
 * processo que morreu por memória (502), tempo esgotado (504), sessão
 * expirada que devolve HTML de login. O operador via "Falha no envio." e não
 * tinha o que fazer com isso.
 *
 * Aqui cada uma dessas situações vira um erro com motivo e caminho de saída.
 */

export type ErroApi = {
  mensagem: string;
  motivo?: string;
  solucao?: string;
  codigo: string;
  status: number;
  detalhes?: Record<string, unknown>;
};

export type Resultado<T> = { ok: true; dados: T } | { ok: false; erro: ErroApi };

const MB = 1024 * 1024;

function porStatus(status: number, corpoTexto: string, tamanhoEnviado?: number): ErroApi {
  const trecho = corpoTexto.trim().slice(0, 300);
  const pareceHtml = /^\s*<(!doctype|html)/i.test(corpoTexto);

  if (status === 0) {
    return {
      status, codigo: "sem_resposta",
      mensagem: "O servidor não respondeu.",
      motivo: tamanhoEnviado
        ? `A conexão caiu durante o envio de ${(tamanhoEnviado / MB).toFixed(1)} MB.`
        : "A conexão caiu antes de a resposta chegar.",
      solucao: "Confira a internet e tente de novo. Se o arquivo for grande, prefira uma rede estável (cabo/Wi-Fi).",
    };
  }
  if (status === 401 || status === 403) {
    return {
      status, codigo: "sem_permissao",
      mensagem: status === 401 ? "Sua sessão expirou." : "Você não tem permissão para esta ação.",
      motivo: pareceHtml ? "O servidor devolveu a tela de login em vez da resposta." : trecho || undefined,
      solucao: status === 401 ? "Entre de novo e repita a operação." : "Peça a alguém da diretoria.",
    };
  }
  if (status === 413) {
    return {
      status, codigo: "arquivo_grande",
      mensagem: "O arquivo foi recusado antes de chegar ao sistema.",
      motivo: `O servidor de entrada (proxy) tem limite de corpo menor que o arquivo${
        tamanhoEnviado ? ` de ${(tamanhoEnviado / MB).toFixed(1)} MB` : ""
      }.`,
      solucao: "Reduza o arquivo no CAD (apague camadas de texto e cotas) ou peça ao desenvolvedor para aumentar client_max_body_size.",
    };
  }
  if (status === 502 || status === 503) {
    return {
      status, codigo: "servidor_caiu",
      mensagem: "O servidor reiniciou no meio da operação.",
      motivo: tamanhoEnviado
        ? `Quase sempre é falta de memória ao processar um arquivo grande (${(tamanhoEnviado / MB).toFixed(1)} MB).`
        : "O processo do site caiu ou está subindo.",
      solucao: "Espere alguns segundos e tente de novo. Se repetir com o mesmo arquivo, é o tamanho dele — fale com o desenvolvedor.",
    };
  }
  if (status === 504) {
    return {
      status, codigo: "tempo_esgotado",
      mensagem: "A operação demorou mais que o limite do servidor.",
      motivo: "O proxy encerrou a espera antes de a conversão terminar.",
      solucao: "Tente com um arquivo menor, ou peça o aumento do proxy_read_timeout.",
    };
  }
  return {
    status, codigo: "erro_" + status,
    mensagem: `O servidor respondeu ${status}.`,
    motivo: pareceHtml ? "A resposta veio em HTML, não em JSON — provavelmente uma página de erro do proxy." : trecho || undefined,
    solucao: "Se repetir, mande esta tela para o desenvolvedor.",
  };
}

async function interpretar<T>(res: Response, tamanhoEnviado?: number): Promise<Resultado<T>> {
  const texto = await res.text();
  let corpo: Record<string, unknown> | null = null;
  try { corpo = texto ? JSON.parse(texto) : null; } catch { corpo = null; }

  if (res.ok) return { ok: true, dados: (corpo ?? {}) as T };

  if (corpo && typeof corpo.error === "string") {
    return {
      ok: false,
      erro: {
        mensagem: corpo.error,
        motivo: typeof corpo.motivo === "string" ? corpo.motivo : undefined,
        solucao: typeof corpo.solucao === "string" ? corpo.solucao : undefined,
        codigo: typeof corpo.codigo === "string" ? corpo.codigo : "erro_" + res.status,
        status: res.status,
        detalhes: (corpo.detalhes as Record<string, unknown>) ?? undefined,
      },
    };
  }
  return { ok: false, erro: porStatus(res.status, texto, tamanhoEnviado) };
}

/** POST/PATCH/DELETE com corpo JSON. */
export async function enviarJson<T = Record<string, unknown>>(
  url: string,
  metodo: "POST" | "PATCH" | "PUT" | "DELETE",
  corpo?: unknown
): Promise<Resultado<T>> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: metodo,
      headers: corpo === undefined ? undefined : { "Content-Type": "application/json" },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
  } catch {
    return { ok: false, erro: porStatus(0, "") };
  }
  return interpretar<T>(res);
}

/**
 * Upload de arquivo grande com progresso real.
 *
 * DUAS ESCOLHAS QUE PARECEM DETALHE E NÃO SÃO:
 *
 * 1. XMLHttpRequest, não fetch — o fetch do navegador ainda não expõe progresso
 *    de upload, e num DXF de 100 MB a diferença entre "Processando…" parado e
 *    "68% enviado" é a diferença entre esperar e recarregar a página no meio.
 *
 * 2. Corpo bruto, não multipart — o `formData()` do servidor monta o arquivo
 *    inteiro na memória antes de entregar o primeiro byte. Os metadados vão na
 *    query string e o arquivo vai puro, para o servidor poder lê-lo em fluxo.
 */
export function enviarArquivo<T = Record<string, unknown>>(
  url: string,
  arquivo: File,
  campos: Record<string, string>,
  aoProgredir?: (pct: number, enviadoBytes: number, totalBytes: number) => void
): Promise<Resultado<T>> {
  const total = arquivo.size;
  const qs = new URLSearchParams({ ...campos, arquivo: arquivo.name }).toString();

  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${url}?${qs}`);
    xhr.setRequestHeader("Content-Type", arquivo.type || "application/octet-stream");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && aoProgredir) aoProgredir(Math.round((e.loaded / e.total) * 100), e.loaded, e.total);
    };
    xhr.onerror = () => resolve({ ok: false, erro: porStatus(0, "", total) });
    xhr.ontimeout = () => resolve({ ok: false, erro: porStatus(504, "", total) });
    xhr.onload = () => {
      const texto = xhr.responseText ?? "";
      let corpo: Record<string, unknown> | null = null;
      try { corpo = texto ? JSON.parse(texto) : null; } catch { corpo = null; }
      if (xhr.status >= 200 && xhr.status < 300) return resolve({ ok: true, dados: (corpo ?? {}) as T });
      if (corpo && typeof corpo.error === "string") {
        return resolve({
          ok: false,
          erro: {
            mensagem: corpo.error,
            motivo: typeof corpo.motivo === "string" ? corpo.motivo : undefined,
            solucao: typeof corpo.solucao === "string" ? corpo.solucao : undefined,
            codigo: typeof corpo.codigo === "string" ? corpo.codigo : "erro_" + xhr.status,
            status: xhr.status,
            detalhes: (corpo.detalhes as Record<string, unknown>) ?? undefined,
          },
        });
      }
      resolve({ ok: false, erro: porStatus(xhr.status, texto, total) });
    };
    xhr.send(arquivo);
  });
}
