import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import EtiquetaStatus from "@/components/EtiquetaStatus";
import TiraContato from "@/components/TiraContato";
import { Button } from "@/components/ui/button";
import { exigirAdmin } from "@/lib/auth";
import { primeirasFotosPorSessao } from "@/lib/fotos";
import { listarSessoes, type SessaoResumo } from "@/lib/sessoes";
import { cn, diasAte, formatarData } from "@/lib/utils";

export const metadata: Metadata = { title: "Sessões · ZP Pics" };

/**
 * O que cada status quer dizer.
 *
 * Vive aqui e não na cabeça de quem opera: os quatro estados estão descritos no
 * na documentação do sistema. Fica dentro de um
 * `<details>` fechado — quem já sabe não perde espaço de tela com isso.
 */
const LEGENDA = [
  ["rascunho", "Criada, mas o cliente ainda não vê nada. Falta subir as fotos ou abrir a sessão."],
  ["aberta", "O cliente pode entrar com o link e a senha e está escolhendo."],
  ["finalizada", "O cliente terminou. A lista de nomes está pronta e as fotos não escolhidas saíram do servidor."],
  ["expirada", "O prazo venceu. O cliente continua vendo as fotos, mas não escolhe mais até você reabrir."],
  ["entregue", "Você mandou as fotos tratadas. O cliente baixa pelo mesmo link até o prazo da entrega."],
  ["arquivada", "Tirada da frente: a entrega foi por outro caminho, ou a sessão acabou. Nada é apagado, e dá pra desarquivar."],
] as const;

/**
 * As três abas.
 *
 * O que já acabou não pode ficar cobrando atenção toda vez que o painel abre —
 * essa foi a queixa que gerou o arquivamento. "Em andamento" é o padrão e traz
 * tudo o que ainda pede alguma ação da ZP, inclusive a finalizada que espera
 * ser entregue ou arquivada. Entregue e arquivada saem da frente, e um clique
 * na aba as traz de volta.
 */
const ABAS = [
  { id: "andamento", rotulo: "Em andamento", status: ["rascunho", "aberta", "expirada", "finalizada"] },
  { id: "entregues", rotulo: "Entregues", status: ["entregue"] },
  { id: "arquivadas", rotulo: "Arquivadas", status: ["arquivada"] },
] as const;

type IdAba = (typeof ABAS)[number]["id"];

/** O que precisa de uma ação sua agora, e qual é ela. */
function acaoPendente(s: SessaoResumo): string | null {
  const dias = diasAte(s.prazo_em);

  if (s.status === "rascunho" && s.total_fotos === 0) return "Subir fotos";
  if (s.status === "rascunho" && s.total_fotos > 0) return "Abrir para o cliente";
  // Antes não existia coluna que dissesse "a ZP já resolveu isto", então a
  // finalizada sumia da faixa depois de 14 dias por aproximação. Agora existe:
  // a finalizada fica até virar entregue ou arquivada.
  if (s.status === "finalizada") return "Entregar ou arquivar";
  if (s.status === "aberta" && dias >= 0 && dias <= 3) return "Prazo vencendo";
  return null;
}

export default async function PainelPage({ searchParams }: PageProps<"/admin">) {
  await exigirAdmin();
  const { aba: abaPedida } = await searchParams;
  const aba: IdAba =
    ABAS.find((a) => a.id === abaPedida)?.id ?? "andamento";

  const todas = await listarSessoes();
  const contagem = Object.fromEntries(
    ABAS.map((a) => [a.id, todas.filter((s) => (a.status as readonly string[]).includes(s.status)).length]),
  ) as Record<IdAba, number>;
  const statusDaAba = ABAS.find((a) => a.id === aba)!.status as readonly string[];
  const sessoes = todas.filter((s) => statusDaAba.includes(s.status));
  const tiras = await primeirasFotosPorSessao(sessoes.map((s) => s.id));

  const pendentes = sessoes
    .map((s) => ({ sessao: s, acao: acaoPendente(s) }))
    .filter((p): p is { sessao: SessaoResumo; acao: string } => p.acao !== null);

  return (
    <div className="mx-auto w-full max-w-[1600px]">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <h1 className="font-display text-secao uppercase tracking-cine">Sessões</h1>
          {sessoes.length > 0 && (
            <p className="mt-1 font-body text-apoio text-tinta-3">
              {sessoes.length} {sessoes.length === 1 ? "ensaio" : "ensaios"}
              {pendentes.length > 0 &&
                ` · ${pendentes.length} esperando você`}
            </p>
          )}
        </div>
        <Button asChild>
          <Link href="/admin/sessoes/nova">
            <Plus />
            Nova sessão
          </Link>
        </Button>
      </div>

      {todas.length === 0 ? (
        <VazioConvite />
      ) : (
        <>
          <nav aria-label="Sessões por situação" className="mt-bloco flex gap-1 overflow-x-auto border-b border-linha">
            {ABAS.map((a) => (
              <Link
                key={a.id}
                href={a.id === "andamento" ? "/admin" : `/admin?aba=${a.id}`}
                aria-current={a.id === aba ? "page" : undefined}
                className={cn(
                  // `shrink-0`/`nowrap`: em 390px as três abas passam da largura, e quebrar
                  // em duas linhas partia o sublinhado da ativa. Rolam em vez de quebrar.
                  "-mb-px flex h-11 shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-3 font-body text-hud font-medium transition-colors sm:px-4",
                  a.id === aba
                    ? "border-tinta text-tinta"
                    : "border-transparent text-tinta-3 hover:text-tinta-2",
                )}
              >
                {a.rotulo}
                <span className="tabular-nums text-tinta-3">{contagem[a.id]}</span>
              </Link>
            ))}
          </nav>

          <details className="mt-bloco border-b border-linha pb-4">
            <summary className="cursor-pointer font-body text-hud font-medium text-tinta-3 transition-colors hover:text-tinta-2">
              O que significa cada status
            </summary>
            <dl className="mt-4 flex flex-col gap-3">
              {LEGENDA.map(([status, texto]) => (
                <div key={status} className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <dt className="w-24 shrink-0">
                    <EtiquetaStatus status={status} />
                  </dt>
                  <dd className="min-w-0 flex-1 text-apoio leading-relaxed text-tinta-2">
                    {texto}
                  </dd>
                </div>
              ))}
            </dl>
          </details>

          {aba === "andamento" && pendentes.length > 0 && (
            <section className="mt-faixa">
              <h2 className="font-body text-hud font-medium text-tinta-3">
                Precisa de você
              </h2>
              <ul className="mt-3 flex flex-col gap-px overflow-hidden border border-linha-forte">
                {pendentes.map(({ sessao: s, acao }) => (
                  <li key={s.id}>
                    <Link
                      href={`/admin/sessoes/${s.id}`}
                      className="flex flex-wrap items-center gap-x-6 gap-y-2 bg-superficie px-4 py-3 transition-colors hover:bg-superficie-2"
                    >
                      <TiraContato chaves={tiras.get(s.id) ?? []} total={s.total_fotos} />
                      <div className="min-w-40 flex-1">
                        <p className="truncate font-body text-corpo text-tinta">
                          {s.titulo}
                        </p>
                      </div>
                      <EtiquetaStatus status={s.status} />
                      <span className="font-body text-apoio text-tinta">{acao} →</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <h2 className="mt-faixa font-body text-hud font-medium text-tinta-3">
            {ABAS.find((a) => a.id === aba)!.rotulo}
          </h2>

          {sessoes.length === 0 && (
            <p className="mt-3 border border-dashed border-linha-forte px-4 py-8 text-center text-apoio text-tinta-3">
              {aba === "andamento"
                ? "Nada em andamento. Tudo que acabou está em Entregues ou Arquivadas."
                : aba === "entregues"
                  ? "Nenhuma entrega ainda. Depois que o cliente finalizar, suba as tratadas na sessão."
                  : "Nenhuma sessão arquivada."}
            </p>
          )}

          {/* `overflow-x-auto`: numa tabela densa, rolar de lado é melhor do
              que colunas se espremendo até virar sopa de números. */}
          <div className="overflow-x-auto">
            <div className="mt-3 min-w-[720px]">
              {/* Cabeçalho grudado no topo ao rolar — régua de data-dense
                  dashboard: numa lista longa, o nome da coluna nunca deveria
                  sair de vista. */}
              <div className="sticky top-0 z-10 flex items-center gap-x-6 border-b border-linha bg-fundo px-2 pb-2 font-body text-quadronum font-medium text-tinta-3">
                <span className="w-[168px] shrink-0" aria-hidden />
                <span className="min-w-40 flex-1">Ensaio</span>
                <span className="w-24 shrink-0">Status</span>
                <span className="w-20 shrink-0 text-right">Fotos</span>
                <span className="w-28 shrink-0 text-right">Escolhidas</span>
                <span className="w-32 shrink-0">Prazo</span>
              </div>

              <ul>
                {sessoes.map((s) => {
                  const dias = diasAte(s.prazo_em);
                  const proporcaoPrazo =
                    dias < 0 ? 1 : Math.max(0, Math.min(1, 1 - dias / 30));

                  return (
                    <li key={s.id} className="border-b border-linha">
                      <Link
                        href={`/admin/sessoes/${s.id}`}
                        // Altura de linha ~56px — régua de data-dense
                        // dashboard: apertado demais engole a tira de
                        // contato, folgado demais volta a flutuar.
                        className="flex min-h-14 items-center gap-x-6 gap-y-2 px-2 py-3 transition-colors hover:bg-superficie"
                      >
                        <TiraContato chaves={tiras.get(s.id) ?? []} total={s.total_fotos} />

                        <div className="min-w-40 flex-1">
                          <p className="truncate font-body text-corpo text-tinta">
                            {s.titulo}
                          </p>
                          <p className="truncate text-apoio text-tinta-3">
                            {s.cliente_nome}
                          </p>
                        </div>

                        <span className="w-24 shrink-0">
                          <EtiquetaStatus status={s.status} />
                        </span>

                        <p className="w-20 shrink-0 text-right font-hud text-apoio text-tinta-2">
                          {s.total_fotos}
                        </p>

                        <p className="w-28 shrink-0 text-right font-hud text-apoio text-tinta-2">
                          {s.total_escolhidas} / {s.fotos_incluidas}
                          {s.total_extras > 0 && (
                            <span className="text-tinta"> +{s.total_extras}</span>
                          )}
                        </p>

                        <div className="w-32 shrink-0">
                          <p className="font-hud text-apoio text-tinta-3">
                            {s.status === "entregue"
                              ? s.entrega_baixada_em
                                ? `baixou ${formatarData(s.entrega_baixada_em)}`
                                : "não baixou"
                              : s.status === "arquivada" && s.arquivada_em
                                ? formatarData(s.arquivada_em)
                                : s.status === "finalizada" && s.finalizada_em
                                  ? formatarData(s.finalizada_em)
                                  : dias < 0
                                    ? "prazo vencido"
                                    : `${dias} d`}
                          </p>
                          {/* Fio de prazo, mesmo instrumento do contador de
                              pacote da galeria: `3 d` deixa de ler igual a
                              `12 d` sem precisar de semáforo colorido. */}
                          {s.status === "aberta" && (
                            <div aria-hidden className="mt-1 h-px w-full bg-linha">
                              <div
                                className={cn(
                                  "h-full transition-[width]",
                                  dias <= 3 ? "bg-rec" : "bg-tinta-3",
                                )}
                                style={{ width: `${proporcaoPrazo * 100}%` }}
                              />
                            </div>
                          )}
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** Tela vazia é convite, não aviso de ausência: sai daqui com o próximo passo. */
function VazioConvite() {
  return (
    <div className="mt-16 border border-dashed border-linha-forte px-6 py-16 text-center">
      <h2 className="font-display text-xl uppercase tracking-cine text-tinta">
        Nenhum ensaio ainda
      </h2>
      <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-tinta-2">
        Uma sessão guarda as fotos de um ensaio e o link que o cliente usa para
        escolher. Crie a primeira, arraste a pasta do ensaio e mande o link pelo
        WhatsApp.
      </p>
      <div className="mt-6">
        <Button asChild>
          <Link href="/admin/sessoes/nova">
            <Plus />
            Criar a primeira sessão
          </Link>
        </Button>
      </div>
    </div>
  );
}
