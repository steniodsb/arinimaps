/**
 * Área do CAR que a pessoa clicou no mapa ("Esta área é minha") antes de
 * entrar ou criar a conta. Guardada no navegador para o login/cadastro não
 * perder a escolha: depois de entrar, ela cai direto no anúncio com a divisa.
 */
export const CHAVE_CAR_PENDENTE = "arini:car-pendente";

export function guardarCarPendente(cod: string) {
  try { localStorage.setItem(CHAVE_CAR_PENDENTE, cod); } catch { /* sem storage: a URL basta */ }
}

export function lerCarPendente(): string | null {
  try { return localStorage.getItem(CHAVE_CAR_PENDENTE); } catch { return null; }
}

export function limparCarPendente() {
  try { localStorage.removeItem(CHAVE_CAR_PENDENTE); } catch { /* idem */ }
}
