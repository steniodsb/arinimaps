/** "553499745140" → "(34) 9974-5140"; "5534999745140" → "(34) 99974-5140". */
export function formatarTelefone(digitos: string) {
  const d = digitos.replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
  if (d.length < 10) return digitos;
  return `(${d.slice(0, 2)}) ${d.slice(2, -4)}-${d.slice(-4)}`;
}
