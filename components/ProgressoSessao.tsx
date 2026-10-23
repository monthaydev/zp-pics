import type { StatusSessao } from "@/lib/schemas";
import { cn } from "@/lib/utils";

/**
 * Onde esta sessão está no processo — e o que fazer agora.
 *
 * O ciclo de vida do ensaio é uma sequência de verdade (subir → abrir → o
 * cliente escolhe → exportar a lista), então numerar e ordenar aqui é
 * informação, não enfeite. Nenhum campo novo no banco: as quatro etapas saem de
 * `status`, `total_fotos` e `total_escolhidas`, que a view `sessoes_resumo` já
 * devolve.
 *
 * A gramática visual é a mesma da `EtiquetaStatus`, de propósito: tracejado é
 * o que não aconteceu, contorno sólido é o agora, preenchido é o que ficou
 * pronto. Sem cor nova e sem `rec` — que no projeto só marca foto escolhida e
 * foco de teclado.
 */

/**
 * Qual ferramenta ocupa a bancada — o roteador de layout da tela de sessão
 * (Plano — A Bancada). O cálculo é o mesmo que já existia aqui; só passou a
 * ser exportado, porque agora duas coisas escutam: a trilha visual embaixo, e
 * a página inteira decidindo o que mostrar.
 */
export type EtapaBancada =
  | "subir"
  | "abrir"
  | "escolhendo"
  | "expirada"
  | "finalizada"
  | "entregue"
  | "arquivada";

export function etapaBancada({
  status,
  totalFotos,
}: {
  status: StatusSessao;
  totalFotos: number;
}): EtapaBancada {
  if (status === "rascunho") return totalFotos > 0 ? "abrir" : "subir";
  if (status === "expirada") return "expirada";
  if (status === "finalizada") return "finalizada";
  if (status === "entregue") return "entregue";
  if (status === "arquivada") return "arquivada";
  return "escolhendo";
}

type Estado = "feita" | "atual" | "futura";

type Etapa = {
  rotulo: string;
  estado: Estado;
  /** Só a etapa atual carrega instrução — as outras não têm o que instruir. */
  acao?: string;
};

const TRILHA: Record<Estado, string> = {
  feita: "bg-tinta",
  atual: "bg-tinta",
  futura: "bg-superficie-2",
};

const NUMERO: Record<Estado, string> = {
  feita: "text-tinta",
  atual: "text-tinta",
  futura: "text-tinta-3",
};

const ROTULO: Record<Estado, string> = {
  feita: "text-tinta-2",
  atual: "text-tinta",
  futura: "text-tinta-3",
};

export default function ProgressoSessao({
  status,
  totalFotos,
  totalEscolhidas,
  fotosIncluidas,
}: {
  status: StatusSessao;
  totalFotos: number;
  totalEscolhidas: number;
  fotosIncluidas: number;
}) {
  const etapas = montarEtapas({
    status,
    totalFotos,
    totalEscolhidas,
    fotosIncluidas,
  });

  // A instrução de cada etapa mora agora dentro da bancada — é a própria
  // ferramenta que a página mostra, não mais um parágrafo solto embaixo da
  // trilha. A trilha vira só isso: a trilha.
  return (
    <section className="mt-6">
      <h2 className="sr-only">Andamento da sessão</h2>

      <ol className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-5">
        {etapas.map((etapa, indice) => (
          // A última ocupa a linha inteira no celular: 5 itens em 2 colunas deixavam
          // "Entregar" sozinha numa terceira linha, meio solta.
          <li key={etapa.rotulo} className="flex flex-col gap-2 max-sm:last:col-span-2">
            {/* Trilha legível, não mais quatro tracinhos de 2px: a etapa atual
                é preenchimento sólido, do mesmo peso da feita — é o texto
                embaixo que diferencia "já passou" de "é agora". */}
            <span aria-hidden className={cn("h-1 w-full", TRILHA[etapa.estado])} />
            <span className="flex items-baseline gap-2">
              <span className={cn("font-hud text-quadronum", NUMERO[etapa.estado])}>
                {String(indice + 1).padStart(2, "0")}
              </span>
              <span
                className={cn(
                  "font-body text-quadronum font-medium",
                  ROTULO[etapa.estado],
                )}
              >
                {etapa.rotulo}
              </span>
            </span>
            {/* O estado não fica só no traço e no tom do texto: quem usa leitor
                de tela precisa ouvir em qual etapa a sessão está. */}
            <span className="sr-only">
              {etapa.estado === "feita"
                ? "concluída"
                : etapa.estado === "atual"
                  ? "etapa atual"
                  : "ainda não"}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function montarEtapas({
  status,
  totalFotos,
  totalEscolhidas,
  fotosIncluidas,
}: {
  status: StatusSessao;
  totalFotos: number;
  totalEscolhidas: number;
  fotosIncluidas: number;
}): Etapa[] {
  const temFotos = totalFotos > 0;
  const rascunho = status === "rascunho";
  const finalizada = status === "finalizada";
  const expirada = status === "expirada";
  // Entregue e arquivada são o fim do caminho: a seleção acabou e a ZP já
  // resolveu o que fazer com ela. Todas as etapas ficam "feitas".
  const encerrada = status === "entregue" || status === "arquivada";

  return [
    {
      rotulo: "Subir fotos",
      estado: temFotos ? "feita" : "atual",
      acao: temFotos
        ? undefined
        : "Arraste a pasta do ensaio na área lá embaixo. O arquivo original não sai da sua máquina — sobem só a miniatura e a prévia com marca d'água.",
    },
    {
      rotulo: "Abrir p/ o cliente",
      estado: rascunho ? (temFotos ? "atual" : "futura") : "feita",
      acao:
        rascunho && temFotos
          ? `As ${totalFotos} fotos estão no ar. Abra a sessão para o cliente conseguir entrar com o link e a senha — antes disso o link não mostra nada.`
          : undefined,
    },
    {
      rotulo: "Cliente escolhe",
      estado: finalizada || encerrada ? "feita" : rascunho ? "futura" : "atual",
      acao: expirada
        ? `O prazo venceu com ${totalEscolhidas} de ${fotosIncluidas} escolhidas. O cliente continua vendo as fotos, mas não escolhe mais. Reabra abaixo com um prazo novo se ele pedir.`
        : status === "aberta"
          ? totalEscolhidas > 0
            ? `O cliente já escolheu ${totalEscolhidas} de ${fotosIncluidas}. A lista abaixo atualiza sozinha, e você recebe um e-mail quando ele finalizar.`
            : "Mande o link e a senha pelo WhatsApp. O cliente escolhe sozinho, e você recebe um e-mail quando ele finalizar."
          : undefined,
    },
    {
      rotulo: "Exportar lista",
      estado: encerrada ? "feita" : finalizada ? "atual" : "futura",
      acao: finalizada
        ? "Copie a lista de nomes abaixo e cole no filtro do Lightroom. São os nomes dos arquivos originais que estão no seu HD."
        : undefined,
    },
    {
      // Depois de tratar no Lightroom: mandar as tratadas, ou arquivar quando a
      // entrega é por outro caminho. Fica "futura" enquanto a ZP ainda está em
      // "Exportar lista", e "feita" quando decide (entregue ou arquivada). A
      // decisão em si mora na bancada da etapa finalizada, não aqui.
      rotulo: "Entregar",
      estado: encerrada ? "feita" : "futura",
    },
  ];
}
