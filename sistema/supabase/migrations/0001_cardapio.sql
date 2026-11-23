-- Módulo 1: Cardápio e produtos + perfis de usuário
-- Café da Mantiqueira · sistema de comandas

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------
-- Perfis (um por usuário do Supabase Auth)
-- ---------------------------------------------------------------
create table if not exists public.perfis (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null default '',
  papel text not null default 'garcom' check (papel in ('admin','gerente','garcom','cozinha','caixa')),
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

-- Cria o perfil automaticamente quando um usuário é criado no Auth.
-- O primeiro usuário vira admin; os demais entram como garçom até um admin mudar.
create or replace function public.criar_perfil()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfis (id, nome, papel)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nome', split_part(new.email, '@', 1)),
    case when not exists (select 1 from public.perfis) then 'admin'
         else coalesce(new.raw_user_meta_data->>'papel', 'garcom') end
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists ao_criar_usuario on auth.users;
create trigger ao_criar_usuario after insert on auth.users
  for each row execute function public.criar_perfil();

-- Papel do usuário logado (usado nas políticas de RLS)
create or replace function public.papel_atual()
returns text language sql stable security definer set search_path = public as $$
  select papel from public.perfis where id = auth.uid() and ativo
$$;

create or replace function public.eh_gestor()
returns boolean language sql stable as $$
  select coalesce(public.papel_atual() in ('admin','gerente'), false)
$$;

-- updated_at genérico
create or replace function public.tocar_atualizado_em()
returns trigger language plpgsql as $$
begin new.atualizado_em = now(); return new; end $$;

-- ---------------------------------------------------------------
-- Categorias
-- ---------------------------------------------------------------
create table if not exists public.categorias (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  ordem int not null default 0,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create trigger categorias_atualizado before update on public.categorias
  for each row execute function public.tocar_atualizado_em();

-- ---------------------------------------------------------------
-- Produtos
-- destino: para onde o pedido vai quando lançado na comanda
-- ---------------------------------------------------------------
create table if not exists public.produtos (
  id uuid primary key default gen_random_uuid(),
  categoria_id uuid not null references public.categorias(id) on delete restrict,
  nome text not null,
  descricao text not null default '',
  preco numeric(10,2) not null default 0 check (preco >= 0),
  destino text not null default 'balcao' check (destino in ('cozinha','bar','balcao','nenhum')),
  ativo boolean not null default true,
  ordem int not null default 0,
  imagem_url text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists produtos_categoria_idx on public.produtos(categoria_id);
create trigger produtos_atualizado before update on public.produtos
  for each row execute function public.tocar_atualizado_em();

-- ---------------------------------------------------------------
-- Grupos de opções de um produto (Tamanho, Leite, Adicionais...)
-- tipo 'unica'   = escolhe uma (ex.: tamanho)
-- tipo 'multipla' = escolhe várias (ex.: adicionais)
-- ---------------------------------------------------------------
create table if not exists public.grupos_opcoes (
  id uuid primary key default gen_random_uuid(),
  produto_id uuid not null references public.produtos(id) on delete cascade,
  nome text not null,
  tipo text not null default 'unica' check (tipo in ('unica','multipla')),
  obrigatorio boolean not null default false,
  minimo int not null default 0 check (minimo >= 0),
  maximo int check (maximo is null or maximo >= 1),
  ordem int not null default 0
);
create index if not exists grupos_opcoes_produto_idx on public.grupos_opcoes(produto_id);

create table if not exists public.opcoes (
  id uuid primary key default gen_random_uuid(),
  grupo_id uuid not null references public.grupos_opcoes(id) on delete cascade,
  nome text not null,
  preco_extra numeric(10,2) not null default 0,
  ativo boolean not null default true,
  ordem int not null default 0
);
create index if not exists opcoes_grupo_idx on public.opcoes(grupo_id);

-- ---------------------------------------------------------------
-- RLS: todo usuário logado lê; só admin/gerente escreve no cardápio.
-- Perfis: cada um lê o próprio; admin lê e edita todos.
-- ---------------------------------------------------------------
alter table public.perfis enable row level security;
alter table public.categorias enable row level security;
alter table public.produtos enable row level security;
alter table public.grupos_opcoes enable row level security;
alter table public.opcoes enable row level security;

create policy "perfil: ver o próprio ou todos se gestor" on public.perfis
  for select to authenticated using (id = auth.uid() or public.eh_gestor());
create policy "perfil: admin edita" on public.perfis
  for update to authenticated using (public.papel_atual() = 'admin') with check (public.papel_atual() = 'admin');

create policy "categorias: ler" on public.categorias for select to authenticated using (true);
create policy "categorias: gestor escreve" on public.categorias for all to authenticated
  using (public.eh_gestor()) with check (public.eh_gestor());

create policy "produtos: ler" on public.produtos for select to authenticated using (true);
create policy "produtos: gestor escreve" on public.produtos for all to authenticated
  using (public.eh_gestor()) with check (public.eh_gestor());

create policy "grupos: ler" on public.grupos_opcoes for select to authenticated using (true);
create policy "grupos: gestor escreve" on public.grupos_opcoes for all to authenticated
  using (public.eh_gestor()) with check (public.eh_gestor());

create policy "opcoes: ler" on public.opcoes for select to authenticated using (true);
create policy "opcoes: gestor escreve" on public.opcoes for all to authenticated
  using (public.eh_gestor()) with check (public.eh_gestor());

-- Tempo real: outros aparelhos recebem alterações do cardápio na hora
alter publication supabase_realtime add table public.categorias, public.produtos, public.grupos_opcoes, public.opcoes;
