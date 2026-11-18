-- Módulo de compras: lista de mercado a partir da lista de produção.
-- Abre as receitas em insumos, inclusive as receitas-base usadas dentro de outras.

create schema if not exists compras;

-- Insumos necessários para um plano de produção.
create function compras.necessidade(p_plano int)
returns table (insumo text, unidade text, quantidade numeric, embalagem numeric, embalagens int, fornecedor text, custo numeric)
language sql stable as $$
  with recursive lotes as (
    -- quantas vezes cada receita será feita
    select i.receita_id, coalesce(i.final_receitas, i.sugerido_receitas)::numeric as vezes, 1 as nivel
    from producao.plano_item i
    where i.plano_id = p_plano
    union all
    -- receita-base dentro de outra: quantidade em unidades de rendimento dela, convertida em vezes
    select ri.sub_receita_id, l.vezes * ri.quantidade / sub.rende, l.nivel + 1
    from lotes l
    join core.receita_item ri on ri.receita_id = l.receita_id and ri.sub_receita_id is not null
    join core.receita sub on sub.id = ri.sub_receita_id
    where l.nivel < 6
  )
  select ins.nome, ins.unidade,
         round(sum(l.vezes * ri.quantidade), 1),
         ins.embalagem,
         ceil(sum(l.vezes * ri.quantidade) / ins.embalagem)::int,
         ins.fornecedor,
         round(ceil(sum(l.vezes * ri.quantidade) / ins.embalagem) * coalesce(ins.preco, 0), 2)
  from lotes l
  join core.receita_item ri on ri.receita_id = l.receita_id and ri.insumo_id is not null
  join core.insumo ins on ins.id = ri.insumo_id
  group by ins.id, ins.nome, ins.unidade, ins.embalagem, ins.fornecedor, ins.preco
  order by ins.fornecedor nulls last, ins.nome
$$;
