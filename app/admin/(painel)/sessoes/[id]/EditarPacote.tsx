"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { atualizarPacote } from "./acoes";

/**
 * Mudar quantas fotos o cliente pode escolher, depois de a sessão criada.
 *
 * Nasceu de o cliente fechar um pacote maior (ou menor) depois do link já
 * enviado — antes só dava pra refazer a sessão e subir tudo de novo.
 */
export default function EditarPacote({
  sessaoId,
  fotosIncluidas,
}: {
  sessaoId: string;
  fotosIncluidas: number;
}) {
  const [valor, setValor] = useState(String(fotosIncluidas));
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pendente, comecar] = useTransition();

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(evento) => {
        evento.preventDefault();
        setAviso(null);
        comecar(async () => {
          const r = await atualizarPacote({ sessao_id: sessaoId, fotos_incluidas: valor });
          setAviso(r.ok ? { ok: true, texto: "Pacote salvo." } : { ok: false, texto: r.erro ?? "Não deu pra salvar." });
        });
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="pacote-fotos">Fotos incluídas</Label>
        <Input
          id="pacote-fotos"
          type="number"
          inputMode="numeric"
          min={1}
          max={10000}
          value={valor}
          onChange={(e) => setValor(e.target.value)}
        />
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" variant="outline" disabled={pendente}>
          {pendente ? "Salvando…" : "Salvar pacote"}
        </Button>
        {aviso && (
          <p role="status" className={`font-hud text-xs ${aviso.ok ? "text-tinta-2" : "text-rec-papel"}`}>
            {aviso.texto}
          </p>
        )}
      </div>
    </form>
  );
}
