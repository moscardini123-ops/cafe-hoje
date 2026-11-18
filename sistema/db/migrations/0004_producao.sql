-- Módulo de produção: lista da semana pela venda, registro do que foi feito e remessa para cada loja.
-- Configuração em core.loja_modulo (modulo = 'producao'):
--   margem         margem de segurança sobre a previsão. Padrão 0.10
--   limite_sobra   acima dessa taxa de sobra, a previsão cai na mesma proporção. Padrão 0.15
--   semanas        semanas de histórico. Padrão 4
--   base_loja      slug de outra loja cujo histórico serve de base (loja nova sem histórico)
--   fator          multiplicador sobre a base (ex.: 0.3 = praça vende 30% da estrada). Padrão 1

create schema if not exists producao;

-- Quanto 1 unidade vendida do produto consome do rendimento da receita.
-- Ex.: "fatia de bolo de cenoura" consome 1 fatia de "Bolo de cenoura", que rende 10.
create table producao.produto_receita (
  produto_id int not null references core.produto on delete cascade,
  receita_id int not null references core.receita on delete cascade,
  quantidade numeric not null default 1 check (quantidade > 0),
  primary key (produto_id, receita_id)
);

create table producao.plano (
  id            serial primary key,
  loja_id       smallint not null references core.loja,
  semana_inicio date not null,
  status        text not null default 'rascunho' check (status in ('rascunho', 'aprovado')),
  criado_em     timestamptz not null default now(),
  aprovado_por  int references core.pessoa,
  unique (loja_id, semana_inicio)
);

create table producao.plano_item (
  plano_id          int not null references producao.plano on delete cascade,
  receita_id        int not null references core.receita,
  previsto_unidades numeric not null,      -- na unidade de rendimento (fatias, unidades...)
  sugerido_receitas int not null,          -- quantas vezes fazer a receita
  final_receitas    int,                   -- ajuste da Eliana; vazio = vale a sugestão
  base              jsonb not null default '{}',
  primary key (plano_id, receita_id)
);

create table producao.registro (
  id         serial primary key,
  data       date not null,
  receita_id int not null references core.receita,
  quantidade numeric not null check (quantidade > 0),   -- em receitas feitas
  lote       text,
  validade   date,
  pessoa_id  int references core.pessoa,
  criado_em  timestamptz not null default now()
);

create table producao.remessa (
  id         serial primary key,
  data       date not null,
  loja_id    smallint not null references core.loja,
  receita_id int not null references core.receita,
  quantidade numeric not null check (quantidade > 0),   -- na unidade de rendimento
  pessoa_id  int references core.pessoa,
  criado_em  timestamptz not null default now()
);

create function producao.cfg(p_loja smallint, p_chave text, p_padrao text) returns text
language sql stable as $$
  select coalesce(
    (select config ->> p_chave from core.loja_modulo where loja_id = p_loja and modulo = 'producao'),
    p_padrao)
$$;

-- Previsão de venda por produto e dia, para os dias abertos do período.
-- Média dos últimos N dias normais do mesmo dia da semana (dia sem venda do produto conta como zero),
-- vezes o fator do dia (temporada, feriado) e o fator da loja.
create function producao.previsao(p_loja smallint, p_inicio date, p_dias int default 7)
returns table (data date, produto_id int, previsto numeric, dias_base int)
language sql stable as $$
  with cfg as (
    select coalesce(
             (select id from core.loja where slug = producao.cfg(p_loja, 'base_loja', null)),
             p_loja) as fonte,
           producao.cfg(p_loja, 'fator', '1')::numeric   as fator,
           producao.cfg(p_loja, 'semanas', '4')::int      as semanas
  ),
  alvo as (
    select d::date as data, coalesce(x.fator, 1) as fator_dia
    from generate_series(p_inicio, p_inicio + p_dias - 1, interval '1 day') d
    left join core.dia x on x.loja_id = p_loja and x.data = d::date
    where core.loja_aberta(p_loja, d::date)
  ),
  historico as (
    select r.data
    from venda.resumo_dia r, cfg
    where r.loja_id = cfg.fonte and r.data < p_inicio and r.pedidos > 0
      and core.loja_aberta(cfg.fonte, r.data)
      and coalesce((select x.fator from core.dia x where x.loja_id = cfg.fonte and x.data = r.data), 1) = 1
  ),
  base as (
    select a.data, h.data as hdata
    from alvo a, cfg
    cross join lateral (
      select data from historico
      where extract(dow from data) = extract(dow from a.data)
      order by data desc
      limit cfg.semanas
    ) h
  ),
  n as (select data, count(*) as dias from base group by data)
  select a.data, pd.produto_id,
         round(sum(pd.quantidade) / n.dias * a.fator_dia * cfg.fator, 2),
         n.dias::int
  from alvo a
  cross join cfg
  join n on n.data = a.data
  join base b on b.data = a.data
  join venda.produto_dia pd on pd.loja_id = cfg.fonte and pd.data = b.hdata
  group by a.data, pd.produto_id, a.fator_dia, cfg.fator, n.dias
$$;

-- Taxa de sobra do produto nas últimas 4 semanas: sobra / vendido. Nula sem registro de sobra.
create function producao.taxa_sobra(p_loja smallint, p_produto int, p_ate date) returns numeric
language sql stable as $$
  with s as (
    select sum(quantidade) as q from sobra.registro
    where loja_id = p_loja and produto_id = p_produto and data >= p_ate - 28 and data < p_ate
  ),
  v as (
    select sum(quantidade) as q from venda.produto_dia
    where loja_id = p_loja and produto_id = p_produto and data >= p_ate - 28 and data < p_ate
  )
  select case when s.q is null or coalesce(v.q, 0) = 0 then null else round(s.q / v.q, 3) end
  from s, v
$$;

-- Gera (ou refaz) o rascunho da lista de produção da semana. Devolve o id do plano.
-- Só entram receitas feitas na cozinha central com produto vinculado.
create function producao.sugerir_plano(p_loja smallint, p_semana_inicio date) returns int
language plpgsql as $$
declare
  v_plano  int;
  v_margem numeric := producao.cfg(p_loja, 'margem', '0.10')::numeric;
  v_limite numeric := producao.cfg(p_loja, 'limite_sobra', '0.15')::numeric;
begin
  if not core.modulo_ativo(p_loja, 'producao') then
    raise exception 'Módulo de produção desligado nesta loja';
  end if;
  if exists (select 1 from producao.plano where loja_id = p_loja and semana_inicio = p_semana_inicio and status = 'aprovado') then
    raise exception 'A lista desta semana já foi aprovada';
  end if;

  delete from producao.plano where loja_id = p_loja and semana_inicio = p_semana_inicio;
  insert into producao.plano (loja_id, semana_inicio) values (p_loja, p_semana_inicio) returning id into v_plano;

  -- Demanda por receita na unidade de rendimento. Receita montada na loja (ex.: pão caipira)
  -- desce para as receitas-base que vêm da cozinha central (ex.: pão caseiro).
  with recursive dem as (
    select pr.receita_id, p.nome as produto,
           sum(f.previsto) as previsto,
           producao.taxa_sobra(p_loja, p.id, p_semana_inicio) as taxa,
           pr.quantidade
    from producao.previsao(p_loja, p_semana_inicio, 7) f
    join core.produto p on p.id = f.produto_id
    join producao.produto_receita pr on pr.produto_id = p.id
    group by pr.receita_id, p.id, p.nome, pr.quantidade
  ),
  arvore as (
    select receita_id, produto, previsto, taxa,
           previsto * quantidade * case when taxa > v_limite then 1 - taxa else 1 end as unidades,
           1 as nivel
    from dem
    union all
    select ri.sub_receita_id, a.produto, a.previsto, a.taxa,
           a.unidades / r.rende * ri.quantidade, a.nivel + 1
    from arvore a
    join core.receita r on r.id = a.receita_id and r.onde_produz = 'loja'
    join core.receita_item ri on ri.receita_id = r.id and ri.sub_receita_id is not null
    where a.nivel < 6
  )
  insert into producao.plano_item (plano_id, receita_id, previsto_unidades, sugerido_receitas, base)
  select v_plano, r.id,
         round(sum(a.unidades), 1),
         ceil(sum(a.unidades) * (1 + v_margem) / r.rende)::int,
         jsonb_build_object(
           'margem', v_margem,
           'produtos', jsonb_agg(jsonb_build_object(
             'produto', a.produto, 'vendido_previsto', a.previsto, 'taxa_sobra', a.taxa,
             'unidades', round(a.unidades, 1)) order by a.unidades desc))
  from arvore a
  join core.receita r on r.id = a.receita_id and r.onde_produz = 'cozinha_central'
  group by r.id, r.rende
  having sum(a.unidades) > 0;

  insert into core.evento (loja_id, modulo, tipo, dados)
  values (p_loja, 'producao', 'plano_sugerido', jsonb_build_object('plano', v_plano, 'semana', p_semana_inicio));
  return v_plano;
end $$;

-- Total da cozinha central na semana, somando as lojas.
create view producao.semana_total as
select p.semana_inicio, r.nome as receita, r.rende, r.rende_unidade,
       sum(coalesce(i.final_receitas, i.sugerido_receitas)) as receitas,
       jsonb_object_agg(l.slug, coalesce(i.final_receitas, i.sugerido_receitas)) as por_loja
from producao.plano p
join producao.plano_item i on i.plano_id = p.id
join core.receita r on r.id = i.receita_id
join core.loja l on l.id = p.loja_id
group by p.semana_inicio, r.id, r.nome, r.rende, r.rende_unidade;
