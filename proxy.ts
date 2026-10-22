import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Proxy — no Next 16 é o que antes se chamava middleware (mesma função, nome
 * novo). Faz duas coisas, nesta ordem:
 *
 * 1. Renova o token do Supabase Auth. Server Component não consegue gravar
 *    cookie (ver `lib/supabase/server.ts`), então é aqui que a sessão do admin
 *    sobrevive. Sem isto o painel derruba o login sozinho depois de uma hora.
 * 2. Barra `/admin/*` para quem não está logado.
 *
 * O cliente do ensaio NÃO passa por aqui: `/s/[slug]` se defende com o cookie
 * assinado da própria sessão, que não tem nada a ver com o Supabase Auth.
 */
export async function proxy(request: NextRequest) {
  // Este objeto é devolvido no fim. O cliente do Supabase grava os cookies
  // renovados nele — criar uma resposta nova no meio do caminho descarta essa
  // renovação em silêncio e desloga o admin de tempos em tempos.
  let resposta = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (paraGravar) => {
          paraGravar.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          resposta = NextResponse.next({ request });
          paraGravar.forEach(({ name, value, options }) =>
            resposta.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // getUser() confere o token com o servidor de auth. getSession() só lê o
  // cookie e aceita o que estiver escrito nele — não serve para decidir acesso.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const caminho = request.nextUrl.pathname;
  const ehLogin = caminho === "/admin/login";

  if (!user && caminho.startsWith("/admin") && !ehLogin) {
    const destino = request.nextUrl.clone();
    destino.pathname = "/admin/login";
    // Guarda para onde a pessoa queria ir, e devolve pra lá depois do login.
    destino.searchParams.set("de", caminho);
    return NextResponse.redirect(destino);
  }

  if (user && ehLogin) {
    const destino = request.nextUrl.clone();
    destino.pathname = "/admin";
    destino.search = "";
    return NextResponse.redirect(destino);
  }

  return resposta;
}

export const config = {
  // Só o painel. Arquivo estático e imagem ficam de fora — cada passada aqui
  // custa uma ida ao servidor de auth.
  matcher: ["/admin/:path*"],
};
