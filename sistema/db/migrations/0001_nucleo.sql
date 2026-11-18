-- Núcleo do sistema do Café da Mantiqueira.
-- Sempre ligado: lojas, pessoas, módulos, catálogo, receitas, calendário e registro de eventos.
-- Cada módulo opcional fica no seu próprio schema e só lê o núcleo.

create extension if not exists pgcrypto;
create schema if not exists core;

-- ---------- Lojas ----------
create table core.loja (
  id            smallserial primary key,
  slug          text not null unique check (slug ~ '^[a-z0-9-]+$'),
  nome          text not null,
  dias_fechados smallint[] not null default '{}',   -- 0 = domingo ... 6 = sábado
  ativa         boolean not null default true,
  criado_em     timestamptz not null default now()
);

-- ---------- Pessoas e acesso por PIN ----------
create table core.papel (
  slug text primary key,
  nome text not null
);
insert into core.papel values
  ('dona', 'Dona'), ('gestao', 'Gestão'), ('caixa', 'Caixa'),
  ('cozinha', 'Cozinha'), ('atendimento', 'Atendimento');

create table core.pessoa (
  id        serial primary key,
  nome      text not null,
  pin_hash  text,
  ativa     boolean not null default true,
  criado_em timestamptz not null default now()
);

create table core.pessoa_loja (
  pessoa_id int      not null references core.pessoa on delete cascade,
  loja_id   smallint not null references core.loja on delete cascade,
  papel     text     not null references core.papel,
  primary key (pessoa_id, loja_id)
);

-- Define o PIN (4 a 6 dígitos). Recusa PIN repetido entre pessoas que dividem uma loja.
create function core.definir_pin(p_pessoa int, p_pin text) returns void
language plpgsql as $$
begin
  if p_pin !~ '^[0-9]{4,6}$' then
    raise exception 'PIN precisa ter de 4 a 6 números';
  end if;
  if exists (
    select 1
    from core.pessoa o
    join core.pessoa_loja ol on ol.pessoa_id = o.id
    join core.pessoa_loja pl on pl.loja_id = ol.loja_id and pl.pessoa_id = p_pessoa
    where o.id <> p_pessoa and o.pin_hash is not null and o.pin_hash = crypt(p_pin, o.pin_hash)
  ) then
    raise exception 'Esse PIN já é de outra pessoa da mesma loja';
  end if;
  update core.pessoa set pin_hash = crypt(p_pin, gen_salt('bf')) where id = p_pessoa;
end $$;

-- Quem é a pessoa deste PIN nesta loja. Vazio se não existir.
create function core.pessoa_por_pin(p_loja smallint, p_pin text)
returns table (pessoa_id int, nome text, papel text)
language sql stable as $$
  select p.id, p.nome, pl.papel
  from core.pessoa p
  join core.pessoa_loja pl on pl.pessoa_id = p.id and pl.loja_id = p_loja
  where p.ativa and p.pin_hash is not null and p.pin_hash = crypt(p_pin, p.pin_hash)
$$;

-- ---------- Módulos: liga e desliga por loja ----------
-- depende_de: cada item é um módulo, ou alternativas separadas por "|" (basta uma ativa).
-- conflita_com: módulos que não podem ficar ligados junto com este na mesma loja.
create table core.modulo (
  slug         text primary key check (slug ~ '^[a-z0-9_]+$'),
  nome         text not null,
  descricao    text not null,
  depende_de   text[] not null default '{}',
  conflita_com text[] not null default '{}'
);

create table core.loja_modulo (
  loja_id       smallint not null references core.loja on delete cascade,
  modulo        text     not null references core.modulo on delete cascade,
  ativo         boolean  not null default false,
  config        jsonb    not null default '{}',
  atualizado_em timestamptz not null default now(),
  primary key (loja_id, modulo)
);

create function core.modulo_ativo(p_loja smallint, p_modulo text) returns boolean
language sql stable as $$
  select coalesce((select ativo from core.loja_modulo where loja_id = p_loja and modulo = p_modulo), false)
$$;

create function core.checa_modulo() returns trigger
language plpgsql as $$
declare
  dep text;
  ok  boolean;
  m   core.modulo;
begin
  select * into m from core.modulo where slug = new.modulo;
  new.atualizado_em := now();

  if new.ativo then
    foreach dep in array m.depende_de loop
      select bool_or(core.modulo_ativo(new.loja_id, alt)) into ok
      from unnest(string_to_array(dep, '|')) alt;
      if not coalesce(ok, false) then
        raise exception 'O módulo "%" precisa de "%" ligado nesta loja', new.modulo, dep;
      end if;
    end loop;
    if exists (select 1 from unnest(m.conflita_com) c where core.modulo_ativo(new.loja_id, c)) then
      raise exception 'O módulo "%" não pode ficar ligado junto com %', new.modulo, m.conflita_com;
    end if;
  end if;

  if tg_op = 'UPDATE' and old.ativo and not new.ativo then
    -- ninguém ligado pode ficar sem a dependência que está sendo desligada
    if exists (
      select 1
      from core.loja_modulo lm
      join core.modulo o on o.slug = lm.modulo
      cross join lateral unnest(o.depende_de) as req(alternativas)
      where lm.loja_id = new.loja_id and lm.ativo and lm.modulo <> new.modulo
        and new.modulo = any(string_to_array(req.alternativas, '|'))
        and not exists (
          select 1 from unnest(string_to_array(req.alternativas, '|')) alt
          where alt <> new.modulo and core.modulo_ativo(new.loja_id, alt)
        )
    ) then
      raise exception 'Outro módulo ligado depende de "%". Desligue ele antes', new.modulo;
    end if;
  end if;
  return new;
end $$;

create trigger checa_modulo before insert or update on core.loja_modulo
for each row execute function core.checa_modulo();

-- ---------- Catálogo ----------
create table core.categoria (
  id    serial primary key,
  nome  text not null unique,
  ordem int  not null default 0
);

create table core.produto (
  id           serial primary key,
  nome         text not null unique,
  categoria_id int references core.categoria,
  unidade      text not null default 'un',
  preco        numeric(10,2),
  ativo        boolean not null default true,
  -- campos fiscais: só o módulo fiscal usa (NFC-e via emissor terceirizado)
  ncm          text,
  cfop         text,
  csosn        text,
  origem       smallint,
  criado_em    timestamptz not null default now()
);

-- Preço e disponibilidade por loja. Sem linha aqui, vale o preço do produto.
create table core.produto_loja (
  produto_id int      not null references core.produto on delete cascade,
  loja_id    smallint not null references core.loja on delete cascade,
  preco      numeric(10,2),
  ativo      boolean not null default true,
  primary key (produto_id, loja_id)
);

-- Nome do produto em sistemas de fora (ex.: GrandChef) apontando para o produto daqui.
create table core.produto_alias (
  origem       text not null,
  nome_externo text not null,
  produto_id   int  not null references core.produto on delete cascade,
  primary key (origem, nome_externo)
);

-- ---------- Insumos e receitas ----------
create table core.insumo (
  id            serial primary key,
  nome          text not null unique,
  unidade       text not null check (unidade in ('g', 'ml', 'un')),
  embalagem     numeric not null check (embalagem > 0),
  preco         numeric(10,2),
  fornecedor    text,
  atualizado_em date
);

create table core.receita (
  id            serial primary key,
  nome          text not null unique,
  tipo          text not null check (tipo in ('produto', 'base')),
  rende         numeric not null check (rende > 0),
  rende_unidade text not null,
  preco_venda   numeric(10,2),
  onde_produz   text not null default 'cozinha_central' check (onde_produz in ('cozinha_central', 'loja')),
  validade_dias smallint
);

-- Item da receita: um insumo (quantidade na unidade do insumo)
-- ou outra receita (quantidade na unidade de rendimento dela).
create table core.receita_item (
  id             serial primary key,
  receita_id     int not null references core.receita on delete cascade,
  insumo_id      int references core.insumo,
  sub_receita_id int references core.receita,
  quantidade     numeric not null check (quantidade > 0),
  check (num_nonnulls(insumo_id, sub_receita_id) = 1),
  check (sub_receita_id is distinct from receita_id)
);

-- ---------- Calendário ----------
-- Exceções por dia: feriado aberto, dia fechado fora da regra, temporada (fator > 1).
create table core.dia (
  loja_id smallint not null references core.loja on delete cascade,
  data    date not null,
  aberto  boolean,
  fator   numeric(4,2) not null default 1 check (fator > 0),
  motivo  text,
  primary key (loja_id, data)
);

create function core.loja_aberta(p_loja smallint, p_data date) returns boolean
language sql stable as $$
  select coalesce(
    (select aberto from core.dia where loja_id = p_loja and data = p_data),
    not (extract(dow from p_data)::smallint = any (
      coalesce((select dias_fechados from core.loja where id = p_loja), '{}')))
  )
$$;

-- ---------- Registro de eventos (quem fez o quê) ----------
create table core.evento (
  id        bigserial primary key,
  em        timestamptz not null default now(),
  loja_id   smallint references core.loja,
  pessoa_id int references core.pessoa,
  modulo    text references core.modulo,
  tipo      text not null,
  dados     jsonb not null default '{}'
);
create index on core.evento (loja_id, em desc);
