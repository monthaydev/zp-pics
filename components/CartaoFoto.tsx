"use client";

import { Heart } from "lucide-react";
import { memo } from "react";

import type { FotoDaGaleria } from "@/lib/galeria";
import { preCarregarPrevia } from "@/lib/previa";
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
 * Três voltas de lápis dermatográfico, desenhadas à mão no mesmo viewBox.
 *
 * Na folha de contato de papel o fotógrafo circula o quadro escolhido em
 * vermelho, e nenhuma volta sai igual à outra. Aqui a volta é fixa por foto
 * (a posição no ensaio sorteia qual das três), não muda a cada render e não
 * anima sozinha — só "é desenhada" quando o cliente marca. `preserveAspectRatio
 * none` estica o traço para a proporção da foto, e `non-scaling-stroke` mantém a
 * espessura igual em retrato e paisagem.
 */
const VOLTAS = [
  "M5 7 C30 2 68 4 95 5 C98 30 96 68 94 95 C68 98 32 96 5 94 C2 68 3 32 6 4 C11 2 15 5 22 3",
  "M7 4 C36 6 66 2 96 7 C94 36 98 66 95 96 C64 94 33 98 4 94 C6 66 2 34 5 9 C9 5 16 7 21 4",
  "M4 5 C34 3 70 6 94 3 C97 33 95 70 97 95 C66 97 30 94 3 97 C5 68 3 30 4 7 C8 3 14 4 19 6",
];

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
  const aquecer = () => preCarregarPrevia(foto.key_preview);

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
          onPointerEnter={aquecer}
          onPointerDown={aquecer}
          // Roving tabindex: só um cartão fica no caminho do Tab. Sem isto são
          // 800 paradas de tabulação num ensaio de 400 fotos, e quem usa
          // teclado desiste antes da vigésima.
          tabIndex={ativo ? 0 : -1}
          data-cartao={indice}
          className={cn(
            "block size-full cursor-zoom-in overflow-hidden bg-superficie transition-shadow duration-200",
            // A moldura reta ficou só como um filete: quem marca a escolha é a
            // volta de lápis (o `svg` abaixo), e o filete garante que a foto
            // clara não "perca" a borda onde o traço passa fino. Continua
            // `box-shadow` e não `border` — borda muda o tamanho da caixa, e
            // com 400 delas marcar uma foto empurraria a fileira inteira.
            escolhida
              ? "shadow-[inset_0_0_0_1px_var(--color-rec)]"
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

        {/* A volta de lápis. `aria-hidden` e sem pointer-events: o estado da
            escolha já está no coração, no filete e no `aria-pressed`, e isto é
            só a marca visível. O traço aparece por `stroke-dashoffset` — uma
            transição disparada pelo clique, não uma animação em laço — e por
            ser transição não roda no primeiro render: reabrir uma galeria com
            30 escolhidas não desenha 30 voltas na cara de quem chegou. */}
        <svg
          aria-hidden
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-0 size-full overflow-visible"
        >
          <path
            d={VOLTAS[posicao % VOLTAS.length]}
            pathLength={1}
            fill="none"
            stroke="var(--color-rec)"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            style={{
              strokeDasharray: 1,
              strokeDashoffset: escolhida ? 0 : 1,
              transition: "stroke-dashoffset 320ms cubic-bezier(0.4, 0, 0.2, 1)",
            }}
          />
        </svg>

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
