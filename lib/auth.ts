import "server-only";

import { redirect } from "next/navigation";

import { criarClienteServidor } from "@/lib/supabase/server";

/**
 * Quem é o admin logado — ou `null`.
 *
 * Sempre `getUser()`, nunca `getSession()`: o primeiro valida o token contra o
 * servidor de auth, o segundo só lê o cookie e acredita no que está escrito.
 */
export async function obterAdmin() {
  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/**
 * Porta de entrada de toda página e Server Action do painel.
 *
 * O `proxy.ts` já redireciona quem não está logado, mas isso é conveniência de
 * navegação, não segurança: Server Action é um POST que qualquer um pode
 * disparar sem passar pela tela. Quem protege é esta chamada, repetida em cada
 * ponto de entrada.
 */
export async function exigirAdmin() {
  const admin = await obterAdmin();
  if (!admin) redirect("/admin/login");
  return admin;
}
