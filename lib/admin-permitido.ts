/**
 * Quem pode ser admin: uma lista de e-mails, não "qualquer usuário do Supabase".
 *
 * Antes, `exigirAdmin` aceitava qualquer sessão válida do Supabase Auth. Com o
 * cadastro público aberto (o padrão de um projeto novo), qualquer pessoa criava
 * uma conta e entrava no painel inteiro — e as policies de RLS liberam tudo
 * para `authenticated`. A lista fecha isso no app, mesmo que o cadastro seja
 * reaberto por engano no painel do Supabase.
 *
 * Fecha por omissão: sem `ADMIN_EMAILS`, ninguém é admin. Um deploy sem a
 * variável tranca o painel em vez de abri-lo. Função pura, sem `server-only`,
 * porque o `proxy.ts` também usa.
 */
export function emailEhAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  const lista = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return lista.includes(email.trim().toLowerCase());
}
