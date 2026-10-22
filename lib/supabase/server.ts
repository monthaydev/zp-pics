import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

/** Cliente do servidor com a sessão do admin (lê e escreve cookies de auth). */
export async function criarClienteServidor() {
  const armazem = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => armazem.getAll(),
        setAll: (paraGravar) => {
          try {
            paraGravar.forEach(({ name, value, options }) =>
              armazem.set(name, value, options),
            );
          } catch {
            // Server Component não pode gravar cookie. Quem renova a sessão é o
            // middleware; aqui o silêncio é intencional.
          }
        },
      },
    },
  );
}

/**
 * Cliente com `service_role` — ignora RLS.
 *
 * Só para o caminho do cliente do ensaio, que não tem usuário no Supabase e já
 * foi autorizado pelo cookie assinado da sessão. NUNCA importe isto em
 * componente client: a chave vazaria pro navegador.
 */
export function criarClienteAdministrativo() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
