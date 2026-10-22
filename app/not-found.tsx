import type { Metadata } from "next";

export const metadata: Metadata = { title: "Não encontrado · ZP Pics" };

/**
 * 404 seco.
 *
 * Sem "sessão não existe", sem "link expirado", sem sugestão de busca: a mesma
 * tela vale pro slug digitado errado e pro slug que alguém tentou adivinhar.
 */
export default function NaoEncontrado() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="font-display text-6xl uppercase tracking-cine text-linha">
        404
      </p>
      <h1 className="font-display text-2xl uppercase tracking-cine">
        Página não encontrada
      </h1>
      <p className="max-w-xs text-sm leading-relaxed text-tinta-2">
        Confira o link que o ZP Studio mandou. Se ele estiver certo, chame eles
        no WhatsApp.
      </p>
    </main>
  );
}
