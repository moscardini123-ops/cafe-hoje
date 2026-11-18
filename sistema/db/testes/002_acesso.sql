-- Testes de acesso: cada login só vê a própria loja, ninguém grava direto e toda ação pede PIN.
-- Roda depois de 001_regras.sql, no mesmo banco, e usa os dados que ele criou.
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

-- Troca quem está logado (imita o token do Supabase).
create function pg_temp.logar(p_sub text) returns void
language sql as $$ select set_config('request.jwt.claims', json_build_object('sub', p_sub)::text, false) $$;

-- ---------- Preparação (como dono do banco) ----------
-- Pessoas da praça: C cozinha (4321), D caixa (1111). E é gestão.
insert into core.pessoa (nome) values ('Pessoa C'), ('Pessoa D'), ('Pessoa E');
insert into core.pessoa_loja values (3, 2, 'cozinha'), (4, 2, 'caixa'), (5, 1, 'gestao');
select core.definir_pin(3, '4321');
select core.definir_pin(4, '1111');

insert into auth.users (id) values
  ('00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000002'),
  ('00000000-0000-0000-0000-000000000003');
insert into core.usuario (auth_id, tipo, loja_id, pessoa_id, nome) values
  ('00000000-0000-0000-0000-000000000001', 'dispositivo', 1, null, 'Tablet estrada'),
  ('00000000-0000-0000-0000-000000000002', 'dispositivo', 2, null, 'Tablet praça'),
  ('00000000-0000-0000-0000-000000000003', 'pessoa', null, 5, 'Gestão');

select id as plano_praca from producao.plano where loja_id = 2 \gset
grant execute on function pg_temp.igual(text, anyelement, anyelement), pg_temp.falha(text, text, text), pg_temp.logar(text) to anon, authenticated;

-- ---------- Sem login ----------
set role anon;
select pg_temp.falha('sem login não lê nada', $$select count(*) from core.loja$$, 'permission denied');
reset role;

-- ---------- Tablet da estrada ----------
set role authenticated;
select pg_temp.logar('00000000-0000-0000-0000-000000000001');

select pg_temp.igual('estrada: enxerga só a própria loja', core.lojas_visiveis(), '{1}'::smallint[]);
select pg_temp.igual('estrada: catálogo de lojas é de todos', (select count(*) from core.loja), 2::bigint);
select pg_temp.igual('estrada: só a própria lista de produção', (select count(*) from producao.plano), 1::bigint);
select pg_temp.igual('estrada: itens da lista da praça não aparecem',
  (select count(*) from producao.plano_item where plano_id = :plano_praca), 0::bigint);
select pg_temp.igual('estrada: pessoas só da própria loja', (select count(*) from core.pessoa), 3::bigint);
select pg_temp.falha('ninguém lê o PIN guardado', $$select pin_hash from core.pessoa$$, 'permission denied');
select pg_temp.falha('ninguém grava direto na tabela',
  $$insert into sobra.registro (loja_id, data, produto_id, quantidade, destino) values (1, current_date, 1, 1, 'equipe')$$,
  'permission denied');
select pg_temp.falha('ninguém define PIN pela tela', $$select core.definir_pin(1, '9999')$$, 'permission denied');

select pg_temp.igual('entrar com PIN devolve a pessoa', (select nome from core.entrar(1::smallint, '1234')), 'Pessoa A'::text);
select pg_temp.falha('entrar com PIN errado', $$select * from core.entrar(1::smallint, '0000')$$, 'PIN não reconhecido');
select pg_temp.falha('PIN de outra loja não vale aqui', $$select * from core.entrar(1::smallint, '4321')$$, 'PIN não reconhecido');

select pg_temp.igual('sobra: registra pelo PIN',
  sobra.registrar(1::smallint, '1234', current_date,
    '[{"produto_id": 1, "quantidade": 3, "destino": "equipe"}, {"produto_id": 2, "quantidade": 0, "destino": "equipe"}]'), 1);
select pg_temp.igual('sobra: registrar de novo substitui o dia',
  sobra.registrar(1::smallint, '5678', current_date, '[{"produto_id": 1, "quantidade": 2, "destino": "doacao"}]'), 1);
select pg_temp.igual('sobra: fica uma linha só', (select count(*) from sobra.registro where data = current_date), 1::bigint);
select pg_temp.igual('sobra: fica registrado quem fez',
  (select count(*) from core.evento where tipo = 'sobra_registrada' and pessoa_id = 2), 1::bigint);
select pg_temp.falha('sobra: PIN errado',
  $$select sobra.registrar(1::smallint, '0000', current_date, '[]')$$, 'PIN não reconhecido');
select pg_temp.falha('sobra: outra loja',
  $$select sobra.registrar(2::smallint, '4321', current_date, '[]')$$, 'Sem acesso a esta loja');
select pg_temp.falha('sobra: mais de 7 dias atrás',
  $$select sobra.registrar(1::smallint, '1234', current_date - 8, '[]')$$, 'últimos 7 dias');

select pg_temp.falha('caixa: cozinha não fecha caixa',
  $$select caixa.fechar(1::smallint, '5678', current_date, '{"dinheiro": 100}')$$, 'Sem permissão');
select pg_temp.igual('caixa: fecha e espera a venda do robô',
  caixa.fechar(1::smallint, '1234', current_date, '{"fundo_troco": 100, "dinheiro": 350}'), 'aguardando_venda'::text);
select pg_temp.falha('caixa: mais de 3 dias atrás',
  $$select caixa.fechar(1::smallint, '1234', current_date - 4, '{}')$$, 'últimos 3 dias');

select pg_temp.falha('módulos: só a gestão liga e desliga',
  $$select core.ligar_modulo(1::smallint, 'compras', false)$$, 'Só a gestão');
select pg_temp.falha('produção: só a gestão gera a lista',
  $$select producao.gerar(1::smallint, '2026-12-09')$$, 'Só a gestão');
select pg_temp.falha('produção: não aprova lista de outra loja',
  format('select producao.aprovar(%s, %L)', :plano_praca, '1234'), 'Sem acesso a esta loja');
reset role;

-- ---------- Tablet da praça ----------
set role authenticated;
select pg_temp.logar('00000000-0000-0000-0000-000000000002');

select pg_temp.igual('praça: enxerga só a própria loja', core.lojas_visiveis(), '{2}'::smallint[]);
select pg_temp.igual('praça: não vê o caixa da estrada', (select count(*) from caixa.fechamento), 0::bigint);
select pg_temp.igual('praça: não vê a sobra da estrada', (select count(*) from sobra.registro), 0::bigint);
select pg_temp.falha('produção: caixa não aprova a lista',
  format('select producao.aprovar(%s, %L)', :plano_praca, '1111'), 'Sem permissão');
select producao.aprovar(:plano_praca, '4321', '{"1": 4}');
select pg_temp.igual('produção: ajuste da cozinha vale',
  (select final_receitas from producao.plano_item where plano_id = :plano_praca and receita_id = 1), 4);
select pg_temp.igual('produção: lista aprovada por quem pôs o PIN',
  (select aprovado_por from producao.plano where id = :plano_praca), 3);
select pg_temp.falha('produção: não aprova duas vezes',
  format('select producao.aprovar(%s, %L)', :plano_praca, '4321'), 'já foi aprovada');
reset role;

-- ---------- Gestão ----------
set role authenticated;
select pg_temp.logar('00000000-0000-0000-0000-000000000003');

select pg_temp.igual('gestão: enxerga as duas lojas', core.lojas_visiveis(), '{1,2}'::smallint[]);
select pg_temp.igual('gestão: vê as duas listas', (select count(*) from producao.plano), 2::bigint);
select core.ligar_modulo(2::smallint, 'sobra', false);
select pg_temp.falha('módulos: dependência continua valendo pela tela',
  $$select core.ligar_modulo(1::smallint, 'producao', false)$$, 'depende de "producao"');
select pg_temp.igual('gestão: gera a lista da semana seguinte',
  (producao.gerar(1::smallint, '2026-12-09') is not null), true);
reset role;

-- Módulo desligado bloqueia a ação na loja
set role authenticated;
select pg_temp.logar('00000000-0000-0000-0000-000000000002');
select pg_temp.falha('sobra desligada na praça',
  $$select sobra.registrar(2::smallint, '4321', current_date, '[]')$$, 'desligado');
reset role;

-- O robô (service_role) grava direto
set role service_role;
insert into venda.pagamento_dia values (2, current_date, 'pix', 10);
reset role;
select pg_temp.igual('robô grava direto', (select count(*) from venda.pagamento_dia where loja_id = 2), 1::bigint);

\echo 'Testes de acesso passaram.'
