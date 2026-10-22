"use server";

import { redirect } from "next/navigation";

import { esquemaLogin } from "@/lib/schemas";
import { criarClienteServidor } from "@/lib/supabase/server";

export type EstadoLogin = { erro: string | null };

/**
 * Entrar no painel.
 *
 * Não existe cadastro público neste app — o usuário da ZP é criado à mão no
 * painel do Supabase. Esta action só troca e-mail + senha por sessão.
 */
export async function entrar(
  _anterior: EstadoLogin,
  dados: FormData,
): Promise<EstadoLogin> {
  const analise = esquemaLogin.safeParse({
    email: dados.get("email"),
    senha: dados.get("senha"),
  });

  if (!analise.success) {
    return { erro: analise.error.issues[0]?.message ?? "Confira os campos." };
  }

  const supabase = await criarClienteServidor();
  const { error } = await supabase.auth.signInWithPassword({
    email: analise.data.email,
    password: analise.data.senha,
  });

  if (error) {
    // Mensagem única de propósito: dizer "este e-mail não existe" entrega quais
    // e-mails têm conta. E aqui só existe uma conta, a da ZP.
    return { erro: "E-mail ou senha incorretos." };
  }

  // `de` vem do proxy quando ele barrou alguém a caminho de uma página do
  // painel. Só aceitamos caminho interno do /admin — devolver o valor cru
  // viraria redirect aberto pra qualquer domínio.
  const de = dados.get("de");
  const destino =
    typeof de === "string" && /^\/admin(?:\/|$)/.test(de) ? de : "/admin";

  redirect(destino);
}

/** Sair. Limpa a sessão do Supabase e devolve pra tela de login. */
export async function sair() {
  const supabase = await criarClienteServidor();
  await supabase.auth.signOut();
  redirect("/admin/login");
}
