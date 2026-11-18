-- Módulo fiscal: NFC-e por emissor terceirizado (Focus NFe).
-- Fica desligado até o módulo de venda própria existir. A tabela já existe para o contrato ficar claro.

create schema if not exists fiscal;

create table fiscal.nota (
  id            serial primary key,
  pedido_id     bigint not null references venda.pedido,
  loja_id       smallint not null references core.loja,
  provedor      text not null default 'focusnfe',
  referencia    text not null unique,      -- id que enviamos ao emissor
  status        text not null default 'pendente'
                check (status in ('pendente', 'processando', 'autorizada', 'rejeitada', 'cancelada', 'erro')),
  chave         text,
  numero        int,
  serie         int,
  url_danfe     text,
  url_xml       text,
  mensagem      text,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index on fiscal.nota (loja_id, status);
