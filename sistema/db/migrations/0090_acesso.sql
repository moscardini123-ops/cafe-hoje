-- Quem vê e quem faz o quê.
--
-- Logins (Supabase Auth):
--   dispositivo  um por aparelho da loja (tablet do caixa, celular da cozinha). Vê só a própria loja.
--   pessoa       login pessoal da gestão. Vê as lojas em que tem papel; dona e gestão veem todas.
--
-- Leitura: liberada por RLS, filtrada pelas lojas visíveis.
-- Escrita: nunca direto nas tabelas. Só pelas funções abaixo, que pedem o PIN de quem está fazendo,
-- conferem o papel e registram o evento. O robô usa service_role e grava direto.

create table core.usuario (
  auth_id   uuid primary key references auth.users (id) on delete cascade,
  tipo      text not null check (tipo in ('dispositivo', 'pessoa')),
  loja_id   smallint references core.loja,
  pessoa_id int references core.pessoa,
  nome      text not null,
  ativo     boolean not null default true,
  check ((tipo = 'dispositivo' and loja_id is not null and pessoa_id is null)
      or (tipo = 'pessoa' and pessoa_id is not null))
);

-- ---------- Funções de apoio ----------

create function core.lojas_visiveis() returns smallint[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct x.loja_id), '{}')
  from (
    select u.loja_id
    from core.usuario u
    where u.auth_id = auth.uid() and u.ativo and u.tipo = 'dispositivo'
    union all
    select pl.loja_id
    from core.usuario u
    join core.pessoa_loja pl on pl.pessoa_id = u.pessoa_id
    where u.auth_id = auth.uid() and u.ativo
    union all
    select l.id
    from core.usuario u
    join core.pessoa_loja pl on pl.pessoa_id = u.pessoa_id and pl.papel in ('dona', 'gestao')
    cross join core.loja l
    where u.auth_id = auth.uid() and u.ativo
  ) x
$$;

create function core.sou_gestao() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from core.usuario u
    join core.pessoa_loja pl on pl.pessoa_id = u.pessoa_id and pl.papel in ('dona', 'gestao')
    where u.auth_id = auth.uid() and u.ativo
  )
$$;

create function core.exige_loja(p_loja smallint) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_loja is null or not (p_loja = any (core.lojas_visiveis())) then
    raise exception 'Sem acesso a esta loja';
  end if;
end $$;

create function core.exige_modulo(p_loja smallint, p_modulo text) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not core.modulo_ativo(p_loja, p_modulo) then
    raise exception 'O módulo "%" está desligado nesta loja', p_modulo;
  end if;
end $$;

-- Pessoa dona do PIN nesta loja, com um dos papéis exigidos (nulo = qualquer papel).
create function core.pessoa_do_pin(p_loja smallint, p_pin text, p_papeis text[] default null) returns int
language plpgsql stable security definer set search_path = '' as $$
declare
  v_id    int;
  v_papel text;
begin
  select pessoa_id, papel into v_id, v_papel from core.pessoa_por_pin(p_loja, p_pin);
  if v_id is null then
    raise exception 'PIN não reconhecido';
  end if;
  if p_papeis is not null and not (v_papel = any (p_papeis) or v_papel in ('dona', 'gestao')) then
    raise exception 'Sem permissão para esta ação';
  end if;
  return v_id;
end $$;

-- ---------- Ações (o que as telas chamam) ----------

-- Confere o PIN e devolve quem é. Usado na tela de entrada.
create function core.entrar(p_loja smallint, p_pin text)
returns table (pessoa_id int, nome text, papel text)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform core.exige_loja(p_loja);
  return query select * from core.pessoa_por_pin(p_loja, p_pin);
  if not found then
    raise exception 'PIN não reconhecido';
  end if;
end $$;

-- Liga ou desliga um módulo numa loja. Só a gestão.
create function core.ligar_modulo(p_loja smallint, p_modulo text, p_ativo boolean, p_config jsonb default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not core.sou_gestao() then
    raise exception 'Só a gestão liga e desliga módulos';
  end if;
  insert into core.loja_modulo (loja_id, modulo, ativo, config)
  values (p_loja, p_modulo, p_ativo, coalesce(p_config, '{}'))
  on conflict (loja_id, modulo) do update
    set ativo = excluded.ativo,
        config = coalesce(p_config, core.loja_modulo.config);
  insert into core.evento (loja_id, modulo, tipo, dados)
  values (p_loja, p_modulo, case when p_ativo then 'modulo_ligado' else 'modulo_desligado' end,
          jsonb_build_object('por', auth.uid()));
end $$;

-- Registra a sobra do dia inteiro (substitui o que havia no dia). Até 7 dias para trás.
-- p_itens: [{produto_id, quantidade, destino, motivo?, observacao?}]
create function sobra.registrar(p_loja smallint, p_pin text, p_data date, p_itens jsonb) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_pessoa int;
  v_n      int;
begin
  perform core.exige_loja(p_loja);
  perform core.exige_modulo(p_loja, 'sobra');
  if p_data > current_date or p_data < current_date - 7 then
    raise exception 'Só dá para registrar sobra dos últimos 7 dias';
  end if;
  v_pessoa := core.pessoa_do_pin(p_loja, p_pin, null);

  delete from sobra.registro where loja_id = p_loja and data = p_data;
  insert into sobra.registro (loja_id, data, produto_id, quantidade, destino, motivo, observacao, pessoa_id)
  select p_loja, p_data, (i ->> 'produto_id')::int, (i ->> 'quantidade')::numeric,
         i ->> 'destino', nullif(i ->> 'motivo', ''), nullif(i ->> 'observacao', ''), v_pessoa
  from jsonb_array_elements(p_itens) i
  where (i ->> 'quantidade')::numeric > 0;
  get diagnostics v_n = row_count;

  insert into core.evento (loja_id, pessoa_id, modulo, tipo, dados)
  values (p_loja, v_pessoa, 'sobra', 'sobra_registrada', jsonb_build_object('data', p_data, 'itens', v_n));
  return v_n;
end $$;

-- Fecha (ou corrige) o caixa do dia e devolve a situação da conferência.
-- p_valores: {fundo_troco, dinheiro, credito, debito, pix, outros, sangrias}
create function caixa.fechar(p_loja smallint, p_pin text, p_data date, p_valores jsonb) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_pessoa int;
  v_sit    text;
begin
  perform core.exige_loja(p_loja);
  perform core.exige_modulo(p_loja, 'caixa');
  if p_data > current_date or p_data < current_date - 3 then
    raise exception 'Só dá para fechar o caixa dos últimos 3 dias';
  end if;
  v_pessoa := core.pessoa_do_pin(p_loja, p_pin, array['caixa']);

  insert into caixa.fechamento (loja_id, data, pessoa_id, fundo_troco, dinheiro, credito, debito, pix, outros, sangrias)
  values (p_loja, p_data, v_pessoa,
          coalesce((p_valores ->> 'fundo_troco')::numeric, 0), coalesce((p_valores ->> 'dinheiro')::numeric, 0),
          coalesce((p_valores ->> 'credito')::numeric, 0),     coalesce((p_valores ->> 'debito')::numeric, 0),
          coalesce((p_valores ->> 'pix')::numeric, 0),         coalesce((p_valores ->> 'outros')::numeric, 0),
          coalesce((p_valores ->> 'sangrias')::numeric, 0))
  on conflict (loja_id, data) do update set
    pessoa_id = excluded.pessoa_id, fundo_troco = excluded.fundo_troco, dinheiro = excluded.dinheiro,
    credito = excluded.credito, debito = excluded.debito, pix = excluded.pix,
    outros = excluded.outros, sangrias = excluded.sangrias;

  select situacao into v_sit from caixa.conferencia where loja_id = p_loja and data = p_data;
  insert into core.evento (loja_id, pessoa_id, modulo, tipo, dados)
  values (p_loja, v_pessoa, 'caixa', 'caixa_fechado', p_valores || jsonb_build_object('data', p_data, 'situacao', v_sit));
  return v_sit;
end $$;

create function caixa.justificar(p_loja smallint, p_pin text, p_data date, p_tipo text, p_observacao text default null) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_pessoa int;
  v_sit    text;
begin
  perform core.exige_loja(p_loja);
  v_pessoa := core.pessoa_do_pin(p_loja, p_pin, array['caixa']);
  update caixa.fechamento set justificativa = p_tipo, observacao = p_observacao
  where loja_id = p_loja and data = p_data;
  if not found then
    raise exception 'Não há fechamento neste dia';
  end if;
  select situacao into v_sit from caixa.conferencia where loja_id = p_loja and data = p_data;
  insert into core.evento (loja_id, pessoa_id, modulo, tipo, dados)
  values (p_loja, v_pessoa, 'caixa', 'caixa_justificado', jsonb_build_object('data', p_data, 'tipo', p_tipo));
  return v_sit;
end $$;

-- Gera de novo o rascunho da lista da semana. Só a gestão (a geração automática usa o robô).
create function producao.gerar(p_loja smallint, p_semana_inicio date) returns int
language plpgsql security definer set search_path = '' as $$
begin
  perform core.exige_loja(p_loja);
  if not core.sou_gestao() then
    raise exception 'Só a gestão gera a lista';
  end if;
  return producao.sugerir_plano(p_loja, p_semana_inicio);
end $$;

-- Aprova a lista, com os ajustes de quem produz. p_ajustes: {"<receita_id>": quantidade_final}
create function producao.aprovar(p_plano int, p_pin text, p_ajustes jsonb default '{}') returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_loja   smallint;
  v_status text;
  v_pessoa int;
begin
  select loja_id, status into v_loja, v_status from producao.plano where id = p_plano;
  if v_loja is null then
    raise exception 'Lista não encontrada';
  end if;
  perform core.exige_loja(v_loja);
  if v_status = 'aprovado' then
    raise exception 'Esta lista já foi aprovada';
  end if;
  v_pessoa := core.pessoa_do_pin(v_loja, p_pin, array['cozinha']);

  update producao.plano_item i
  set final_receitas = (p_ajustes ->> i.receita_id::text)::int
  where i.plano_id = p_plano and p_ajustes ? i.receita_id::text;

  update producao.plano set status = 'aprovado', aprovado_por = v_pessoa where id = p_plano;
  insert into core.evento (loja_id, pessoa_id, modulo, tipo, dados)
  values (v_loja, v_pessoa, 'producao', 'plano_aprovado', jsonb_build_object('plano', p_plano, 'ajustes', p_ajustes));
end $$;

-- ---------- Permissões ----------

-- Views respeitam o RLS de quem consulta.
alter view caixa.conferencia set (security_invoker = true);
alter view producao.semana_total set (security_invoker = true);

-- Nada é executável por padrão; liberamos só o que as telas usam.
revoke execute on all functions in schema core, venda, sobra, producao, caixa, compras, fiscal from public;
revoke all on all tables in schema core, venda, sobra, producao, caixa, compras, fiscal from anon, authenticated;

grant usage on schema core, venda, sobra, producao, caixa, compras, fiscal to authenticated, service_role;
grant all on all tables in schema core, venda, sobra, producao, caixa, compras, fiscal to service_role;
grant all on all sequences in schema core, venda, sobra, producao, caixa, compras, fiscal to service_role;
grant execute on all functions in schema core, venda, sobra, producao, caixa, compras, fiscal to service_role;

grant select on all tables in schema core, venda, sobra, producao, caixa, compras, fiscal to authenticated;
revoke select on core.pessoa from authenticated;
grant select (id, nome, ativa) on core.pessoa to authenticated;   -- nunca o pin_hash

grant execute on function
  core.lojas_visiveis(), core.sou_gestao(), core.modulo_ativo(smallint, text), core.loja_aberta(smallint, date),
  core.entrar(smallint, text), core.ligar_modulo(smallint, text, boolean, jsonb),
  sobra.registrar(smallint, text, date, jsonb),
  caixa.fechar(smallint, text, date, jsonb), caixa.justificar(smallint, text, date, text, text),
  producao.gerar(smallint, date), producao.aprovar(int, text, jsonb),
  producao.previsao(smallint, date, int), producao.cfg(smallint, text, text), producao.taxa_sobra(smallint, int, date),
  compras.necessidade(int)
to authenticated;

-- RLS: tabelas com loja enxergam só as lojas visíveis; catálogo é de todos; pessoas, das lojas visíveis.
do $$
declare
  t record;
begin
  for t in
    select n.nspname as esquema, c.relname as tabela,
           exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'loja_id' and not a.attisdropped) as tem_loja
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where c.relkind = 'r' and n.nspname in ('core', 'venda', 'sobra', 'producao', 'caixa', 'compras', 'fiscal')
  loop
    execute format('alter table %I.%I enable row level security', t.esquema, t.tabela);
    if t.tem_loja then
      execute format('create policy ver_loja on %I.%I for select to authenticated using (loja_id = any (core.lojas_visiveis()))',
                     t.esquema, t.tabela);
    end if;
  end loop;
end $$;

create policy ver_tudo on core.loja         for select to authenticated using (true);
create policy ver_tudo on core.papel        for select to authenticated using (true);
create policy ver_tudo on core.modulo       for select to authenticated using (true);
create policy ver_tudo on core.categoria    for select to authenticated using (true);
create policy ver_tudo on core.produto      for select to authenticated using (true);
create policy ver_tudo on core.produto_alias for select to authenticated using (true);
create policy ver_tudo on core.insumo       for select to authenticated using (true);
create policy ver_tudo on core.receita      for select to authenticated using (true);
create policy ver_tudo on core.receita_item for select to authenticated using (true);
create policy ver_tudo on producao.produto_receita for select to authenticated using (true);
create policy ver_proprio on core.usuario   for select to authenticated using (auth_id = auth.uid());
create policy ver_pessoas on core.pessoa    for select to authenticated using (
  exists (select 1 from core.pessoa_loja pl where pl.pessoa_id = core.pessoa.id and pl.loja_id = any (core.lojas_visiveis())));
create policy ver_pessoas on core.pessoa_loja for select to authenticated using (loja_id = any (core.lojas_visiveis()));
create policy ver_itens on producao.plano_item for select to authenticated using (
  exists (select 1 from producao.plano p where p.id = plano_id and p.loja_id = any (core.lojas_visiveis())));
create policy ver_itens on venda.pedido_item for select to authenticated using (
  exists (select 1 from venda.pedido p where p.id = pedido_id and p.loja_id = any (core.lojas_visiveis())));
create policy ver_itens on venda.pedido_pagamento for select to authenticated using (
  exists (select 1 from venda.pedido p where p.id = pedido_id and p.loja_id = any (core.lojas_visiveis())));
