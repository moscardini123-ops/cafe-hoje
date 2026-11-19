-- Testes das funções das telas. Roda depois de 002_acesso.sql e usa os mesmos logins.
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
    if position(p_trecho in sqlerrm) > 0 then raise notice 'ok  %', p_rotulo; return; end if;
    raise exception 'FALHOU %: erro inesperado: %', p_rotulo, sqlerrm;
  end;
  raise exception 'FALHOU %: devia ter dado erro', p_rotulo;
end $$;
create function pg_temp.logar(p_sub text) returns void
language sql as $$ select set_config('request.jwt.claims', json_build_object('sub', p_sub)::text, false) $$;
grant execute on function pg_temp.igual(text, anyelement, anyelement), pg_temp.falha(text, text, text), pg_temp.logar(text) to anon, authenticated;

set role anon;
select pg_temp.falha('sem login não chama as telas', $$select core.eu()$$, 'permission denied');
reset role;

-- Gestão (Pessoa E, ainda sem PIN)
set role authenticated;
select pg_temp.logar('00000000-0000-0000-0000-000000000003');
select pg_temp.igual('eu: nome do login', core.eu() ->> 'nome', 'Gestão'::text);
select pg_temp.igual('eu: gestão vê as duas lojas', jsonb_array_length(core.eu() -> 'lojas'), 2);
select pg_temp.igual('eu: ainda sem PIN', (core.eu() ->> 'tem_pin')::boolean, false);
select core.meu_pin('2468');
select pg_temp.igual('eu: PIN criado', (core.eu() ->> 'tem_pin')::boolean, true);
select pg_temp.igual('PIN novo já entra', (select nome from core.entrar(1::smallint, '2468')), 'Pessoa E'::text);
select pg_temp.falha('trocar PIN pede o atual', $$select core.meu_pin('1357')$$, 'PIN atual não confere');
select pg_temp.falha('trocar PIN com atual errado', $$select core.meu_pin('1357', '0000')$$, 'PIN atual não confere');
select core.meu_pin('1357', '2468');
select pg_temp.igual('PIN trocado', (select nome from core.entrar(1::smallint, '1357')), 'Pessoa E'::text);
select pg_temp.falha('PIN igual ao de outra pessoa da loja', $$select core.meu_pin('1234', '1357')$$, 'já é de outra pessoa');

select pg_temp.igual('lista: pega a semana mais recente', producao.lista(1::smallint) -> 'plano' ->> 'semana_inicio', '2026-12-09'::text);
select pg_temp.igual('lista: semana pedida', producao.lista(1::smallint, '2026-12-02') -> 'plano' ->> 'status', 'aprovado'::text);
select pg_temp.igual('lista: traz os itens', jsonb_array_length(producao.lista(1::smallint, '2026-12-02') -> 'itens') > 0, true);
select pg_temp.igual('lista: quem aprovou na praça', producao.lista(2::smallint) -> 'plano' ->> 'aprovado_por', 'Pessoa C'::text);
reset role;

-- Tablet da estrada
set role authenticated;
select pg_temp.logar('00000000-0000-0000-0000-000000000001');
select pg_temp.falha('aparelho não cria PIN', $$select core.meu_pin('9753')$$, 'Só login pessoal');
select pg_temp.igual('lista de outra loja vem vazia', producao.lista(2::smallint), null::jsonb);
reset role;

\echo 'Testes das telas passaram.'
