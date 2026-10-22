"use client";

import { Moon, Sun } from "lucide-react";

import { CHAVE_TEMA } from "@/lib/tema";
import { cn } from "@/lib/utils";

/**
 * Alterna claro e escuro.
 *
 * Os dois ícones são renderizados sempre, e quem esconde um deles é o CSS
 * (`--sol` / `--lua`, definidos junto dos papéis em `globals.css`). Isso não é
 * capricho: o servidor não tem como saber em que tema o navegador está, e um
 * botão que decide isso em `useEffect` ou pisca o ícone errado no primeiro
 * frame, ou obriga a esconder o botão até a hidratação. Deixando a decisão no
 * CSS, o ícone certo já sai correto no HTML estático.
 *
 * O rótulo é fixo pelo mesmo motivo — "alternar" é verdade nos dois estados,
 * então não precisa mudar e não mente enquanto o JS não chegou.
 */
export default function BotaoTema({ className }: { className?: string }) {
  function alternar() {
    const raiz = document.documentElement;
    // O tema efetivo não sai do atributo: sem escolha salva ele está vazio e
    // quem manda é o sistema. Perguntar ao valor computado é o único jeito de
    // acertar o primeiro clique.
    const atual = getComputedStyle(raiz).colorScheme.includes("dark")
      ? "escuro"
      : "claro";
    const proximo = atual === "escuro" ? "claro" : "escuro";

    raiz.setAttribute("data-tema", proximo);
    try {
      localStorage.setItem(CHAVE_TEMA, proximo);
    } catch {
      // Navegação privada bloqueia o storage. A troca vale para esta aba, que
      // é o que o clique pediu — só não sobrevive ao recarregamento.
    }
  }

  return (
    <button
      type="button"
      onClick={alternar}
      aria-label="Alternar tema claro e escuro"
      title="Alternar tema claro e escuro"
      className={cn(
        "flex size-9 items-center justify-center text-tinta-3 transition-colors hover:text-tinta",
        className,
      )}
    >
      <Sun aria-hidden className="size-4" style={{ display: "var(--sol)" }} />
      <Moon aria-hidden className="size-4" style={{ display: "var(--lua)" }} />
    </button>
  );
}
