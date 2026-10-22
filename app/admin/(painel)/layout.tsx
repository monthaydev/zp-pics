import Link from "next/link";

import BotaoTema from "@/components/BotaoTema";
import { Button } from "@/components/ui/button";
import { exigirAdmin } from "@/lib/auth";

import { sair } from "../login/acoes";

/**
 * Chrome do painel.
 *
 * Fica num route group `(painel)` para envolver só as telas autenticadas — a
 * tela de login mora fora dele e não herda cabeçalho nem o `exigirAdmin`.
 *
 * A navegação é texto ao lado do logo, e não uma barra lateral: são duas rotas.
 * Sidebar num painel de duas telas é moldura vazia ocupando um terço da largura
 * útil — e a largura aqui é a lista de ensaios.
 */
export default async function PainelLayout({ children }: LayoutProps<"/admin">) {
  const admin = await exigirAdmin();

  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-linha px-6 py-4">
        <Link
          href="/admin"
          className="font-display text-lg uppercase tracking-cine"
        >
          ZP Pics
        </Link>

        <nav className="flex items-center gap-5">
          <LinkNav href="/admin">Sessões</LinkNav>
          <LinkNav href="/admin/sessoes/nova">Nova sessão</LinkNav>
          {/* A bancada só existe em dev, e até aqui só era alcançável por quem
              soubesse a URL de cor. */}
          {process.env.NODE_ENV === "development" && (
            <LinkNav href="/admin/laboratorio">Laboratório</LinkNav>
          )}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <span className="hidden font-hud text-xs text-tinta-3 sm:inline">
            {admin.email}
          </span>
          <BotaoTema />
          <form action={sair}>
            <Button type="submit" variant="ghost" size="sm">
              Sair
            </Button>
          </form>
        </div>
      </header>

      <main className="flex-1 px-6 py-10">{children}</main>
    </div>
  );
}

function LinkNav({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="font-hud text-hud uppercase tracking-cine text-tinta-3 transition-colors hover:text-tinta"
    >
      {children}
    </Link>
  );
}
