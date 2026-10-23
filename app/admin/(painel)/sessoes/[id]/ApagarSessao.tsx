"use client";

import { AlertTriangle, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";

import { apagarSessao } from "./entrega-acoes";

/**
 * Botão + diálogo de confirmação para apagar uma sessão de vez.
 *
 * Ação IRREVERSÍVEL: apaga tudo do R2 e do banco, sem volta. Por isso:
 * 1. Exige que o admin digite o título da sessão para confirmar.
 * 2. O foco começa em "Cancelar", nunca no botão que apaga.
 */
export default function ApagarSessao({
  sessaoId,
  titulo,
  clienteEscolhendo,
}: {
  sessaoId: string;
  titulo: string;
  /** Sessão aberta: o cliente pode estar no meio da escolha agora. */
  clienteEscolhendo: boolean;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [confirmacao, setConfirmacao] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const cancelarRef = useRef<HTMLButtonElement>(null);
  const caixaRef = useRef<HTMLDivElement>(null);

  const tituloLimpo = titulo.trim().toLowerCase();
  const digitouCerto = confirmacao.trim().toLowerCase() === tituloLimpo;

  useEffect(() => {
    if (!aberto) return;
    cancelarRef.current?.focus();

    function aoTeclar(evento: KeyboardEvent) {
      if (evento.key === "Escape") {
        evento.preventDefault();
        setAberto(false);
      }
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [aberto]);

  async function confirmar() {
    if (!digitouCerto || enviando) return;
    setEnviando(true);
    setErro(null);

    const resultado = await apagarSessao({ sessao_id: sessaoId });
    if (!resultado.ok) {
      setErro(resultado.erro ?? "Não deu pra apagar.");
      setEnviando(false);
      return;
    }

    // Volta pro painel — a sessão não existe mais.
    router.push("/admin");
    router.refresh();
  }

  if (!aberto) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="text-rec-papel hover:border-rec-papel hover:text-rec-papel"
        onClick={() => {
          setAberto(true);
          setConfirmacao("");
          setErro(null);
        }}
      >
        <Trash2 className="size-3.5" />
        Apagar sessão
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-veu p-4 sm:items-center">
      <div
        ref={caixaRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="titulo-apagar"
        className="w-full max-w-md border border-linha-forte bg-superficie p-6"
      >
        <h2
          id="titulo-apagar"
          className="font-display text-2xl uppercase tracking-cine"
        >
          Apagar sessão
        </h2>

        <p className="mt-4 flex gap-3 border border-linha-forte bg-superficie-2 p-4 text-sm leading-relaxed text-tinta">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-rec-papel" aria-hidden />
          <span>
            Isso apaga <strong>tudo</strong> — fotos, seleções, entregas e a
            sessão inteira. <strong>Não tem como voltar.</strong>
          </span>
        </p>

        {clienteEscolhendo && (
          <p className="mt-3 text-sm leading-relaxed text-tinta-2">
            A sessão está aberta: se o cliente estiver escolhendo agora, a
            galeria dele sai do ar e o que ele marcou se perde.
          </p>
        )}

        <p className="mt-4 text-sm leading-relaxed text-tinta-2">
          Para confirmar, digite o nome da sessão:{" "}
          <strong className="font-hud text-tinta">{titulo}</strong>
        </p>

        <input
          type="text"
          value={confirmacao}
          onChange={(e) => setConfirmacao(e.target.value)}
          placeholder={titulo}
          disabled={enviando}
          className="mt-3 h-10 w-full border border-linha-forte bg-fundo px-3 font-hud text-sm text-tinta placeholder:text-tinta-3 focus:border-tinta focus:outline-none disabled:opacity-50"
        />

        {erro && (
          <p role="alert" className="mt-4 font-hud text-xs text-rec-papel">
            {erro}
          </p>
        )}

        <div className="mt-6 flex flex-col gap-3 sm:flex-row-reverse">
          <button
            type="button"
            onClick={confirmar}
            disabled={!digitouCerto || enviando}
            className="h-12 flex-1 bg-tinta px-4 font-body text-sm font-medium uppercase tracking-cine text-fundo transition-[opacity,transform] duration-150 hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
          >
            {enviando ? "Apagando…" : "Apagar definitivamente"}
          </button>
          <button
            ref={cancelarRef}
            type="button"
            onClick={() => setAberto(false)}
            disabled={enviando}
            className="h-12 flex-1 border border-linha-forte px-4 font-body text-sm uppercase tracking-cine text-tinta transition-[colors,transform] duration-150 active:scale-[0.98] hover:border-tinta-2 disabled:opacity-50"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
