"use client";

import { useActionState } from "react";

import { Label } from "@/components/ui/label";

import { entrar, type EstadoLogin } from "./acoes";

const INICIAL: EstadoLogin = { erro: null };

/**
 * A porta de serviço do painel.
 *
 * Herda o campo-régua do fluxo do cliente (a home e a tela de senha da
 * galeria, da rodada F10): mesmo gesto, régua embaixo em vez de caixa. É a
 * única tela do painel que não é bancada — se vê por três segundos, não
 * precisa de mais que isso.
 */
export default function LoginClient({ de }: { de: string }) {
  const [estado, acao, pendente] = useActionState(entrar, INICIAL);

  return (
    <form action={acao} className="flex w-full max-w-sm flex-col gap-bloco">
      <input type="hidden" name="de" value={de} />

      <div className="flex flex-col gap-2">
        <Label htmlFor="email">E-mail</Label>
        <div className="border-b border-linha-forte py-2 transition-colors focus-within:border-tinta">
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            required
            autoFocus
            aria-invalid={estado.erro ? true : undefined}
            className="w-full bg-transparent font-hud text-lg text-tinta outline-none"
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="senha">Senha</Label>
        <div className="border-b border-linha-forte py-2 transition-colors focus-within:border-tinta">
          <input
            id="senha"
            name="senha"
            type="password"
            autoComplete="current-password"
            required
            aria-invalid={estado.erro ? true : undefined}
            className="w-full bg-transparent font-hud text-lg tracking-[0.2em] text-tinta outline-none"
          />
        </div>
      </div>

      {/* aria-live porque o erro chega depois do envio, sem recarregar a tela */}
      <p aria-live="polite" className="min-h-5 font-hud text-xs text-rec-papel">
        {estado.erro}
      </p>

      <button
        type="submit"
        disabled={pendente}
        className="h-12 w-full bg-tinta font-body text-sm font-medium uppercase tracking-cine text-fundo transition-[opacity,transform] duration-150 hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
      >
        {pendente ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
