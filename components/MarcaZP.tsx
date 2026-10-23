import { cn } from "@/lib/utils";

/**
 * O selo do ZP Studio (o mesmo do site).
 *
 * É o disco preto com o ZP em branco, e não a versão só-letras: aquela é
 * off-white sem fundo e some no tema claro. O disco se sustenta nos dois temas.
 * O ponto azul é da marca e vem dentro da imagem — não é cor de UI, então não
 * entra nos tokens.
 *
 * `<img>` direto: o arquivo é pequeno e o otimizador da Vercel cobraria por uma
 * transformação que não muda nada.
 */
export default function MarcaZP({
  tamanho = 40,
  className,
}: {
  tamanho?: number;
  className?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- ver acima
    <img
      src="/zp-logo.png"
      alt="ZP Studio"
      width={tamanho}
      height={tamanho}
      draggable={false}
      className={cn("shrink-0 rounded-full", className)}
    />
  );
}
