-- Funções que as telas usam para saber quem está logado, criar o PIN e montar a lista de produção.

-- Quem está logado e quais lojas enxerga. Nunca devolve o PIN, só se ele já existe.
create function core.eu() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'nome', u.nome,
    'tipo', u.tipo,
    'pessoa_id', u.pessoa_id,
    'gestao', core.sou_gestao(),
    'tem_pin', coalesce((select p.pin_hash is not null from core.pessoa p where p.id = u.pessoa_id), false),
    'lojas', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'slug', l.slug, 'nome', l.nome) order by l.id)
                       from core.loja l where l.id = any (core.lojas_visiveis())), '[]'))
  from core.usuario u
  where u.auth_id = auth.uid() and u.ativo
$$;

-- Cria ou troca o PIN de quem está logado com login pessoal. Para trocar, pede o PIN atual.
create function core.meu_pin(p_novo text, p_atual text default null) returns void
language plpgsql security definer set search_path = extensions, public as $$
declare
  v_pessoa int;
  v_hash   text;
begin
  select u.pessoa_id into v_pessoa from core.usuario u
  where u.auth_id = auth.uid() and u.ativo and u.tipo = 'pessoa';
  if v_pessoa is null then
    raise exception 'Só login pessoal cria PIN';
  end if;
  select pin_hash into v_hash from core.pessoa where id = v_pessoa;
  if v_hash is not null and (p_atual is null or v_hash <> crypt(p_atual, v_hash)) then
    raise exception 'PIN atual não confere';
  end if;
  perform core.definir_pin(v_pessoa, p_novo);
  insert into core.evento (pessoa_id, tipo) values (v_pessoa, 'pin_definido');
end $$;

-- Lista de produção de uma loja: a da semana pedida ou, sem semana, a mais recente.
-- Roda com as permissões de quem chama: só devolve lojas visíveis.
create function producao.lista(p_loja smallint, p_semana date default null) returns jsonb
language sql stable set search_path = '' as $$
  with p as (
    select * from producao.plano
    where loja_id = p_loja and (p_semana is null or semana_inicio = p_semana)
    order by semana_inicio desc limit 1
  )
  select jsonb_build_object(
    'plano', jsonb_build_object(
      'id', p.id, 'semana_inicio', p.semana_inicio, 'status', p.status,
      'aprovado_por', (select nome from core.pessoa where id = p.aprovado_por)),
    'itens', coalesce((
      select jsonb_agg(jsonb_build_object(
               'receita_id', r.id, 'nome', r.nome, 'rende', r.rende, 'rende_unidade', r.rende_unidade,
               'previsto', round(i.previsto_unidades, 1), 'sugerido', i.sugerido_receitas,
               'final', i.final_receitas, 'produtos', coalesce(i.base -> 'produtos', '[]'))
             order by coalesce(i.final_receitas, i.sugerido_receitas) desc, r.nome)
      from producao.plano_item i join core.receita r on r.id = i.receita_id
      where i.plano_id = p.id), '[]'))
  from p
$$;

revoke execute on function core.eu(), core.meu_pin(text, text), producao.lista(smallint, date) from public;
grant execute on function core.eu(), core.meu_pin(text, text), producao.lista(smallint, date) to authenticated;
