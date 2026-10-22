import "server-only";

import { Resend } from "resend";

/**
 * Aviso pra ZP quando o cliente finaliza.
 *
 * Nunca derruba a finalização: se o Resend estiver fora do ar ou a chave não
 * estiver configurada, a seleção já está gravada e o painel já mostra o status.
 * Perder o e-mail é chato; perder a finalização do cliente é inaceitável.
 */
export async function avisarSelecaoFinalizada(dados: {
  titulo: string;
  clienteNome: string;
  escolhidas: number;
  incluidas: number;
  apagadas: number;
  sessaoId: string;
}) {
  const chave = process.env.RESEND_API_KEY;
  const para = process.env.EMAIL_TO;
  const de = process.env.EMAIL_FROM;
  if (!chave || !para || !de) return;

  const extras = Math.max(dados.escolhidas - dados.incluidas, 0);
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const link = `${base}/admin/sessoes/${dados.sessaoId}`;

  try {
    await new Resend(chave).emails.send({
      from: de,
      to: para,
      subject: `${dados.clienteNome} finalizou a seleção — ${dados.titulo}`,
      text: [
        `${dados.clienteNome} terminou de escolher as fotos de "${dados.titulo}".`,
        "",
        `Escolhidas: ${dados.escolhidas} de ${dados.incluidas}`,
        extras > 0 ? `Extras: ${extras}` : null,
        `Apagadas do servidor (não escolhidas): ${dados.apagadas}`,
        "",
        `Lista de nomes pro Lightroom: ${link}`,
      ]
        .filter(Boolean)
        .join("\n"),
    });
  } catch {
    // Silêncio proposital — ver o comentário do topo.
  }
}
