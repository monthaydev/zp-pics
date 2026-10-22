"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";

import { abrirSessao } from "./acoes";

/** Tira a sessão do rascunho. Antes disso o link do cliente não mostra nada. */
export default function BotaoAbrir({ sessaoId }: { sessaoId: string }) {
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        type="button"
        disabled={pendente}
        onClick={() =>
          iniciar(async () => {
            const r = await abrirSessao({ sessao_id: sessaoId });
            setErro(r.ok ? null : (r.erro ?? "Não foi possível abrir."));
          })
        }
      >
        {pendente ? "Abrindo…" : "Abrir para o cliente"}
      </Button>
      {erro && <p className="font-hud text-xs text-rec-papel">{erro}</p>}
    </div>
  );
}
