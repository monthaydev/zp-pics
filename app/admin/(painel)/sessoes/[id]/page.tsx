import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import BotaoCopiar from "@/components/BotaoCopiar";
import EtiquetaStatus from "@/components/EtiquetaStatus";
import ListaNomes from "@/components/ListaNomes";
import MensagemCliente from "@/components/MensagemCliente";
import ProgressoSessao, { etapaBancada } from "@/components/ProgressoSessao";
import TiraContato from "@/components/TiraContato";
import { exigirAdmin } from "@/lib/auth";
import {
  nomesEscolhidosDaSessao,
  fotosJaEnviadas,
  primeirasFotosPorSessao,
} from "@/lib/fotos";
import { listarEntregasDoPainel } from "@/lib/entregas";
import { obterSessao } from "@/lib/sessoes";
import { diasAte, formatarData } from "@/lib/utils";

import {
  BotaoArquivar,
  BotaoDesarquivar,
  ConcluirEntrega,
  EstenderEntrega,
  ListaEntregues,
} from "./AcoesEntrega";
import ApagarSessao from "./ApagarSessao";
import BotaoAbrir from "./BotaoAbrir";
import EditarContato from "./EditarContato";
import EntregaClient from "./EntregaClient";
import ReabrirSessao from "./ReabrirSessao";
import UploadClient from "./UploadClient";

export const metadata: Metadata = { title: "Sessão · ZP Pics" };

/**
 * A bancada.
 *
 * Antes, esta tela renderizava as sete capacidades do produto sempre, na mesma
 * ordem, no mesmo peso — um inventário de funcionalidades, não uma ferramenta.
 * `ProgressoSessao` já sabia em qual das quatro etapas o ensaio está; só
 * ninguém escutava. Agora escuta: a etapa decide o que ocupa a BANCADA (o
 * bloco grande, com uma ação primária) e o que vira REFERÊNCIA (a coluna
 * lateral, presente mas quieta, em `<details>`).
 *
 * Nada some do produto — tudo continua alcançável. Só para de gritar junto.
 * Ver Plano — A Bancada, CerebroZpPics\02 - Fluxo 2 (Rascunhos).
 */
export default async function SessaoPage({ params }: PageProps<"/admin/sessoes/[id]">) {
  await exigirAdmin();
  const { id } = await params;

  const sessao = await obterSessao(id);
  if (!sessao) notFound();

  // Vai pro navegador para a retomada: ele compara com a pasta escolhida e
  // reprocessa só o que falta.
  const jaEnviadas = await fotosJaEnviadas(sessao.id);

  // A lista aparece assim que existe escolha, não só depois de finalizada: dá
  // pra acompanhar o cliente escolhendo e adiantar o trabalho.
  const escolhidas =
    sessao.total_escolhidas > 0 ? await nomesEscolhidosDaSessao(sessao.id) : [];

  // A entrega só existe depois da finalização. Antes disso não há o que ler.
  const passouDaSelecao = ["finalizada", "entregue", "arquivada"].includes(sessao.status);
  const entregas = passouDaSelecao ? await listarEntregasDoPainel(sessao.id) : [];
  const itensEntrega = entregas.map((e) => ({
    id: e.id,
    nome: e.nome_arquivo,
    tamanho: e.tamanho_bytes,
    apagada: e.excluida_em !== null,
  }));
  const jaEntregues = entregas.filter((e) => e.excluida_em === null).map((e) => e.nome_arquivo);
  const nomesEscolhidas = passouDaSelecao ? await nomesEscolhidosDaSessao(sessao.id) : [];

  const tiras = await primeirasFotosPorSessao([sessao.id]);
  const chavesTira = tiras.get(sessao.id) ?? [];

  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const link = `${base}/s/${sessao.slug}`;
  const dias = diasAte(sessao.prazo_em);
  const etapa = etapaBancada({ status: sessao.status, totalFotos: sessao.total_fotos });

  return (
    <div className="mx-auto w-full max-w-[1600px]">
      <Link
        href="/admin"
        className="inline-flex items-center gap-2 font-hud text-xs uppercase tracking-cine text-tinta-3 transition-colors hover:text-tinta"
      >
        <ArrowLeft className="size-3.5" />
        Sessões
      </Link>

      <div className="mt-6 flex flex-wrap items-center gap-4">
        <h1 className="font-display text-secao uppercase tracking-cine">
          {sessao.titulo}
        </h1>
        <EtiquetaStatus status={sessao.status} />
      </div>

      <p className="mt-2 text-corpo text-tinta-2">
        {sessao.cliente_nome}
        {sessao.cliente_whatsapp && ` · ${sessao.cliente_whatsapp}`}
        {sessao.cliente_email && ` · ${sessao.cliente_email}`}
      </p>

      <ProgressoSessao
        status={sessao.status}
        totalFotos={sessao.total_fotos}
        totalEscolhidas={sessao.total_escolhidas}
        fotosIncluidas={sessao.fotos_incluidas}
      />

      {/* Bancada (a ferramenta da etapa atual) + referência (tudo o mais, a um
          clique). Empilha abaixo de `lg` — a referência vem depois, não some. */}
      <div className="mt-faixa grid gap-faixa lg:grid-cols-[1fr_320px] lg:items-start">
        <div className="flex flex-col gap-faixa border border-linha-forte bg-superficie p-6">
          {etapa === "subir" && (
            <div>
              <h2 className="font-hud text-hud uppercase tracking-cine text-tinta-3">
                Subir fotos
              </h2>
              <UploadClient sessaoId={sessao.id} jaEnviadas={jaEnviadas} />
            </div>
          )}

          {etapa === "abrir" && (
            <div>
              <h2 className="font-hud text-hud uppercase tracking-cine text-tinta-3">
                Pronto pra abrir
              </h2>
              <p className="mt-2 text-corpo text-tinta-2">
                As {sessao.total_fotos} fotos estão no ar. Abra a sessão pra o
                cliente conseguir entrar com o link e a senha — antes disso o
                link não mostra nada.
              </p>
              <div className="mt-4">
                <TiraContato chaves={chavesTira} total={sessao.total_fotos} tamanho="grande" />
              </div>
              <div className="mt-5">
                <BotaoAbrir sessaoId={sessao.id} />
              </div>
            </div>
          )}

          {etapa === "escolhendo" && (
            <div className="flex flex-col gap-faixa">
              <div>
                <h2 className="font-hud text-hud uppercase tracking-cine text-tinta-3">
                  O cliente está escolhendo
                </h2>
                {sessao.total_escolhidas > 0 ? (
                  <>
                    <p className="mt-2 text-corpo text-tinta-2">
                      As {sessao.total_escolhidas} escolhidas até agora. A lista
                      atualiza sozinha, e você recebe um e-mail quando ele
                      finalizar.
                    </p>
                    <div className="mt-4">
                      <TiraContato
                        chaves={chavesTira}
                        total={sessao.total_escolhidas}
                        tamanho="grande"
                      />
                    </div>
                  </>
                ) : (
                  <p className="mt-2 text-corpo text-tinta-2">
                    Ainda sem escolha. Mande o link e a senha pelo WhatsApp — o
                    cliente escolhe sozinho, e você recebe um e-mail quando ele
                    finalizar.
                  </p>
                )}
              </div>

              <div className="border-t border-linha pt-faixa">
                <MensagemCliente
                  tipo="convite"
                  titulo={sessao.titulo}
                  clienteNome={sessao.cliente_nome}
                  clienteEmail={sessao.cliente_email}
                  link={link}
                  prazo={formatarData(sessao.prazo_em)}
                  whatsapp={sessao.cliente_whatsapp}
                />
              </div>
            </div>
          )}

          {etapa === "expirada" && (
            <div>
              <h2 className="font-hud text-hud uppercase tracking-cine text-tinta-3">
                O prazo venceu
              </h2>
              <p className="mt-2 text-corpo text-tinta-2">
                {sessao.total_escolhidas} de {sessao.fotos_incluidas} escolhidas.
                O cliente continua vendo as fotos, mas não escolhe mais até você
                reabrir.
              </p>
              <div className="mt-5">
                <ReabrirSessao sessaoId={sessao.id} apagadas={sessao.total_apagadas} />
              </div>
            </div>
          )}

          {etapa === "finalizada" && (
            <div className="flex flex-col gap-faixa">
              <div>
                <h2 className="font-hud text-hud uppercase tracking-cine text-tinta-3">
                  Pronto pra tratar
                </h2>
                <p className="mt-2 text-corpo text-tinta-2">
                  Copie a lista de nomes abaixo e cole no filtro do Lightroom.
                  São os nomes dos arquivos originais que estão no seu HD.
                </p>
              </div>

              <ListaNomes nomes={escolhidas} slug={sessao.slug} />

              {chavesTira.length > 0 && (
                <div>
                  <TiraContato
                    chaves={chavesTira}
                    total={sessao.total_escolhidas}
                    tamanho="grande"
                  />
                  <p className="mt-2 font-hud text-quadronum text-tinta-3">
                    as {sessao.total_escolhidas} que ele escolheu
                  </p>
                </div>
              )}
              {/* Depois de tratar: mandar as tratadas, ou tirar da frente. As
                  duas saídas ficam lado a lado de propósito — a sessão não
                  fica "finalizada" para sempre, cobrando atenção. */}
              <div className="flex flex-col gap-faixa border-t border-linha pt-faixa">
                <div>
                  <h2 className="font-hud text-hud uppercase tracking-cine text-tinta-3">
                    Depois de tratar
                  </h2>
                  <p className="mt-2 text-corpo text-tinta-2">
                    Suba as fotos tratadas e o cliente baixa pelo mesmo link, no tamanho original.
                    Ou, se a entrega é por outro caminho, arquive.
                  </p>
                </div>

                <section aria-labelledby="entregar" className="flex flex-col gap-4 border border-linha p-4">
                  <h3 id="entregar" className="font-body text-corpo font-semibold text-tinta">
                    Entregar as tratadas por aqui
                  </h3>
                  <EntregaClient
                    sessaoId={sessao.id}
                    escolhidas={nomesEscolhidas}
                    jaEntregues={jaEntregues}
                  />
                  <ListaEntregues sessaoId={sessao.id} itens={itensEntrega} />
                  {jaEntregues.length > 0 && (
                    <div className="border-t border-linha pt-4">
                      <ConcluirEntrega sessaoId={sessao.id} total={jaEntregues.length} />
                    </div>
                  )}
                </section>

                <section aria-labelledby="arquivar" className="flex flex-col gap-3 border border-linha p-4">
                  <h3 id="arquivar" className="font-body text-corpo font-semibold text-tinta">
                    Não vou enviar por aqui
                  </h3>
                  <p className="text-apoio text-tinta-2">
                    A entrega foi por pendrive, WeTransfer ou pessoalmente. A sessão sai da lista
                    principal e vai para Arquivadas. Nada é apagado, e dá pra desarquivar.
                  </p>
                  <div>
                    <BotaoArquivar sessaoId={sessao.id} rotulo="Arquivar sem entregar" />
                  </div>
                </section>
              </div>
            </div>
          )}

          {etapa === "entregue" && (
            <div className="flex flex-col gap-faixa">
              <div>
                <h2 className="font-hud text-hud uppercase tracking-cine text-tinta-3">Entregue</h2>
                <p className="mt-2 text-corpo text-tinta-2">
                  {sessao.total_entregues}{" "}
                  {sessao.total_entregues === 1 ? "foto tratada está" : "fotos tratadas estão"} no ar
                  {sessao.entrega_expira_em && ` até ${formatarData(sessao.entrega_expira_em)}`}.{" "}
                  {sessao.entrega_expira_em && new Date(sessao.entrega_expira_em) <= new Date()
                    ? "O prazo venceu: o cliente já não consegue baixar. Se os arquivos ainda estão na lista, estenda o prazo; se saíram do servidor, suba as tratadas de novo e estenda."
                    : ""}{" "}
                  {sessao.entrega_baixada_em
                    ? `O cliente baixou em ${formatarData(sessao.entrega_baixada_em)}${
                        sessao.entrega_baixada_vezes > 1
                          ? ` (${sessao.entrega_baixada_vezes} downloads)`
                          : ""
                      }.`
                    : "O cliente ainda não baixou."}
                </p>
              </div>

              <MensagemCliente
                tipo="entrega"
                titulo={sessao.titulo}
                clienteNome={sessao.cliente_nome}
                clienteEmail={sessao.cliente_email}
                link={link}
                ate={sessao.entrega_expira_em ? formatarData(sessao.entrega_expira_em) : ""}
                quantidade={sessao.total_entregues}
                whatsapp={sessao.cliente_whatsapp}
              />

              <div className="border-t border-linha pt-faixa">
                <ListaEntregues sessaoId={sessao.id} itens={itensEntrega} />
              </div>

              <div className="flex flex-wrap items-start gap-3 border-t border-linha pt-faixa">
                <EstenderEntrega sessaoId={sessao.id} />
                <BotaoArquivar sessaoId={sessao.id} rotulo="Arquivar" />
              </div>

              <details className="border-t border-linha pt-faixa">
                <summary className="cursor-pointer font-hud text-quadronum uppercase tracking-cine text-tinta-3 transition-colors hover:text-tinta-2">
                  Subir mais tratadas
                </summary>
                <div className="mt-4">
                  <EntregaClient
                    sessaoId={sessao.id}
                    escolhidas={nomesEscolhidas}
                    jaEntregues={jaEntregues}
                  />
                </div>
              </details>
            </div>
          )}

          {etapa === "arquivada" && (
            <div className="flex flex-col gap-faixa">
              <div>
                <h2 className="font-hud text-hud uppercase tracking-cine text-tinta-3">Arquivada</h2>
                <p className="mt-2 text-corpo text-tinta-2">
                  Saiu da lista principal
                  {sessao.arquivada_em && ` em ${formatarData(sessao.arquivada_em)}`}. Nada foi apagado.
                  {sessao.entregue_em
                    ? ` As tratadas ${
                        sessao.entrega_expira_em && new Date(sessao.entrega_expira_em) > new Date()
                          ? `continuam disponíveis para o cliente até ${formatarData(sessao.entrega_expira_em)}`
                          : "já saíram do servidor"
                      }.`
                    : ""}
                </p>
              </div>
              {itensEntrega.length > 0 && (
                <ListaEntregues sessaoId={sessao.id} itens={itensEntrega} />
              )}
              <div>
                <BotaoDesarquivar sessaoId={sessao.id} />
              </div>
            </div>
          )}
        </div>

        {/* REFERÊNCIA: sempre presente, nunca em destaque. `lg:sticky` porque a
            bancada pode rolar mais que ela — o contexto fica à vista. */}
        <aside className="flex flex-col gap-faixa lg:sticky lg:top-20">
          <div>
            {/* O número que importa — mesmo tratamento do contador de quadros
                da galeria do cliente. É literalmente o mesmo número, do outro
                lado do produto. */}
            <p className="font-display leading-none text-tinta">
              <span className="text-quadro tabular-nums">{sessao.total_escolhidas}</span>
            </p>
            <p className="font-hud text-hud text-tinta-3">
              de {sessao.fotos_incluidas} escolhidas
              {sessao.total_extras > 0 && (
                <span className="text-rec-papel"> · {sessao.total_extras} extras</span>
              )}
            </p>
            <div aria-hidden className="mt-2 h-px w-full bg-linha">
              <div
                className="h-full bg-tinta-2 transition-[width]"
                style={{
                  width: `${
                    sessao.fotos_incluidas > 0
                      ? Math.min(sessao.total_escolhidas / sessao.fotos_incluidas, 1) * 100
                      : 0
                  }%`,
                }}
              />
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-faixa border-y border-linha py-faixa">
            <div>
              <dt className="font-hud text-quadronum uppercase tracking-cine text-tinta-3">
                Fotos
              </dt>
              <dd className="mt-1 font-hud text-apoio text-tinta">{sessao.total_fotos}</dd>
            </div>
            <div>
              <dt className="font-hud text-quadronum uppercase tracking-cine text-tinta-3">
                {passouDaSelecao ? "Apagadas" : "Extras"}
              </dt>
              <dd className="mt-1 font-hud text-apoio text-tinta">
                {passouDaSelecao ? sessao.total_apagadas : sessao.total_extras}
              </dd>
            </div>
            <div className="col-span-2">
              <dt className="font-hud text-quadronum uppercase tracking-cine text-tinta-3">
                {passouDaSelecao ? "Finalizada em" : "Prazo"}
              </dt>
              <dd className="mt-1 font-hud text-apoio text-tinta">
                {passouDaSelecao && sessao.finalizada_em
                  ? formatarData(sessao.finalizada_em)
                  : dias < 0
                    ? "vencido"
                    : `${formatarData(sessao.prazo_em)} · ${dias} d`}
              </dd>
            </div>
          </dl>

          <div>
            <h2 className="font-hud text-quadronum uppercase tracking-cine text-tinta-3">
              Link da galeria
            </h2>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              {/* `break-all` porque o slug não quebra em espaço e estouraria
                  no celular */}
              <code className="min-w-0 flex-1 break-all font-hud text-apoio text-tinta">
                {link}
              </code>
              <BotaoCopiar texto={link} rotulo="Copiar link" />
            </div>
            <p className="mt-3 font-hud text-quadronum text-tinta-3">
              A senha é a que você definiu ao criar. Ela fica guardada com hash e
              não pode ser exibida aqui.
            </p>
          </div>

          {sessao.total_apagadas > 0 && !passouDaSelecao && (
            <p className="font-hud text-quadronum leading-relaxed text-tinta-3">
              {sessao.total_apagadas} fotos não escolhidas foram apagadas do
              servidor na finalização anterior. Os originais continuam no seu HD
              — aqui elas não voltam.
            </p>
          )}

          <details className="border-t border-linha pt-faixa">
            <summary className="cursor-pointer font-hud text-quadronum uppercase tracking-cine text-tinta-3 transition-colors hover:text-tinta-2">
              Contato do cliente
            </summary>
            <div className="mt-4">
              <EditarContato
                sessaoId={sessao.id}
                email={sessao.cliente_email}
                whatsapp={sessao.cliente_whatsapp}
              />
            </div>
          </details>

          {/* Só enquanto ainda dá pra escolher: em "subir" o dropzone já é a
              bancada inteira, e depois de finalizada as não escolhidas já
              saíram do R2, então subir mais foto não faz sentido. */}
          {(etapa === "abrir" || etapa === "escolhendo" || etapa === "expirada") && (
            <details className="border-t border-linha pt-faixa">
              <summary className="cursor-pointer font-hud text-quadronum uppercase tracking-cine text-tinta-3 transition-colors hover:text-tinta-2">
                Subir mais fotos
              </summary>
              <div className="mt-4">
                <UploadClient sessaoId={sessao.id} jaEnviadas={jaEnviadas} />
              </div>
            </details>
          )}

          {etapa === "finalizada" && (
            <details className="border-t border-linha pt-faixa">
              <summary className="cursor-pointer font-hud text-quadronum uppercase tracking-cine text-tinta-3 transition-colors hover:text-tinta-2">
                Reabrir para o cliente
              </summary>
              <div className="mt-4">
                <ReabrirSessao sessaoId={sessao.id} apagadas={sessao.total_apagadas} />
              </div>
            </details>
          )}

          <div className="border-t border-linha pt-faixa">
            <h2 className="font-hud text-quadronum uppercase tracking-cine text-tinta-3">
              Zona de perigo
            </h2>
            <p className="mt-2 text-apoio text-tinta-2">
              Apaga tudo: fotos, seleções, entregas e a sessão inteira. Sem volta.
            </p>
            <div className="mt-3">
              <ApagarSessao
                sessaoId={sessao.id}
                titulo={sessao.titulo}
                clienteEscolhendo={sessao.status === "aberta"}
              />
            </div>
          </div>

          {sessao.observacoes && (
            <details className="border-t border-linha pt-faixa" open>
              <summary className="cursor-pointer font-hud text-quadronum uppercase tracking-cine text-tinta-3 transition-colors hover:text-tinta-2">
                Observações
              </summary>
              <p className="mt-2 whitespace-pre-wrap text-apoio text-tinta-2">
                {sessao.observacoes}
              </p>
            </details>
          )}
        </aside>
      </div>
    </div>
  );
}
