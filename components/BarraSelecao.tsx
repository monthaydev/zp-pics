"use client";

import { useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

type Props = {
  escolhidas: number;
  incluidas: number;
  /** Mensagem de erro quando o salvamento falhou. */
  aviso: string | null;
  acao?: ReactNode;
  /** A fita das escolhidas (`BandejaEscolhidas`), embaixo do contador. */
  bandeja?: ReactNode;
};

/**
 * Barra fixa do rodapé — o contador que o cliente olha o tempo todo.
 *
 * Passar do pacote não bloqueia nada: avisa, conta como extra e deixa seguir.
 * Barrar o cliente no meio da escolha é perder a venda do extra.
 */
export default function BarraSelecao({ escolhidas, incluidas, aviso, acao, bandeja }: Props) {
  /**
   * A bandeja no celular nasce recolhida. Ali ela ocuparia perto de um quarto
   * da tela — a mesma tela onde o cliente está julgando foto. No computador
   * sobra altura, e ela fica sempre aberta. Quem decide o tamanho é o CSS
   * (`sm:block`), não um teste de largura em JS: o servidor não sabe o
   * tamanho da tela, e decidir em JS faria a bandeja piscar na hidratação.
   */
  const [bandejaAberta, setBandejaAberta] = useState(false);
  const extras = Math.max(escolhidas - incluidas, 0);
  const proporcao = incluidas > 0 ? Math.min(escolhidas / incluidas, 1) : 0;

  /**
   * De onde o número veio, para saber por onde ele deve entrar.
   *
   * Mostrar só o valor novo diz *quanto*, não diz *o que aconteceu*. Subindo
   * pela base e descendo pelo topo, o olho lê a direção sem ter que comparar
   * com o número que já não está mais lá. No primeiro render não existe
   * anterior, e aí não há animação nenhuma.
   */
  const [anterior, setAnterior] = useState(escolhidas);
  const [direcao, setDirecao] = useState<string>();

  // Ajuste de estado durante o render — o padrão que o React documenta para
  // "reagir a uma prop que mudou". Não é efeito: um `useEffect` pintaria o
  // número na posição final antes de animar, e o primeiro frame sairia errado.
  if (anterior !== escolhidas) {
    setDirecao(escolhidas > anterior ? "numero-sobe" : "numero-desce");
    setAnterior(escolhidas);
  }

  // Fundo sólido, sem `backdrop-filter`: vidro é proibido no projeto e aqui
  // atrapalharia de verdade — a barra fica em cima de fotos o tempo todo.
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-linha bg-superficie">
      {/* Progresso do pacote, na espessura de um fio.
          Usa a mesma gramática de preenchimento do `EtiquetaStatus` (vazio →
          cheio) em vez de inventar cor nova: quem encheu o pacote vê a linha
          inteira, e a partir dali o que conta é o contador de extras. */}
      <div aria-hidden className="h-px w-full bg-linha">
        <div
          className={cn(
            "h-full transition-[width] duration-300 ease-out",
            extras > 0 ? "bg-rec" : "bg-tinta-2",
          )}
          style={{ width: `${proporcao * 100}%` }}
        />
      </div>

      <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
        {/* aria-live: o contador muda sem recarregar a tela, e quem usa leitor
            de tela precisa ouvir que a escolha entrou.

            É o maior elemento tipográfico do app de propósito: é o único
            número que o cliente olha nos 40 minutos inteiros, e é o contador
            mecânico de uma câmera de filme — que é exatamente o que ele
            conta. */}
        <p aria-live="polite" className="flex items-baseline gap-2 font-display leading-none text-tinta">
          {/* O recorte é o que faz o número entrar deslizando em vez de
              piscar. `key` força a troca do nó a cada valor — sem ela a
              animação rodaria uma vez só na vida do componente.
              `h-[1em]` acompanha o `clamp()` de `text-quadro`: em vez de uma
              altura fixa que só bate num ponto do clamp, ela é relativa ao
              tamanho de fonte herdado em qualquer largura de tela. */}
          <span className="inline-flex h-[1em] items-center overflow-hidden text-quadro">
            <span key={escolhidas} className={cn("tabular-nums", direcao)}>
              {escolhidas}
            </span>
          </span>
          <span className="font-hud text-hud text-tinta-3">/{incluidas}</span>
          {extras > 0 && (
            <span className="aviso-entra font-hud text-hud text-rec-papel">
              +{extras} {extras === 1 ? "extra" : "extras"}
            </span>
          )}
        </p>

        {aviso && (
          <p role="alert" className="aviso-entra font-hud text-hud text-rec-papel">
            {aviso}
          </p>
        )}

        {(acao || bandeja) && (
          <div className="ml-auto flex items-center gap-3">
            {bandeja && (
              <button
                type="button"
                onClick={() => setBandejaAberta((aberta) => !aberta)}
                aria-expanded={bandejaAberta}
                aria-controls="bandeja-escolhidas"
                className="h-12 border border-linha-forte px-3 font-hud text-hud uppercase tracking-cine text-tinta-2 transition-colors hover:text-tinta sm:hidden"
              >
                {bandejaAberta ? "Esconder" : "Ver escolhidas"}
              </button>
            )}
            {acao}
          </div>
        )}
      </div>

      {bandeja && (
        <div
          id="bandeja-escolhidas"
          className={cn(
            "mx-auto w-full max-w-7xl px-4 sm:block sm:px-6",
            bandejaAberta ? "block" : "hidden",
          )}
        >
          {bandeja}
        </div>
      )}
    </div>
  );
}
