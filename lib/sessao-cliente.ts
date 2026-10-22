import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

/**
 * O crachá do cliente do ensaio.
 *
 * O cliente não tem usuário no Supabase e nunca vai ter — a credencial dele são
 * as duas metades que chegam pelo WhatsApp: o `slug` (público por natureza) e a
 * senha. Depois que a senha confere uma vez, quem sustenta o acesso é este
 * cookie assinado.
 *
 * HMAC-SHA256 com o `node:crypto`, sem dependência nova. Não é criptografia: o
 * conteúdo é legível, mas não é forjável sem o `SESSAO_COOKIE_SECRET`. E não
 * tem o que esconder ali dentro — o id da sessão sozinho não abre nada.
 */

/**
 * Um cookie por sessão, com o slug no nome.
 *
 * Nome fixo faria a segunda galeria aberta derrubar a primeira — e o João
 * abrindo dois ensaios pra conferir viraria bug fantasma. O alfabeto do slug
 * (só minúscula e dígito) é seguro num nome de cookie.
 */
const PREFIXO = "zp_s_";

export type CrachaSessao = {
  sessaoId: string;
  slug: string;
  /** Epoch em segundos. Casa com o `prazo_em` da sessão. */
  exp: number;
};

function nomeCookie(slug: string) {
  return `${PREFIXO}${slug}`;
}

function segredo() {
  const valor = process.env.SESSAO_COOKIE_SECRET;
  if (!valor) throw new Error("Variável de ambiente ausente: SESSAO_COOKIE_SECRET");
  return valor;
}

function assinar(corpo: string) {
  return createHmac("sha256", segredo()).update(corpo).digest("base64url");
}

function serializar(cracha: CrachaSessao) {
  const corpo = Buffer.from(JSON.stringify(cracha)).toString("base64url");
  return `${corpo}.${assinar(corpo)}`;
}

/**
 * Confere assinatura e validade. Devolve `null` para qualquer defeito — não
 * existe "quase válido".
 */
function verificar(bruto: string): CrachaSessao | null {
  const [corpo, assinatura] = bruto.split(".");
  if (!corpo || !assinatura) return null;

  const esperada = Buffer.from(assinar(corpo));
  const recebida = Buffer.from(assinatura);
  // `timingSafeEqual` estoura se os tamanhos diferem — o teste de tamanho tem
  // que vir antes, e ele não vaza nada que a assinatura já não revele.
  if (recebida.length !== esperada.length) return null;
  if (!timingSafeEqual(recebida, esperada)) return null;

  try {
    const dados = JSON.parse(
      Buffer.from(corpo, "base64url").toString(),
    ) as Partial<CrachaSessao>;

    if (!dados.sessaoId || !dados.slug || typeof dados.exp !== "number") return null;
    // Expirado é o mesmo que ausente: o prazo do ensaio acabou.
    if (dados.exp * 1000 < Date.now()) return null;

    return dados as CrachaSessao;
  } catch {
    return null;
  }
}

/** Grava o crachá depois que a senha conferiu. Vence junto com o prazo do ensaio. */
export async function gravarCracha(cracha: CrachaSessao) {
  const armazem = await cookies();
  armazem.set(nomeCookie(cracha.slug), serializar(cracha), {
    httpOnly: true,
    // Em desenvolvimento o app roda em http://localhost: cookie `secure` ali
    // simplesmente não é gravado, e a galeria nunca abriria na sua máquina.
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    // Escopo de caminho aberto de propósito: a rota `/api/img` também precisa
    // receber este cookie pra liberar as imagens.
    path: "/",
    expires: new Date(cracha.exp * 1000),
  });
}

/** O crachá desta galeria, ou `null` se não houver um válido. */
export async function lerCracha(slug: string): Promise<CrachaSessao | null> {
  const armazem = await cookies();
  const bruto = armazem.get(nomeCookie(slug))?.value;
  if (!bruto) return null;

  const cracha = verificar(bruto);
  // O slug de dentro tem que bater com o do nome do cookie. Sem esta conferência,
  // um crachá legítimo de outra sessão, copiado para este nome, passaria.
  if (!cracha || cracha.slug !== slug) return null;
  return cracha;
}

/**
 * Existe crachá válido para esta sessão, sob qualquer slug?
 *
 * É o que a rota `/api/img` pergunta: ela conhece a sessão pela chave do
 * objeto, não pelo slug, e o navegador pode carregar mais de um crachá.
 */
export async function temCrachaDaSessao(sessaoId: string): Promise<boolean> {
  const armazem = await cookies();

  for (const { name, value } of armazem.getAll()) {
    if (!name.startsWith(PREFIXO)) continue;
    const cracha = verificar(value);
    if (cracha && cracha.sessaoId === sessaoId && nomeCookie(cracha.slug) === name) {
      return true;
    }
  }

  return false;
}

/** Descarta o crachá desta galeria. */
export async function apagarCracha(slug: string) {
  const armazem = await cookies();
  armazem.delete(nomeCookie(slug));
}
