"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

/**
 * Busca do ensaio pela chave.
 *
 * Nada é conferido aqui: a chave só leva o cliente para `/s/[chave]/senha`, e
 * quem decide se aquilo existe é o servidor, com 404 seco. Se esta tela
 * respondesse "essa chave não existe", ela viraria um oráculo pra descobrir
 * ensaios chutando chave.
 *
 * Aceita a chave sozinha ou o link inteiro colado do WhatsApp — o cliente vai
 * colar o link, não vai catar o pedaço do meio.
 */
function extrairChave(entrada: string) {
  const limpo = entrada.trim();
  // `/s/xxxx`, com ou sem domínio, com ou sem `/senha` no fim.
  const doLink = limpo.match(/\/s\/([a-z0-9_-]+)/i);
  if (doLink) return doLink[1].toLowerCase();
  return limpo.toLowerCase();
}

export default function EntrarClient() {
  const router = useRouter();
  const [chave, setChave] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [indo, setIndo] = useState(false);

  function enviar(evento: FormEvent) {
    evento.preventDefault();

    const limpa = extrairChave(chave);
    // Só o formato. O `esquemaSenha` já trata a chave como 8 a 40 caracteres.
    if (limpa.length < 8 || !/^[a-z0-9_-]+$/.test(limpa)) {
      setErro("Confira a chave que o ZP Studio mandou.");
      return;
    }

    setErro(null);
    setIndo(true);
    router.push(`/s/${limpa}/senha`);
  }

  return (
    <form onSubmit={enviar} className="flex w-full max-w-xl flex-col gap-bloco">
      <div className="flex flex-col gap-2">
        <label
          htmlFor="chave"
          className="font-body text-hud font-medium text-tinta-3"
        >
          Chave do ensaio
        </label>
        {/* O campo deixou de ser uma caixa e virou uma linha: régua embaixo,
            mono grande, o botão como texto com seta ao lado. Menos moldura,
            mais gesto — o mesmo campo que a caixa desenhava, com o peso
            visual do resto do título ao lado dele. */}
        <div className="flex items-end gap-4 border-b border-linha-forte py-2 transition-colors focus-within:border-tinta">
          <input
            id="chave"
            name="chave"
            value={chave}
            onChange={(evento) => setChave(evento.target.value)}
            required
            autoFocus
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            placeholder="cole aqui a chave ou o link"
            aria-invalid={erro ? true : undefined}
            aria-describedby="erro-chave"
            className="min-w-0 flex-1 bg-transparent font-hud text-lg text-tinta outline-none placeholder:text-tinta-3 sm:text-xl"
          />
          <button
            type="submit"
            disabled={indo}
            className="shrink-0 font-body text-sm font-medium text-tinta transition-opacity hover:opacity-70 disabled:opacity-50"
          >
            {indo ? "Procurando…" : "Ver fotos →"}
          </button>
        </div>
      </div>

      <p id="erro-chave" aria-live="polite" className="min-h-5 font-body text-hud text-rec-papel">
        {erro}
      </p>

      <p className="font-body text-hud text-tinta-3">
        A chave e a senha chegam juntas, pelo WhatsApp do ZP Studio.
      </p>
    </form>
  );
}
