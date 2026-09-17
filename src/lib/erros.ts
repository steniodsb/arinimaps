import { NextResponse } from "next/server";

/**
 * Envelope único de erro das rotas de API.
 *
 * A tela do admin mostrava "Falha no envio." para qualquer problema — o
 * operador não tinha como saber se o arquivo era grande demais, se o CAD
 * estava sem georreferência ou se o servidor caiu. Toda falha agora responde
 * com três campos separados, porque respondem a perguntas diferentes:
 *
 *   mensagem → o que aconteceu
 *   motivo   → por que aconteceu (a medida, o número, o limite)
 *   solucao  → o que a pessoa faz agora
 *
 * `detalhes` guarda o que interessa ao desenvolvedor (contagens, bbox,
 * mensagem do Postgres) e a tela mostra colapsado.
 */
export type CorpoErro = {
  error: string;
  motivo?: string;
  solucao?: string;
  codigo: string;
  detalhes?: Record<string, unknown>;
};

export function falha(
  status: number,
  codigo: string,
  mensagem: string,
  extra?: { motivo?: string; solucao?: string; detalhes?: Record<string, unknown> }
) {
  const corpo: CorpoErro = { error: mensagem, codigo, ...extra };
  return NextResponse.json(corpo, { status });
}

/** Erro vindo do Supabase/Postgres traduzido para o que o operador precisa saber. */
export function falhaBanco(codigo: string, e: { message: string; code?: string; details?: string }) {
  const violaFk = e.code === "23503";
  const duplicado = e.code === "23505";
  return falha(
    duplicado || violaFk ? 409 : 500,
    codigo,
    duplicado
      ? "Esse registro já existe."
      : violaFk
        ? "Há registros ligados a este item."
        : "O banco recusou a operação.",
    {
      motivo: e.message,
      solucao: duplicado
        ? "Confira se não foi cadastrado antes."
        : violaFk
          ? "Remova ou desvincule os registros dependentes primeiro."
          : "Se repetir, mande esta tela para o desenvolvedor — o motivo abaixo identifica a causa.",
      detalhes: { code: e.code, details: e.details },
    }
  );
}
