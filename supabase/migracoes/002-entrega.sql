-- =============================================================================
-- ZP PICS — migração 002: entrega das fotos tratadas
--
-- Cole no SQL Editor do Supabase e rode UMA vez. É idempotente: rodar de novo
-- não estraga nada. O mesmo conteúdo já está em `supabase/schema.sql`, para
-- instalação nova.
--
-- O que muda:
--   · status ganha 'entregue' (mandou as tratadas) e 'arquivada' (não precisa)
--   · sessoes ganha as datas e os contadores da entrega
--   · tabela `entregas`: um arquivo tratado por linha
--   · a view `sessoes_resumo` ganha `total_entregues`, e PASSA A OBEDECER A RLS
--     (security_invoker): antes ela devolvia tudo, com `senha_hash`, a quem
--     tivesse só a chave pública
--   · duas funções atômicas: `registrar_download` e `concluir_entrega`
-- =============================================================================

-- Status novos. O nome da constraint é o que o Postgres deu à CHECK da coluna.
alter table public.sessoes drop constraint if exists sessoes_status_check;
alter table public.sessoes add constraint sessoes_status_check
check (status in ('rascunho','aberta','finalizada','expirada','entregue','arquivada'));

alter table public.sessoes add column if not exists entregue_em          timestamptz;
alter table public.sessoes add column if not exists arquivada_em         timestamptz;
-- Até quando o cliente consegue baixar. Depois disso o cron apaga do bucket.
alter table public.sessoes add column if not exists entrega_expira_em    timestamptz;
-- O painel mostra "baixou em 23/10". Não guarda quem nem de onde: só quando.
alter table public.sessoes add column if not exists entrega_baixada_em   timestamptz;
alter table public.sessoes add column if not exists entrega_baixada_vezes integer not null default 0;

-- ---------------------------------------------------------------------------
-- entregas — as fotos TRATADAS, uma por linha.
--
-- EXCEÇÃO à regra "o original nunca sobe" (aprovada em 22/10/2026): a tratada
-- sobe, só para entrega, só depois de a seleção ser finalizada, e some do
-- bucket sozinha quando `entrega_expira_em` passa. RAW e original sem
-- tratamento continuam proibidos.
-- ---------------------------------------------------------------------------
create table if not exists public.entregas (
id             uuid primary key default gen_random_uuid(),
sessao_id      uuid        not null references public.sessoes(id) on delete cascade,
-- Nome do arquivo tratado, intocado. É o que o cliente vê e baixa.
nome_arquivo   text        not null,
tamanho_bytes  bigint      not null check (tamanho_bytes > 0),
key_arquivo    text        not null,
-- Nula quando o navegador não decodifica o formato (TIFF): a página mostra um
-- quadro com o nome em vez da miniatura.
key_miniatura  text,
largura        integer,
altura         integer,
enviado_em     timestamptz not null default now(),
-- Marcada pelo cron quando o objeto sai do bucket. A linha fica: preserva o
-- que foi entregue.
excluida_em    timestamptz,
unique (sessao_id, nome_arquivo)
);

create index if not exists entregas_sessao_idx on public.entregas (sessao_id, nome_arquivo);

alter table public.entregas enable row level security;
drop policy if exists admin_total on public.entregas;
create policy admin_total on public.entregas
for all to authenticated using (true) with check (true);

-- ---------------------------------------------------------------------------
-- A view do painel, agora com o total de arquivos entregues.
-- ---------------------------------------------------------------------------
drop view if exists public.sessoes_resumo;

-- `security_invoker`: a view roda com os privilégios de QUEM consulta, e não do
-- dono. Sem isto ela passa por cima da RLS das tabelas — e foi exatamente o
-- que aconteceu: com a chave pública (anon), `sessoes` devolvia 0 linhas e
-- `sessoes_resumo` devolvia todas, com `senha_hash` e `slug`. Achado do
-- guardião em 22/10/2026; o defeito vinha do F0.
create view public.sessoes_resumo with (security_invoker = true) as
select
s.*,
coalesce(f.total, 0)     as total_fotos,
coalesce(sel.total, 0)   as total_escolhidas,
greatest(coalesce(sel.total, 0) - s.fotos_incluidas, 0) as total_extras,
coalesce(f.apagadas, 0)  as total_apagadas,
coalesce(en.total, 0)    as total_entregues
from public.sessoes s
left join lateral (
select
count(*)::int                                          as total,
count(*) filter (where excluida_em is not null)::int    as apagadas
from public.fotos where sessao_id = s.id
) f on true
left join lateral (
select count(*)::int as total from public.selecoes where sessao_id = s.id
) sel on true
left join lateral (
select count(*)::int as total from public.entregas
where sessao_id = s.id and excluida_em is null
) en on true;

-- Revoga o que o Supabase concede por padrão a `anon`. Com `security_invoker` a
-- RLS já nega, mas negar em dois lugares é o que impede o próximo `drop view`
-- de reabrir a porta.
revoke all on public.sessoes_resumo from anon;

-- ---------------------------------------------------------------------------
-- Funções da entrega — atômicas, porque duas abas ou dois downloads ao mesmo
-- tempo perdem incremento e deixam estado impossível quando feitos em duas
-- idas (ler e gravar).
-- ---------------------------------------------------------------------------

-- Conta um download, de uma vez só: `vezes = vezes + 1`, sem ler antes.
create or replace function public.registrar_download(p_sessao uuid)
returns void
language sql
as $$
update public.sessoes
set entrega_baixada_em = now(),
entrega_baixada_vezes = entrega_baixada_vezes + 1
where id = p_sessao;
$$;

-- Fecha a entrega SÓ SE ainda houver arquivo entregue. Feito num comando só:
-- se outra aba removeu a última tratada no meio do caminho, a condição falha e
-- a sessão não vira "entregue" com zero arquivos.
create or replace function public.concluir_entrega(p_sessao uuid, p_dias integer)
returns boolean
language plpgsql
as $$
declare afetadas integer;
begin
update public.sessoes
set status = 'entregue',
entregue_em = now(),
entrega_expira_em = now() + make_interval(days => p_dias)
where id = p_sessao
and status in ('finalizada', 'entregue')
and exists (
select 1 from public.entregas
where sessao_id = p_sessao and excluida_em is null
);
get diagnostics afetadas = row_count;
return afetadas > 0;
end $$;

-- Só o servidor chama estas funções: `registrar_download` pelo cliente do
-- ensaio (service_role) e `concluir_entrega` pelo admin autenticado.
revoke all on function public.registrar_download(uuid) from public, anon, authenticated;
grant execute on function public.registrar_download(uuid) to service_role;
revoke all on function public.concluir_entrega(uuid, integer) from public, anon;
grant execute on function public.concluir_entrega(uuid, integer) to authenticated, service_role;

