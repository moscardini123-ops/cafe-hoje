-- Testes das regras do banco com dados inventados. Para no primeiro erro.
\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned

create function pg_temp.igual(p_rotulo text, p_obtido anyelement, p_esperado anyelement) returns void
language plpgsql as $$
begin
  if p_obtido is distinct from p_esperado then
    raise exception 'FALHOU %: obtido %, esperado %', p_rotulo, p_obtido, p_esperado;
  end if;
  raise notice 'ok  %', p_rotulo;
end $$;

-- Executa um comando que precisa falhar com uma mensagem contendo p_trecho.
create function pg_temp.falha(p_rotulo text, p_sql text, p_trecho text) returns void
language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if position(p_trecho in sqlerrm) > 0 then
      raise notice 'ok  %', p_rotulo;
      return;
    end if;
    raise exception 'FALHOU %: erro inesperado: %', p_rotulo, sqlerrm;
  end;
  raise exception 'FALHOU %: devia ter dado erro', p_rotulo;
end $$;

-- ---------- Módulos ----------
select pg_temp.falha('conflito: GrandChef e venda própria juntos',
  $$update core.loja_modulo set ativo = true where loja_id = 1 and modulo = 'venda_propria';
    insert into core.loja_modulo (loja_id, modulo, ativo) values (1, 'venda_propria', true)$$,
  'não pode ficar ligado junto');
select pg_temp.falha('fiscal precisa de venda própria',
  $$insert into core.loja_modulo (loja_id, modulo, ativo) values (1, 'fiscal', true)$$,
  'precisa de "venda_propria"');
select pg_temp.falha('não desliga produção com compras ligado',
  $$update core.loja_modulo set ativo = false where loja_id = 1 and modulo = 'producao'$$,
  'depende de "producao"');
select pg_temp.igual('loja estrada fecha terça', core.loja_aberta(1::smallint, '2026-12-08'), false);
select pg_temp.igual('loja estrada abre quarta', core.loja_aberta(1::smallint, '2026-12-09'), true);

-- ---------- PIN ----------
insert into core.pessoa (nome) values ('Pessoa A'), ('Pessoa B');
insert into core.pessoa_loja values (1, 1, 'caixa'), (2, 1, 'cozinha');
select core.definir_pin(1, '1234');
select pg_temp.falha('PIN repetido na mesma loja', $$select core.definir_pin(2, '1234')$$, 'já é de outra pessoa');
select pg_temp.falha('PIN curto', $$select core.definir_pin(2, '12')$$, 'de 4 a 6 números');
select core.definir_pin(2, '5678');
select pg_temp.igual('PIN encontra a pessoa', (select nome from core.pessoa_por_pin(1::smallint, '1234')), 'Pessoa A'::text);
select pg_temp.igual('PIN errado não encontra', (select count(*) from core.pessoa_por_pin(1::smallint, '0000')), 0::bigint);

-- ---------- Catálogo, receitas e histórico de venda ----------
insert into core.insumo (nome, unidade, embalagem, preco, fornecedor) values
  ('Farinha', 'g', 1000, 6.00, 'Mercado A'),
  ('Chocolate', 'g', 1000, 40.00, 'Mercado B');
insert into core.receita (nome, tipo, rende, rende_unidade) values
  ('Bolo de cenoura', 'produto', 10, 'fatias'),
  ('Cobertura', 'base', 1000, 'g');
insert into core.receita_item (receita_id, insumo_id, quantidade) values (1, 1, 300), (2, 2, 500);
insert into core.receita_item (receita_id, sub_receita_id, quantidade) values (1, 2, 200);
insert into core.produto (nome) values ('Fatia bolo de cenoura'), ('Pão caipira');
insert into producao.produto_receita values (1, 1, 1);
insert into core.receita (nome, tipo, rende, rende_unidade, onde_produz) values
  ('Pão caseiro', 'base', 20, 'fatias', 'cozinha_central'),   -- id 3
  ('Pão caipira', 'produto', 1, 'unidades', 'loja');          -- id 4
insert into core.receita_item (receita_id, sub_receita_id, quantidade) values (4, 3, 2);
insert into producao.produto_receita values (2, 4, 1);

-- 28 dias antes de quarta 02/12: 10 fatias por dia aberto
insert into venda.resumo_dia (loja_id, data, faturamento, pedidos)
select 1, d::date, 100, 10 from generate_series('2026-11-04'::date, '2026-12-01', interval '1 day') d
where extract(dow from d) <> 2;
insert into venda.produto_dia (loja_id, data, produto_id, quantidade, valor)
select loja_id, data, p, 10, 100 from venda.resumo_dia, (values (1), (2)) v(p);

-- ---------- Produção ----------
select pg_temp.igual('previsão: 6 dias abertos na estrada',
  (select count(*) from producao.previsao(1::smallint, '2026-12-02', 7) where produto_id = 1), 6::bigint);
select pg_temp.igual('previsão: 60 fatias na semana',
  (select sum(previsto) from producao.previsao(1::smallint, '2026-12-02', 7) where produto_id = 1), 60.00::numeric);

select producao.sugerir_plano(1::smallint, '2026-12-02');
select pg_temp.igual('sem sobra: 60 × 1,10 / 10 = 7 bolos',
  (select sugerido_receitas from producao.plano_item i join producao.plano p on p.id = i.plano_id
   where p.loja_id = 1 and p.semana_inicio = '2026-12-02' and i.receita_id = 1), 7);

-- Sobra de 25% nas últimas 4 semanas: a previsão cai para 45 fatias
insert into sobra.registro (loja_id, data, produto_id, quantidade, destino, motivo)
values (1, '2026-11-29', 1, 60, 'descarte', 'venceu');
select producao.sugerir_plano(1::smallint, '2026-12-02');
select pg_temp.igual('sobra 25%: 45 × 1,10 / 10 = 5 bolos',
  (select sugerido_receitas from producao.plano_item i join producao.plano p on p.id = i.plano_id
   where p.loja_id = 1 and p.semana_inicio = '2026-12-02' and i.receita_id = 1), 5);

-- Praça usa a estrada × 0,3 e não tem base para terça (a estrada fecha)
select producao.sugerir_plano(2::smallint, '2026-12-02');
select pg_temp.igual('praça: 6 × 10 × 0,3 = 18 fatias',
  (select previsto_unidades from producao.plano_item i join producao.plano p on p.id = i.plano_id
   where p.loja_id = 2 and i.receita_id = 1), 18.0);
select pg_temp.igual('praça: 18 × 1,15 / 10 = 3 bolos',
  (select sugerido_receitas from producao.plano_item i join producao.plano p on p.id = i.plano_id
   where p.loja_id = 2 and i.receita_id = 1), 3);
select pg_temp.igual('total da cozinha: 5 + 3 bolos',
  (select receitas from producao.semana_total where semana_inicio = '2026-12-02' and receita = 'Bolo de cenoura'), 8::bigint);

select pg_temp.igual('pão caipira da loja vira pão caseiro da cozinha: 60 × 2 = 120 fatias',
  (select previsto_unidades from producao.plano_item i join producao.plano p on p.id = i.plano_id
   where p.loja_id = 1 and i.receita_id = 3), 120.0);
select pg_temp.igual('pão caseiro: 120 × 1,10 / 20 = 7 receitas',
  (select sugerido_receitas from producao.plano_item i join producao.plano p on p.id = i.plano_id
   where p.loja_id = 1 and i.receita_id = 3), 7);
select pg_temp.igual('receita feita na loja não entra na lista',
  (select count(*) from producao.plano_item i join producao.plano p on p.id = i.plano_id
   where p.loja_id = 1 and i.receita_id = 4), 0::bigint);

update producao.plano set status = 'aprovado' where loja_id = 1;
select pg_temp.falha('lista aprovada não é refeita',
  $$select producao.sugerir_plano(1::smallint, '2026-12-02')$$, 'já foi aprovada');

-- ---------- Compras ----------
-- 5 bolos: farinha 5 × 300 = 1500 g; cobertura 5 × 200 / 1000 = 1 vez → chocolate 500 g
select pg_temp.igual('compras: farinha 1500 g',
  (select quantidade from compras.necessidade((select id from producao.plano where loja_id = 1)) where insumo = 'Farinha'), 1500.0);
select pg_temp.igual('compras: 2 pacotes de farinha',
  (select embalagens from compras.necessidade((select id from producao.plano where loja_id = 1)) where insumo = 'Farinha'), 2);
select pg_temp.igual('compras: chocolate da receita-base 500 g',
  (select quantidade from compras.necessidade((select id from producao.plano where loja_id = 1)) where insumo = 'Chocolate'), 500.0);

-- ---------- Sobra ----------
select pg_temp.falha('descarte sem motivo',
  $$insert into sobra.registro (loja_id, data, produto_id, quantidade, destino) values (1, '2026-12-02', 1, 3, 'descarte')$$,
  'check');
select pg_temp.falha('motivo "outro" sem texto',
  $$insert into sobra.registro (loja_id, data, produto_id, quantidade, destino, motivo) values (1, '2026-12-02', 1, 3, 'descarte', 'outro')$$,
  'check');

-- ---------- Caixa ----------
insert into venda.pagamento_dia values (1, '2026-12-02', 'dinheiro', 500), (1, '2026-12-02', 'credito', 1000),
                                       (1, '2026-12-03', 'dinheiro', 500);
-- esperado na gaveta: 100 + 500 - 150 = 450; crédito 10 a menos: dentro do limite
insert into caixa.fechamento (loja_id, data, pessoa_id, fundo_troco, dinheiro, credito, sangrias)
values (1, '2026-12-02', 1, 100, 450, 990, 150);
select pg_temp.igual('caixa: diferença de -10', (select diferenca from caixa.conferencia where data = '2026-12-02'), -10.00::numeric);
select pg_temp.igual('caixa: dentro do limite', (select situacao from caixa.conferencia where data = '2026-12-02'), 'ok'::text);
insert into caixa.fechamento (loja_id, data, pessoa_id, dinheiro) values (1, '2026-12-03', 1, 450);
select pg_temp.igual('caixa: 50 a menos fica pendente', (select situacao from caixa.conferencia where data = '2026-12-03'), 'pendente'::text);
update caixa.fechamento set justificativa = 'troco' where data = '2026-12-03';
select pg_temp.igual('caixa: justificado', (select situacao from caixa.conferencia where data = '2026-12-03'), 'justificado'::text);
insert into caixa.fechamento (loja_id, data, pessoa_id, dinheiro) values (1, '2026-12-04', 1, 0);
select pg_temp.igual('caixa: sem venda ainda', (select situacao from caixa.conferencia where data = '2026-12-04'), 'aguardando_venda'::text);

\echo 'Todos os testes passaram.'
