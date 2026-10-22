import { createBrowserClient } from "@supabase/ssr";

/**
 * Cliente do navegador. Só é usado pelo painel da ZP.
 *
 * O cliente do ensaio NUNCA fala com o Supabase — ele fala com Server Actions
 * que já validaram o cookie da sessão. A RLS nega tudo por padrão, então a
 * `anon key` daqui não abre porta nenhuma sozinha.
 */
export function criarClienteNavegador() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
