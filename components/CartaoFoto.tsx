"use client";

import { Heart } from "lucide-react";
import { memo } from "react";

import type { FotoDaGaleria } from "@/lib/galeria";
import { cn } from "@/lib/utils";

type Props = {
  foto: FotoDaGaleria;
  /** 1-based, é o número de quadro: entra no `alt` e na legenda. Vem do
   * índice da foto no ensaio inteiro — não muda quando o filtro "Escolhidas"
   * esconde as demais, senão o quadro 042 viraria outro número. */
  posicao: number;
  total: number;
  /** Posição desta célula entre as que estão visíveis agora — é o que rege o
   * roving tabindex e as setas do teclado, que andam pelo que se vê, não pelo
   * ensaio inteiro. */
  indice: number;
  escolhida: boolean;
  /** Sessão finalizada ou com prazo vencido: dá pra ver, não dá pra escolher. */
  travada: boolean;
  /** É este o cartão que recebe o Tab. Ver o roving tabindex em GaleriaClient. */
  ativo: boolean;
  /** `comFaixa` é o Shift pressionado: marca o intervalo desde a última foto
   * alternada, em vez de só esta. */
  aoAlternar: (fotoId: string, comFaixa: boolean) => void;
  aoAbrir: () => void;
  aoFocar: () => void;
};

/**
 * Uma foto na grade.
 *
 * `memo` não é enfeite: sem ele, marcar uma foto re-renderiza as 400 e o clique
 * engasga no meio do ensaio.
 */
function CartaoFoto({
  foto,
  posicao,
  total,
  indice,
  escolhida,
  travada,
  ativo,
  aoAlternar,
  aoAbrir,
  aoFocar,
}: Props) {
  const legenda = `${foto.nome_original}, foto ${posicao} de ${total}`;
  // Número de quadro: é o `nome_original` que a folha de contato precisa
  // expor. Antes só existia dentro do `alt`, invisível pra quem enxerga — e é
  // o identificador que o cliente lê em voz alta pro fotógrafo no WhatsApp.
  const quadro = String(posicao).padStart(3, "0");

  return (
    <li
      // `foto-entra` fica na célula inteira (foto + legenda entram juntas). A
      // proporção da foto vem do banco e reserva o espaço da imagem sozinha —
      // a legenda embaixo soma uma altura fixa por cima, então a fileira não
      // pula quando as imagens chegam.
      className="foto-entra group flex flex-col [content-visibility:auto]"
    >
      <div
        style={{ aspectRatio: `${foto.largura} / ${foto.altura}` }}
        className="halation relative"
      >
        <button
          type="button"
          onClick={aoAbrir}
          onFocus={aoFocar}
          // Roving tabindex: só um cartão fica no caminho do Tab. Sem isto são
          // 800 paradas de tabulação num ensaio de 400 fotos, e quem usa
          // teclado desiste antes da vigésima.
          tabIndex={ativo ? 0 : -1}
          data-cartao={indice}
          className={cn(
            "block size-full cursor-zoom-in overflow-hidden bg-superficie transition-shadow duration-200",
            // A moldura de escolhida cresce da borda pra dentro em vez de
            // aparecer pronta. É `box-shadow` e não `border` porque borda muda
            // o tamanho da caixa: com 400 delas, marcar uma foto empurraria a
            // fileira inteira. Sombra interna ocupa zero espaço de layout.
            escolhida
              ? "shadow-[inset_0_0_0_2px_var(--color-rec)]"
              : "shadow-[inset_0_0_0_0_var(--color-rec)]",
          )}
          // O estado entra no rótulo porque o espaço escolhe a partir daqui:
          // sem ele o leitor de tela anuncia só "abrir" e a escolha vira
          // silêncio.
          aria-label={
            travada
              ? `Abrir ${legenda}${escolhida ? " (escolhida)" : ""}`
              : `Abrir ${legenda}${escolhida ? " (escolhida)" : ""}. Espaço escolhe.`
          }
          aria-keyshortcuts={travada ? undefined : "Space"}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- direto da
              nossa rota, sem o otimizador da Vercel: a miniatura já sai do
              navegador do admin no tamanho e no formato certos, e o
              otimizador cobraria por uma transformação que não muda nada. */}
          <img
            src={`/api/img/${foto.key_thumb}`}
            alt={legenda}
            width={foto.largura}
            height={foto.altura}
            loading="lazy"
            decoding="async"
            draggable={false}
            className="size-full object-cover"
          />
        </button>

        {/* Número de quadro em selo sobre a foto, como no protótipo escolhido
            (galeria v2, 22/10/2026). Na grade densa de 8 colunas, número e
            nome juntos na legenda não cabiam — um dos dois virava "…". Está
            sobre a foto, não sobre o tema, por isso branco sobre preto fixo,
            igual ao coração. `aria-hidden`: o número já está no `alt`.

            Sempre branco, nunca `rec`: medido pelo revisor visual, o laranja
            sobre este selo semitransparente cai para ~2:1 numa foto clara. O
            estado de escolhida já está no coração, na moldura e na legenda. */}
        <span
          aria-hidden
          className="pointer-events-none absolute left-1 top-1 bg-black/65 px-1 font-hud text-quadronum tabular-nums text-white"
        >
          {quadro}
        </span>

        {!travada && (
          <button
            type="button"
            onClick={(evento) => aoAlternar(foto.id, evento.shiftKey)}
            onFocus={aoFocar}
            tabIndex={ativo ? 0 : -1}
            // Escolhida nunca é só cor: coração preenchido + moldura + aria-pressed
            aria-pressed={escolhida}
            aria-label={`Escolher ${legenda}`}
            // Shift+clique marca o intervalo desde a última foto alternada —
            // é assim que qualquer pessoa que já escolheu foto espera que
            // funcione, e ninguém marca 400 fotos uma de cada vez.
            title="Shift+clique marca um intervalo"
            // Alvo de 44px pro dedo. O gradiente por baixo é o que segura o
            // contraste do ícone quando a foto é clara naquele canto.
            className="absolute bottom-0 right-0 flex size-11 items-center justify-center bg-gradient-to-tl from-black/55 to-transparent transition-opacity hover:opacity-80"
          >
            <Heart
              className={cn(
                // A curva ultrapassa 1 e volta: o coração dá um pulo ao ser
                // marcado, e é isso que devolve confirmação física a um gesto
                // que o cliente repete 400 vezes. É `transition` e não
                // `animation` de propósito — transição não dispara no
                // primeiro render, então reabrir uma galeria com 30 fotos já
                // escolhidas não faz 30 corações pularem na cara de quem
                // chegou.
                "size-5 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] transition-[transform,color,fill] duration-[260ms] ease-[cubic-bezier(0.34,1.56,0.64,1)]",
                // `rec` pleno, e não `rec-papel`: este ícone fica sobre a
                // FOTO, não sobre o fundo do tema — quem garante o contraste
                // dele é o gradiente por baixo, não a paleta.
                escolhida ? "scale-110 fill-rec text-rec" : "scale-100 text-white",
              )}
            />
          </button>
        )}
      </div>

      {/* A legenda expõe o `nome_original` fora do `alt` — é o identificador
          que o cliente lê em voz alta pro fotógrafo no WhatsApp — e regulariza
          a fileira: cada célula termina numa faixa de altura fixa, então o
          desencontro entre fileiras (proporções diferentes de foto) lê como
          deliberado, não como bug de layout. O número do quadro mora no selo
          sobre a foto.

          Sem `group-hover:scale` na foto (removido: um quadro numa folha de
          contato não cresce), a resposta ao hover é esta linha escurecendo
          pra `tinta` — funciona nos dois temas, ao contrário do halation, que
          só existe no escuro. */}
      <p
        className={cn(
          "mt-1.5 truncate font-hud text-quadronum transition-colors duration-200 group-hover:text-tinta",
          escolhida ? "text-tinta" : "text-tinta-3",
        )}
      >
        {foto.nome_original}
      </p>
    </li>
  );
}

export default memo(CartaoFoto);
