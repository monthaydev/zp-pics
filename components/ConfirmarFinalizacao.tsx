"use client";

import { AlertTriangle } from "lucide-react";
import { useEffect, useRef } from "react";

type Props = {
  escolhidas: number;
  incluidas: number;
  aDescartar: number;
  enviando: boolean;
  erro: string | null;
  aoConfirmar: () => void;
  aoCancelar: () => void;
};

/**
 * A última porta antes do caminho sem volta.
 *
 * Finalizar trava a sessão **e apaga do servidor as fotos não escolhidas**. O
 * cliente precisa sair daqui sabendo disso — por isso o número de fotos que
 * serão apagadas aparece por extenso e o próprio botão diz o que vai acontecer,
 * em vez de um "Confirmar" que não compromete com nada.
 */
export default function ConfirmarFinalizacao({
  escolhidas,
  incluidas,
  aDescartar,
  enviando,
  erro,
  aoConfirmar,
  aoCancelar,
}: Props) {
  const caixa = useRef<HTMLDivElement>(null);
  const cancelar = useRef<HTMLButtonElement>(null);

  // O foco começa em "Voltar", nunca no botão que apaga: um Enter distraído não
  // pode ser o que destrói o ensaio.
  useEffect(() => {
    cancelar.current?.focus();

    function aoTeclar(evento: KeyboardEvent) {
      if (evento.key === "Escape") {
        evento.preventDefault();
        aoCancelar();
        return;
      }
      if (evento.key !== "Tab") return;

      const alvos = caixa.current?.querySelectorAll<HTMLElement>("button");
      if (!alvos?.length) return;
      const primeiro = alvos[0];
      const ultimo = alvos[alvos.length - 1];
      if (evento.shiftKey && document.activeElement === primeiro) {
        evento.preventDefault();
        ultimo.focus();
      } else if (!evento.shiftKey && document.activeElement === ultimo) {
        evento.preventDefault();
        primeiro.focus();
      }
    }

    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [aoCancelar]);

  const extras = Math.max(escolhidas - incluidas, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-veu p-4 sm:items-center">
      <div
        ref={caixa}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="titulo-finalizar"
        className="w-full max-w-md border border-linha-forte bg-superficie p-6"
      >
        <h2
          id="titulo-finalizar"
          className="font-display text-2xl uppercase tracking-cine"
        >
          Finalizar seleção
        </h2>

        <p className="mt-4 text-sm leading-relaxed text-tinta-2">
          Você escolheu{" "}
          <strong className="font-hud text-tinta">{escolhidas}</strong> de{" "}
          <span className="font-hud">{incluidas}</span> fotos
          {extras > 0 && (
            <>
              {" "}
              — <span className="font-hud text-rec-papel">{extras}</span> além do seu
              pacote, que o ZP Studio combina com você
            </>
          )}
          .
        </p>

        {aDescartar > 0 && (
          <p className="mt-4 flex gap-3 border border-linha-forte bg-superficie-2 p-4 text-sm leading-relaxed text-tinta">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-rec-papel" aria-hidden />
            <span>
              As{" "}
              <strong className="font-hud">{aDescartar}</strong> fotos que você
              não escolheu serão apagadas e{" "}
              <strong>não têm como voltar</strong>. Confira antes de seguir.
            </span>
          </p>
        )}

        <p className="mt-4 text-sm leading-relaxed text-tinta-2">
          Depois de finalizar você não consegue mudar a escolha — só o ZP Studio
          pode reabrir.
        </p>

        {erro && (
          <p role="alert" className="mt-4 font-body text-xs text-rec-papel">
            {erro}
          </p>
        )}

        <div className="mt-6 flex flex-col gap-3 sm:flex-row-reverse">
          <button
            type="button"
            onClick={aoConfirmar}
            disabled={enviando}
            className="h-12 flex-1 bg-tinta px-4 font-body text-sm font-medium text-fundo transition-[opacity,transform] duration-150 hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
          >
            {enviando
              ? "Finalizando…"
              : aDescartar > 0
                ? "Finalizar e apagar o resto"
                : "Finalizar seleção"}
          </button>
          <button
            ref={cancelar}
            type="button"
            onClick={aoCancelar}
            disabled={enviando}
            className="h-12 flex-1 border border-linha-forte px-4 font-body text-sm text-tinta transition-[colors,transform] duration-150 active:scale-[0.98] hover:border-tinta-2 disabled:opacity-50"
          >
            Voltar
          </button>
        </div>
      </div>
    </div>
  );
}
