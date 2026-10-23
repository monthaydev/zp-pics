"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { reabrirSessao } from "./acoes";

/**
 * Devolve a sessão pro cliente com prazo novo.
 *
 * O aviso sobre as fotos apagadas não é decoração: depois de uma finalização, o
 * cliente reabre numa galeria que só tem as fotos que ele já tinha escolhido.
 * Reabrir sem saber disso vira ligação de cliente confuso.
 */
export default function ReabrirSessao({
  sessaoId,
  apagadas,
}: {
  sessaoId: string;
  apagadas: number;
}) {
  const [pendente, iniciar] = useTransition();
  const [dias, setDias] = useState("7");
  const [erro, setErro] = useState<string | null>(null);

  return (
    <section>
      <h2 className="font-body text-xs font-medium text-tinta-3">
        Reabrir para o cliente
      </h2>

      {apagadas > 0 && (
        <p className="mt-3 max-w-xl border-l-2 border-rec pl-4 text-sm leading-relaxed text-tinta-2">
          Atenção: as {apagadas} fotos não escolhidas foram apagadas do servidor
          na finalização e não voltam. O cliente vai reabrir vendo só as que ele
          escolheu. Pra oferecer o ensaio inteiro de novo, suba as fotos outra vez.
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div className="flex w-28 flex-col gap-2">
          <Label htmlFor="prazo_dias">Prazo (dias)</Label>
          <Input
            id="prazo_dias"
            type="number"
            min={1}
            max={365}
            value={dias}
            onChange={(evento) => setDias(evento.target.value)}
          />
        </div>

        <Button
          type="button"
          variant="outline"
          disabled={pendente}
          onClick={() =>
            iniciar(async () => {
              const r = await reabrirSessao({
                sessao_id: sessaoId,
                prazo_dias: dias,
              });
              setErro(r.ok ? null : (r.erro ?? "Não foi possível reabrir."));
            })
          }
        >
          {pendente ? "Reabrindo…" : "Reabrir"}
        </Button>

        {erro && <p className="font-body text-xs text-rec-papel">{erro}</p>}
      </div>
    </section>
  );
}
