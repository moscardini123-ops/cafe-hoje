-- O robô grava a venda do dia no banco, e o Painel lê daqui.

-- Forma de pagamento do GrandChef ("Cartão de Débito", "PIX"...) → forma do sistema.
create function venda.forma_padrao(p_descricao text) returns text
language sql immutable set search_path = '' as $$
  select case
    when x like '%deb%' then 'debito'
    when x like '%cred%' then 'credito'
    when x like '%dinh%' then 'dinheiro'
    when x like '%pix%' then 'pix'
    else 'outros' end
  from (select lower(translate(coalesce(p_descricao, ''), 'ÉéÍíÃãÁá', 'EeIiAaAa')) as x) t
$$;

-- Grava um dia inteiro coletado pelo robô (substitui o que havia no dia). Só a chave de serviço chama.
-- p_dia: o objeto que o coletor monta {dia, resumo, top, formas, porHora, ...}
create function venda.gravar_dia(p_loja text, p_dia jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_loja smallint;
  v_data date := (p_dia ->> 'dia')::date;
begin
  select id into v_loja from core.loja where slug = p_loja;
  if v_loja is null then
    raise exception 'Loja % não existe', p_loja;
  end if;

  insert into core.categoria (nome)
  select distinct t ->> 'categoria' from jsonb_array_elements(coalesce(p_dia -> 'top', '[]')) t
  where coalesce(t ->> 'categoria', '') <> ''
  on conflict (nome) do nothing;

  insert into core.produto (nome, categoria_id)
  select distinct on (t ->> 'descricao') t ->> 'descricao', c.id
  from jsonb_array_elements(coalesce(p_dia -> 'top', '[]')) t
  left join core.categoria c on c.nome = t ->> 'categoria'
  where coalesce(t ->> 'descricao', '') <> ''
  on conflict (nome) do nothing;

  insert into core.produto_alias (origem, nome_externo, produto_id)
  select distinct 'grandchef', p.nome, p.id
  from jsonb_array_elements(coalesce(p_dia -> 'top', '[]')) t
  join core.produto p on p.nome = t ->> 'descricao'
  on conflict do nothing;

  insert into venda.resumo_dia (loja_id, data, faturamento, pedidos, cancelados, descontos, por_hora, atualizado_em)
  values (v_loja, v_data,
          coalesce((p_dia #>> '{resumo,faturamento}')::numeric, 0), coalesce((p_dia #>> '{resumo,pedidos}')::int, 0),
          coalesce((p_dia #>> '{resumo,cancelados}')::int, 0), coalesce((p_dia #>> '{resumo,descontos}')::numeric, 0),
          coalesce(p_dia -> 'porHora', '{}'), now())
  on conflict (loja_id, data) do update set
    faturamento = excluded.faturamento, pedidos = excluded.pedidos, cancelados = excluded.cancelados,
    descontos = excluded.descontos, por_hora = excluded.por_hora, atualizado_em = now();

  delete from venda.produto_dia where loja_id = v_loja and data = v_data;
  insert into venda.produto_dia (loja_id, data, produto_id, quantidade, valor)
  select v_loja, v_data, a.produto_id, sum((t ->> 'quantidade')::numeric), round(sum((t ->> 'valor')::numeric), 2)
  from jsonb_array_elements(coalesce(p_dia -> 'top', '[]')) t
  join core.produto_alias a on a.origem = 'grandchef' and a.nome_externo = t ->> 'descricao'
  group by a.produto_id;

  delete from venda.pagamento_dia where loja_id = v_loja and data = v_data;
  insert into venda.pagamento_dia (loja_id, data, forma, valor)
  select v_loja, v_data, venda.forma_padrao(f ->> 'descricao'), round(sum((f ->> 'valor')::numeric), 2)
  from jsonb_array_elements(coalesce(p_dia -> 'formas', '[]')) f
  group by 2, 3
  having sum((f ->> 'valor')::numeric) <> 0;
end $$;

-- Dados do Painel, no mesmo formato que a planilha devolvia. Respeita as lojas de quem consulta.
-- A lista de produtos de cada dia só vem nos últimos 60 dias, para a tela abrir rápido no celular.
create function venda.painel(p_loja smallint, p_dias int default 900) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object('dias', coalesce(jsonb_agg(jsonb_build_object(
    'data', r.data, 'fat', r.faturamento, 'ped', r.pedidos, 'canc', r.cancelados, 'desc', r.descontos,
    'hora', r.por_hora,
    'atual', to_char(r.atualizado_em at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI'),
    'formas', (select coalesce(jsonb_object_agg(g.forma, g.valor), '{}') from venda.pagamento_dia g
               where g.loja_id = r.loja_id and g.data = r.data),
    'top', case when r.data > current_date - 60 then
             (select coalesce(jsonb_agg(jsonb_build_object('p', p.nome, 'c', c.nome, 'q', d.quantidade, 'v', d.valor)), '[]')
              from venda.produto_dia d join core.produto p on p.id = d.produto_id
              left join core.categoria c on c.id = p.categoria_id
              where d.loja_id = r.loja_id and d.data = r.data)
           else '[]' end
  ) order by r.data), '[]'))
  from venda.resumo_dia r
  where r.loja_id = p_loja and r.data > current_date - p_dias
$$;

revoke execute on function venda.forma_padrao(text), venda.gravar_dia(text, jsonb), venda.painel(smallint, int) from public;
grant execute on function venda.gravar_dia(text, jsonb) to service_role;
grant execute on function venda.painel(smallint, int) to authenticated, service_role;
grant execute on function venda.forma_padrao(text) to authenticated, service_role;
