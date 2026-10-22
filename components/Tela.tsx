import { ViewTransition, type ReactNode } from "react";

/**
 * Envelope de troca de tela.
 *
 * As páginas do cliente são uma sequência — senha, grade, resumo. Sem isto,
 * cada passo apaga a tela inteira e acende a próxima, e o cliente não tem sinal
 * nenhum de que continua andando dentro do próprio ensaio.
 *
 * `default="none"` não é detalhe: sem ele, todo `ViewTransition` da página
 * anima em qualquer transição que aconteça, inclusive nas que não têm nada a
 * ver com troca de tela.
 *
 * Vai em cada `page.tsx`, nunca no layout — layout persiste entre navegações,
 * então `enter` e `exit` nunca disparariam lá.
 *
 * Onde o navegador não suporta, não acontece nada e a navegação é a de sempre.
 */
export default function Tela({ children }: { children: ReactNode }) {
  return (
    <ViewTransition enter="tela-entra" exit="tela-sai" default="none">
      {children}
    </ViewTransition>
  );
}
