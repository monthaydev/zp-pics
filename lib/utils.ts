import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Data curta em pt-BR.
 *
 * O fuso vai fixado em São Paulo de propósito: sem isso o servidor (UTC na
 * Vercel) e o navegador do João renderizam dias diferentes na virada da noite,
 * e o React acusa erro de hidratação — além de mostrar prazo errado.
 */
const formatadorData = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "America/Sao_Paulo",
});

export function formatarData(iso: string) {
  return formatadorData.format(new Date(iso));
}

/** Dias inteiros até o prazo. Negativo quando já passou. */
export function diasAte(iso: string) {
  const umDia = 86_400_000;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / umDia);
}

/**
 * O tamanho do cartaz do título do ensaio, sensível ao comprimento do nome.
 *
 * `--texto-cartaz` sozinho (`clamp(2.75rem, 11vw, 8rem)`) parte do princípio de
 * um título curto — "Julia & Pedro". Um título comprido de verdade ("Ensaio de
 * Gestante da Mariana e do Rodrigo") em Anton a 8rem numa coluna de leitura
 * vira quatro ou cinco linhas e empurra o campo de senha pra fora da tela.
 * Cada degrau abaixo é um teto mais baixo pro mesmo `clamp` — o título continua
 * respondendo à largura da tela, só que a partir de um limite menor.
 */
export function escalaCartaz(titulo: string) {
  const tamanho = titulo.length;
  if (tamanho <= 16) return "clamp(2.75rem, 11vw, 8rem)";
  if (tamanho <= 28) return "clamp(2.25rem, 8vw, 5.5rem)";
  if (tamanho <= 44) return "clamp(1.85rem, 6vw, 4rem)";
  return "clamp(1.5rem, 4.5vw, 3rem)";
}

/** "12,4 MB" — tamanho de arquivo para quem lê, em português. */
export function formatarTamanho(bytes: number) {
  const un = (n: number, casas: number) => n.toFixed(casas).replace(".", ",");
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${un(bytes / 1024, 0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${un(bytes / 1024 / 1024, 1)} MB`;
  return `${un(bytes / 1024 / 1024 / 1024, 2)} GB`;
}
