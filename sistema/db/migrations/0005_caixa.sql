-- Módulo de caixa conferido: contagem no fechamento comparada com o que a venda registrou.
-- Configuração em core.loja_modulo (modulo = 'caixa'):
--   limite_diferenca   acima disso exige justificativa. Padrão 20 (reais)

create schema if not exists caixa;

create table caixa.fechamento (
  id            serial primary key,
  loja_id       smallint not null references core.loja,
  data          date not null,
  pessoa_id     int not null references core.pessoa,
  fundo_troco   numeric(10,2) not null default 0,   -- dinheiro que já estava na gaveta ao abrir
  dinheiro      numeric(10,2) not null default 0,   -- contado na gaveta ao fechar
  credito       numeric(10,2) not null default 0,   -- relatório da maquininha
  debito        numeric(10,2) not null default 0,
  pix           numeric(10,2) not null default 0,
  outros        numeric(10,2) not null default 0,
  sangrias      numeric(10,2) not null default 0,   -- dinheiro retirado da gaveta no dia
  justificativa text check (justificativa in ('troco', 'venda_nao_lancada', 'sangria_nao_registrada', 'forma_trocada', 'outro')),
  observacao    text,
  criado_em     timestamptz not null default now(),
  unique (loja_id, data),
  check (justificativa <> 'outro' or nullif(trim(observacao), '') is not null)
);

-- Conferência do dia. Dinheiro esperado na gaveta = fundo + vendas em dinheiro - sangrias.
create view caixa.conferencia as
with s as (
  select loja_id, data,
         sum(valor) filter (where forma = 'dinheiro') as dinheiro,
         sum(valor) filter (where forma = 'credito')  as credito,
         sum(valor) filter (where forma = 'debito')   as debito,
         sum(valor) filter (where forma = 'pix')      as pix,
         sum(valor) filter (where forma = 'outros')   as outros
  from venda.pagamento_dia
  group by loja_id, data
),
d as (
  select f.*,
         s.loja_id is not null as tem_venda,
         f.dinheiro - (f.fundo_troco + coalesce(s.dinheiro, 0) - f.sangrias) as dif_dinheiro,
         f.credito - coalesce(s.credito, 0) as dif_credito,
         f.debito  - coalesce(s.debito, 0)  as dif_debito,
         f.pix     - coalesce(s.pix, 0)     as dif_pix,
         f.outros  - coalesce(s.outros, 0)  as dif_outros,
         coalesce((select (config ->> 'limite_diferenca')::numeric from core.loja_modulo
                   where loja_id = f.loja_id and modulo = 'caixa'), 20) as limite
  from caixa.fechamento f
  left join s on s.loja_id = f.loja_id and s.data = f.data
)
select d.*,
       dif_dinheiro + dif_credito + dif_debito + dif_pix + dif_outros as diferenca,
       case
         when not tem_venda then 'aguardando_venda'
         when abs(dif_dinheiro + dif_credito + dif_debito + dif_pix + dif_outros) <= limite then 'ok'
         when justificativa is not null then 'justificado'
         else 'pendente'
       end as situacao
from d;
