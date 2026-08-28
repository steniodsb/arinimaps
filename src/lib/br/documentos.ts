/**
 * Validação de CPF e CNPJ (dígitos verificadores reais, não só formato).
 *
 * O cadastro exige CPF: é o que torna a conta rastreável a uma pessoa —
 * e-mail sozinho não identifica ninguém num sistema que intermedia venda
 * de imóvel.
 */

export const soDigitos = (v: string) => (v ?? "").replace(/\D/g, "");

export function validarCPF(bruto: string): boolean {
  const cpf = soDigitos(bruto);
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false; // 111.111.111-11 e afins

  for (const [ate, posDigito] of [[9, 9], [10, 10]] as const) {
    let soma = 0;
    for (let i = 0; i < ate; i++) soma += Number(cpf[i]) * (ate + 1 - i);
    let dig = (soma * 10) % 11;
    if (dig === 10) dig = 0;
    if (dig !== Number(cpf[posDigito])) return false;
  }
  return true;
}

export function validarCNPJ(bruto: string): boolean {
  const cnpj = soDigitos(bruto);
  if (cnpj.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(cnpj)) return false;

  const calc = (base: string) => {
    let peso = base.length - 7;
    let soma = 0;
    for (let i = 0; i < base.length; i++) {
      soma += Number(base[i]) * peso--;
      if (peso < 2) peso = 9;
    }
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(cnpj.slice(0, 12)) === Number(cnpj[12])
      && calc(cnpj.slice(0, 13)) === Number(cnpj[13]);
}

/** Aceita CPF ou CNPJ — imobiliária cadastra com CNPJ. */
export function validarDocumento(bruto: string): { ok: true; tipo: "cpf" | "cnpj"; valor: string } | { ok: false; erro: string } {
  const d = soDigitos(bruto);
  if (!d) return { ok: false, erro: "Informe o CPF." };
  if (d.length === 11) {
    return validarCPF(d) ? { ok: true, tipo: "cpf", valor: d } : { ok: false, erro: "CPF inválido — confira os números." };
  }
  if (d.length === 14) {
    return validarCNPJ(d) ? { ok: true, tipo: "cnpj", valor: d } : { ok: false, erro: "CNPJ inválido — confira os números." };
  }
  return { ok: false, erro: "CPF deve ter 11 dígitos (CNPJ, 14)." };
}

export function formatarCPF(bruto: string): string {
  const d = soDigitos(bruto).slice(0, 14);
  if (d.length <= 11) {
    return d.replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  }
  return d.replace(/^(\d{2})(\d)/, "$1.$2").replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2").replace(/(\d{4})(\d{1,2})$/, "$1-$2");
}
