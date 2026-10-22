"use client";

import { useActionState } from "react";

import { verificarSenha, type EstadoSenha } from "./acoes";

const INICIAL: EstadoSenha = { erro: null, tentativa: 0 };

/**
 * Porta de entrada do cliente do ensaio.
 *
 * Escrito à mão, sem shadcn: o shadcn é ferramenta do painel da ZP. O que o
 * cliente vê é preto, off-white e mais nada.
 */
export default function SenhaClient({ slug }: { slug: string }) {
  const [estado, acao, pendente] = useActionState(verificarSenha, INICIAL);

  return (
    <form action={acao} className="flex w-full flex-col gap-5">
      <input type="hidden" name="slug" value={slug} />

      <div className="flex flex-col gap-2">
        <label
          htmlFor="senha"
          className="font-hud text-hud uppercase tracking-cine text-tinta-3"
        >
          Senha do ensaio
        </label>
        {/* Régua embaixo, não caixa — o mesmo gesto do campo da home. */}
        <input
          id="senha"
          name="senha"
          type="password"
          required
          autoFocus
          autoComplete="current-password"
          aria-invalid={estado.erro ? true : undefined}
          aria-describedby="erro-senha dica-senha"
          className="min-w-0 border-b border-linha-forte bg-transparent py-2 font-hud text-xl tracking-[0.2em] text-tinta outline-none transition-colors focus:border-tinta"
        />
      </div>

      {/* Botão largo, abaixo do campo: no celular é o alvo do polegar, e o
          texto diz o que acontece em vez de "entrar" em lugar nenhum. */}
      <button
        type="submit"
        disabled={pendente}
        className="h-12 w-full bg-tinta font-body text-sm font-medium uppercase tracking-cine text-fundo transition-[opacity,transform] duration-150 hover:opacity-90 active:scale-[0.99] disabled:opacity-50"
      >
        {pendente ? "Conferindo…" : "Ver minhas fotos"}
      </button>

      {/* aria-live porque a resposta chega sem recarregar a tela.
          A `key` é o número da tentativa, e não o texto do erro: errar duas
          vezes seguidas devolve a mesma string, o React reusaria o nó e a
          segunda tentativa pareceria não ter respondido. */}
      <p
        id="erro-senha"
        aria-live="polite"
        className="-mt-2 min-h-5 font-hud text-hud text-rec-papel empty:min-h-0"
      >
        {estado.erro && (
          <span key={estado.tentativa} className="aviso-entra inline-block">
            {estado.erro}
          </span>
        )}
      </p>

      <p id="dica-senha" className="text-apoio text-tinta-3">
        A senha veio junto com o link, no WhatsApp.
      </p>
    </form>
  );
}
