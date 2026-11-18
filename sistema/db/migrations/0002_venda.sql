-- Módulo de venda: o contrato que qualquer fonte de venda cumpre.
-- Hoje a fonte é o GrandChef (robô, só leitura). Depois pode ser o PDV próprio.
-- Painel, produção e caixa leem só estas tabelas, nunca a fonte direto.

create schema if not exists venda;

create table venda.pedido (
  id             bigserial primary key,
  loja_id        smallint not null references core.loja,
  origem         text not null,                -- 'grandchef' | 'proprio'
  codigo_externo text not null,
  criado_em      timestamptz not null,
  concluido_em   timestamptz,
  canal          text,                         -- balcao, mesa, qrcode, comanda
  estado         text not null,
  total          numeric(10,2) not null,
  unique (origem, codigo_externo)
);
create index on venda.pedido (loja_id, criado_em);

create table venda.pedido_item (
  id         bigserial primary key,
  pedido_id  bigint not null references venda.pedido on delete cascade,
  produto_id int references core.produto,
  descricao  text not null,
  quantidade numeric not null,
  valor      numeric(10,2) not null
);

create table venda.pedido_pagamento (
  id        bigserial primary key,
  pedido_id bigint not null references venda.pedido on delete cascade,
  forma     text not null check (forma in ('dinheiro', 'credito', 'debito', 'pix', 'outros')),
  valor     numeric(10,2) not null
);

-- Agregados por dia: a base do painel, da produção e da conferência do caixa.
create table venda.resumo_dia (
  loja_id       smallint not null references core.loja,
  data          date not null,
  faturamento   numeric(12,2) not null,
  pedidos       int not null,
  cancelados    int not null default 0,
  descontos     numeric(10,2) not null default 0,
  por_hora      jsonb not null default '{}',
  atualizado_em timestamptz not null default now(),
  primary key (loja_id, data)
);

create table venda.produto_dia (
  loja_id    smallint not null references core.loja,
  data       date not null,
  produto_id int not null references core.produto,
  quantidade numeric not null,
  valor      numeric(10,2) not null,
  primary key (loja_id, data, produto_id)
);

create table venda.pagamento_dia (
  loja_id smallint not null references core.loja,
  data    date not null,
  forma   text not null check (forma in ('dinheiro', 'credito', 'debito', 'pix', 'outros')),
  valor   numeric(10,2) not null,
  primary key (loja_id, data, forma)
);
