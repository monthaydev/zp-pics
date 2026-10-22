-- =============================================================================
-- ZP PICS — schema
--
-- Rodar no SQL Editor do Supabase. É idempotente: pode rodar de novo.
--
-- Princípio: a RLS NEGA TUDO por padrão. O admin da ZP entra pelo Supabase Auth
-- e as policies liberam só ele. O cliente do ensaio não tem usuário no Supabase
-- e nunca fala com o banco direto — ele fala com Server Actions que já
-- validaram o cookie assinado da sessão, e essas usam a service_role.
-- =============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- sessoes — um ensaio. É a unidade de tudo.
-- ---------------------------------------------------------------------------
create table if not exists public.sessoes (
id               uuid primary key default gen_random_uuid(),
-- Aleatório (nanoid), nunca derivado do nome do cliente: é metade da credencial.
slug             text        not null unique,
titulo           text        not null,
cliente_nome     text        not null,
cliente_email    text,
cliente_whatsapp text,
senha_hash       text        not null,
-- Tamanho do pacote contratado. Passar disso é permitido e vira "extra".
fotos_incluidas  integer     not null check (fotos_incluidas > 0),
prazo_em         timestamptz not null,
status           text        not null default 'rascunho'
                check (status in ('rascunho','aberta','finalizada','expirada','entregue','arquivada')),
finalizada_em    timestamptz,
observacoes      text,
created_at       timestamptz not null default now()
);

create index if not exists sessoes_slug_idx   on public.sessoes (slug);
create index if not exists sessoes_status_idx on public.sessoes (status, created_at desc);

-- Rate limit da senha, guardado na própria sessão.
--
-- Fica no banco e não em memória porque serverless não tem memória entre
-- requisições: um contador em RAM zera a cada invocação e não limita nada. O
-- escopo é a sessão, e não o IP, porque o alvo do ataque é um slug específico.
alter table public.sessoes
add column if not exists tentativas_senha integer not null default 0;
alter table public.sessoes
add column if not exists bloqueado_ate timestamptz;

-- ---------------------------------------------------------------------------
-- fotos
-- ---------------------------------------------------------------------------
create table if not exists public.fotos (
id            uuid primary key default gen_random_uuid(),
sessao_id     uuid        not null references public.sessoes(id) on delete cascade,
-- SAGRADO. Única ligação entre a prévia e o RAW no HD da ZP. A entrega final
-- é a lista destes nomes, colada no filtro do Lightroom. Nunca renomear,
-- normalizar acento, mudar caixa ou tirar extensão.
nome_original text        not null,
ordem         integer     not null default 0,
key_thumb     text        not null,
key_preview   text        not null,
-- Dimensões da PRÉVIA: é o que a grade usa pra reservar espaço (CLS 0).
largura       integer     not null,
altura        integer     not null,
created_at    timestamptz not null default now(),
unique (sessao_id, nome_original)
);

create index if not exists fotos_sessao_idx on public.fotos (sessao_id, ordem);

-- Quando a sessão é finalizada, os derivativos das fotos NÃO escolhidas são
-- apagados do R2 e a linha fica marcada aqui. A linha não some junto de
-- propósito: ela preserva `nome_original` e o total de fotos que o ensaio
-- teve. O que sumiu foram os objetos no bucket — e isso não tem volta, nem
-- quando o admin reabre a sessão.
alter table public.fotos
add column if not exists excluida_em timestamptz;

-- ---------------------------------------------------------------------------
-- selecoes — marcar = insert, desmarcar = delete. Sem booleano, sem soft delete.
-- ---------------------------------------------------------------------------
create table if not exists public.selecoes (
id           uuid primary key default gen_random_uuid(),
-- Redundante com foto_id, mas evita join na contagem — que roda a cada clique.
sessao_id    uuid        not null references public.sessoes(id) on delete cascade,
foto_id      uuid        not null references public.fotos(id)   on delete cascade,
escolhida_em timestamptz not null default now(),
unique (sessao_id, foto_id)
);

create index if not exists selecoes_sessao_idx on public.selecoes (sessao_id);

-- ---------------------------------------------------------------------------
-- Entrega das tratadas (migração 002, 22/10/2026)
-- ---------------------------------------------------------------------------
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
-- RLS — nega tudo, libera só o admin autenticado
-- ---------------------------------------------------------------------------
alter table public.sessoes  enable row level security;
alter table public.fotos    enable row level security;
alter table public.selecoes enable row level security;

do $$
declare t text;
begin
foreach t in array array['sessoes','fotos','selecoes'] loop
execute format('drop policy if exists admin_total on public.%I', t);
execute format(
'create policy admin_total on public.%I
    for all to authenticated using (true) with check (true)', t);
end loop;
end $$;

-- Nenhuma policy para `anon`: a chave pública não lê nem escreve nada.

-- ---------------------------------------------------------------------------
-- Expiração
--
-- Marca como expirada toda sessão aberta cujo prazo passou. Pode ser agendada
-- (pg_cron), mas o app NÃO confia só nisto: a leitura da galeria também checa
-- o prazo, porque um cron que falhou em silêncio deixaria a galeria aberta.
-- ---------------------------------------------------------------------------
create or replace function public.expirar_sessoes()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare afetadas integer;
begin
update public.sessoes
set status = 'expirada'
where status = 'aberta'
and prazo_em < now();
get diagnostics afetadas = row_count;
return afetadas;
end $$;

-- ---------------------------------------------------------------------------
-- Resumo para o painel: contagem de fotos e de escolhidas por sessão.
-- ---------------------------------------------------------------------------
-- `drop` antes do `create`: o `s.*` é expandido na criação, então acrescentar
-- coluna em `sessoes` muda a posição das colunas da view e o `create or
-- replace` recusa. Nada depende desta view além do painel.
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

