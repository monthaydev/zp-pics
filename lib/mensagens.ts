/**
 * Os textos que a ZP manda para o cliente, e os links que os abrem.
 *
 * Funções puras, sem DOM e sem servidor: o painel usa no navegador (a senha é
 * digitada ali e nunca sai da tela) e qualquer teste roda sem montar nada.
 *
 * O envio é sempre feito pela própria ZP — o botão abre o Gmail ou o WhatsApp
 * já preenchidos. Decisão de 22/10/2026: sai do Gmail de vocês, o cliente
 * reconhece quem mandou, a resposta cai na caixa de vocês, e não depende de
 * domínio verificado no Resend.
 */

export type DadosConvite = {
  clienteNome: string;
  link: string;
  /** Digitada na hora. `null` mostra os pontinhos. */
  senha: string | null;
  prazo: string;
};

export type DadosEntrega = {
  clienteNome: string;
  link: string;
  senha: string | null;
  /** Até quando as fotos ficam disponíveis, já formatada. */
  ate: string;
  quantidade: number;
};

const primeiroNome = (nome: string) => nome.trim().split(/\s+/)[0] ?? "";
const senhaOuPontos = (senha: string | null) => (senha && senha.length > 0 ? senha : "•••••");

export function mensagemConvite(d: DadosConvite) {
  return [
    `Oi, ${primeiroNome(d.clienteNome)}! As fotos do seu ensaio já estão prontas pra você escolher.`,
    "",
    `Link: ${d.link}`,
    `Senha: ${senhaOuPontos(d.senha)}`,
    "",
    "É só abrir, marcar as fotos que você quer receber tratadas e clicar em Finalizar.",
    `Você tem até ${d.prazo} pra escolher.`,
  ].join("\n");
}

export const assuntoConvite = (titulo: string) =>
  `Suas fotos estão prontas para escolher — ${titulo}`;

export function mensagemEntrega(d: DadosEntrega) {
  const fotos = d.quantidade === 1 ? "1 foto tratada" : `${d.quantidade} fotos tratadas`;
  return [
    `Oi, ${primeiroNome(d.clienteNome)}! Suas fotos tratadas estão prontas: ${fotos}.`,
    "",
    `Link: ${d.link}`,
    `Senha: ${senhaOuPontos(d.senha)} (a mesma de quando você escolheu)`,
    "",
    "Elas vêm no tamanho original, sem compressão — é só baixar.",
    `Ficam disponíveis até ${d.ate}.`,
  ].join("\n");
}

export const assuntoEntrega = (titulo: string) => `Suas fotos tratadas — ${titulo}`;

/** Compose do Gmail na web, já com destinatário, assunto e corpo. */
export function linkGmail({ para, assunto, corpo }: { para: string; assunto: string; corpo: string }) {
  const q = new URLSearchParams({ view: "cm", fs: "1", to: para, su: assunto, body: corpo });
  return `https://mail.google.com/mail/?${q.toString()}`;
}

/** Para quem não usa Gmail na web: abre o app de e-mail do aparelho. */
export function linkMailto({ para, assunto, corpo }: { para: string; assunto: string; corpo: string }) {
  return `mailto:${encodeURIComponent(para)}?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(corpo)}`;
}

/** `wa.me` exige só dígitos, com o código do país na frente. `null` se não der. */
export function linkWhatsApp(whatsapp: string | null, texto: string) {
  const numero = whatsapp?.replace(/\D/g, "");
  if (!numero || numero.length < 10) return null;
  const completo = numero.length <= 11 ? `55${numero}` : numero;
  return `https://wa.me/${completo}?text=${encodeURIComponent(texto)}`;
}
