/**
 * Política de senha, igual no cadastro, na troca e na recuperação.
 * Comprimento pesa mais que símbolos obrigatórios (NIST 800-63B): 10+
 * caracteres, sem ser uma das senhas que todo robô testa primeiro.
 * O hash (bcrypt com salt) é do Supabase Auth — a senha em texto nunca é
 * gravada nem fica visível para administradores.
 */
const COMUNS = new Set([
  "1234567890", "12345678910", "0123456789", "senha12345", "senha123456", "password123",
  "qwertyuiop", "qwerty12345", "arinimaps1", "arini12345", "abcdefghij", "1q2w3e4r5t",
]);

export const SENHA_MIN = 10;

export function validarSenha(senha: string): string | null {
  if (senha.length < SENHA_MIN) return `A senha precisa ter pelo menos ${SENHA_MIN} caracteres.`;
  if (senha.length > 72) return "A senha pode ter no máximo 72 caracteres.";
  if (COMUNS.has(senha.toLowerCase())) return "Essa senha é muito comum. Escolha outra.";
  if (/^(.)\1+$/.test(senha)) return "A senha não pode ser um único caractere repetido.";
  if (!/[a-zA-Z]/.test(senha) || !/\d/.test(senha)) return "Use letras e números na senha.";
  return null;
}
