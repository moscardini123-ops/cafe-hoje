-- Módulo de sobra e perda: o que sobrou no fim do dia, para onde foi e por quê.
-- A produção usa a taxa de sobra para reduzir a lista da semana seguinte.

create schema if not exists sobra;

create table sobra.registro (
  id          serial primary key,
  loja_id     smallint not null references core.loja,
  data        date not null,
  produto_id  int not null references core.produto,
  quantidade  numeric not null check (quantidade >= 0),   -- na unidade de venda (fatia, unidade)
  destino     text not null check (destino in ('vende_amanha', 'equipe', 'doacao', 'descarte')),
  motivo      text check (motivo in ('venceu', 'queimou_estragou', 'caiu_quebrou', 'outro')),
  observacao  text,
  pessoa_id   int references core.pessoa,
  criado_em   timestamptz not null default now(),
  unique (loja_id, data, produto_id, destino),
  check (destino <> 'descarte' or motivo is not null),
  check (motivo <> 'outro' or nullif(trim(observacao), '') is not null)
);
create index on sobra.registro (loja_id, produto_id, data);
