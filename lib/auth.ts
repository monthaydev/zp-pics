import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";

import { criarClienteServidor } from "@/lib/supabase/server";

/**
 * Quem é o admin logado — ou `null`.
 *
 * Sempre `getUser()`, nunca `getSession()`: o primeiro valida o token contra o
 * servidor de auth, o segundo só lê o cookie e acredita no que está escrito.
 */
/*
  `cache` do React: o layout do painel e a página chamam `exigirAdmin` na mesma
  requisição, e cada `getUser()` é uma ida ao servidor de auth. Sem isto eram
  duas por navegação (mais a do proxy) — medido no Vercel, a tela "demorava
  pra entrar" porque as idas ficavam em fila. Dentro de UMA requisição o
  resultado é reaproveitado; entre requisições nada é guardado, então o token
  continua sendo conferido com o servidor a cada navegação.
*/
export const obterAdmin = cache(async () => {
  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

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
