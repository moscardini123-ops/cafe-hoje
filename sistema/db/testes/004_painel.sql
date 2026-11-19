-- Robô gravando o dia e Painel lendo. Roda depois dos outros testes.
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
create function pg_temp.falha(p_rotulo text, p_sql text, p_trecho text) returns void
language plpgsql as $$
begin
  begin execute p_sql;
  exception when others then
    if position(p_trecho in sqlerrm) > 0 then raise notice 'ok  %', p_rotulo; return; end if;
    raise exception 'FALHOU %: erro inesperado: %', p_rotulo, sqlerrm;
  end;
  raise exception 'FALHOU %: devia ter dado erro', p_rotulo;
end $$;
create function pg_temp.logar(p_sub text) returns void
language sql as $$ select set_config('request.jwt.claims', json_build_object('sub', p_sub)::text, false) $$;
grant execute on function pg_temp.igual(text, anyelement, anyelement), pg_temp.falha(text, text, text), pg_temp.logar(text) to authenticated, service_role;

select pg_temp.igual('formas: débito', venda.forma_padrao('Cartão de Débito'), 'debito'::text);
select pg_temp.igual('formas: crédito', venda.forma_padrao('CRÉDITO'), 'credito'::text);
select pg_temp.igual('formas: pix', venda.forma_padrao('PIX'), 'pix'::text);
select pg_temp.igual('formas: vale', venda.forma_padrao('Vale refeição'), 'outros'::text);

\set dia '{"dia": "2026-11-17", "resumo": {"faturamento": 300, "pedidos": 3, "cancelados": 1, "descontos": 5}, "porHora": {"9": 100, "10": 200}, "top": [{"descricao": "PAO NOVO", "categoria": "PÃES", "quantidade": 2, "valor": 20}, {"descricao": "Fatia bolo de cenoura", "categoria": null, "quantidade": 4, "valor": 40}], "formas": [{"descricao": "PIX", "valor": 100}, {"descricao": "Cartão de Débito", "valor": 150}, {"descricao": "Débito Elo", "valor": 50}]}'

set role service_role;
select venda.gravar_dia('praca', :'dia'::jsonb);
select venda.gravar_dia('praca', :'dia'::jsonb);
reset role;
select pg_temp.igual('robô: resumo do dia', (select faturamento from venda.resumo_dia where loja_id = 2 and data = '2026-11-17'), 300::numeric);
select pg_temp.igual('robô: produto novo criado com apelido', (select count(*) from core.produto_alias where nome_externo = 'PAO NOVO'), 1::bigint);
select pg_temp.igual('robô: gravar 2 vezes não duplica', (select count(*) from venda.produto_dia where loja_id = 2 and data = '2026-11-17'), 2::bigint);
select pg_temp.igual('robô: débitos somados', (select valor from venda.pagamento_dia where loja_id = 2 and data = '2026-11-17' and forma = 'debito'), 200.00::numeric);
select pg_temp.falha('robô: loja que não existe', $$select venda.gravar_dia('lua', '{"dia": "2026-11-17"}')$$, 'não existe');

set role authenticated;
select pg_temp.logar('00000000-0000-0000-0000-000000000001');
select pg_temp.falha('tela não grava venda', $$select venda.gravar_dia('estrada', '{"dia": "2026-11-17"}')$$, 'permission denied');
select pg_temp.igual('painel: estrada não vê a praça', jsonb_array_length(venda.painel(2::smallint, 100000) -> 'dias'), 0);
reset role;
set role authenticated;
select pg_temp.logar('00000000-0000-0000-0000-000000000002');
select pg_temp.igual('painel: praça vê o dia', (venda.painel(2::smallint, 100000) -> 'dias' -> -1 ->> 'fat')::numeric, 300::numeric);
select pg_temp.igual('painel: formas no formato do painel', (venda.painel(2::smallint, 100000) -> 'dias' -> -1 -> 'formas' ->> 'pix')::numeric, 100::numeric);
select pg_temp.igual('painel: hora', (venda.painel(2::smallint, 100000) -> 'dias' -> -1 -> 'hora' ->> '10')::numeric, 200::numeric);
reset role;
\echo 'Testes do painel passaram.'
