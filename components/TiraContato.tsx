import { cn } from "@/lib/utils";

/**
 * A tira de negativo de uma sessão, na lista do painel.
 *
 * É a assinatura do redesenho do painel (Plano — A Bancada): a mesma gramática
 * de calha da folha de contato do cliente, aqui a serviço de reconhecimento —
 * bater o olho e achar "o ensaio da Julia" em vez de ler sete títulos. Sai
 * quase de graça porque `api/img` já libera o admin autenticado.
 *
 * `chaves` vem de `primeirasFotosPorSessao` — até 4 `key_thumb`, já filtradas
 * pra excluir o que foi apagado do bucket na finalização.
 */
const ALTURA = {
  pequena: "h-12 w-[168px]",
  grande: "h-24 w-full max-w-md",
} as const;

export default function TiraContato({
  chaves,
  total,
  tamanho = "pequena",
}: {
  chaves: string[];
  total: number;
  /** `grande` é a bancada (etapas "abrir" e "finalizada"); `pequena` é a
   * linha da lista e a faixa "Precisa de você". */
  tamanho?: keyof typeof ALTURA;
}) {
  const alvo = tamanho === "grande" ? 6 : 4;

  // Sem foto nenhuma (rascunho recém-criado): quadros vazios, não um buraco
  // no layout — a linha da lista continua com a mesma altura.
  if (chaves.length === 0) {
    return (
      <div aria-hidden className={cn("flex shrink-0 gap-0.5", ALTURA[tamanho])}>
        {Array.from({ length: alvo }, (_, i) => (
          <div key={i} className="h-full flex-1 border border-dashed border-linha-forte" />
        ))}
      </div>
    );
  }

  return (
    <div
      className={cn("flex shrink-0 gap-0.5 overflow-hidden", ALTURA[tamanho])}
      aria-label={`${total} fotos neste ensaio`}
    >
      {chaves.slice(0, alvo).map((chave) => (
        // direto da nossa rota, igual à galeria do cliente: a miniatura já
        // sai do navegador do admin no tamanho e no formato certos.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={chave}
          src={`/api/img/${chave}`}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          className="h-full flex-1 min-w-0 bg-superficie-2 object-cover"
        />
      ))}
      {/* Menos que o alvo: completa com quadros vazios, pra tira nunca
          encolher e desalinhar o que vem depois dela. */}
      {chaves.length < alvo &&
        Array.from({ length: alvo - chaves.length }, (_, i) => (
          <div
            key={`vazio-${i}`}
            className="h-full flex-1 border border-dashed border-linha-forte"
          />
        ))}
    </div>
  );
}
