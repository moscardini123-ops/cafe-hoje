-- Cardápio de exemplo para começar (pode editar ou apagar tudo pelo sistema)
with cat as (
  insert into public.categorias (nome, ordem) values
    ('Cafés', 1), ('Bebidas geladas', 2), ('Salgados', 3), ('Doces', 4), ('Pratos', 5)
  returning id, nome
),
prod as (
  insert into public.produtos (categoria_id, nome, descricao, preco, destino, ordem)
  select c.id, p.nome, p.descricao, p.preco, p.destino, p.ordem
  from cat c join (values
    ('Cafés', 'Espresso', 'Dose simples do nosso blend da Mantiqueira', 7.00, 'balcao', 1),
    ('Cafés', 'Café com leite', 'Espresso com leite vaporizado', 10.00, 'balcao', 2),
    ('Cafés', 'Cappuccino', 'Espresso, leite vaporizado e espuma', 12.00, 'balcao', 3),
    ('Cafés', 'Coado', 'Café filtrado na hora', 8.00, 'balcao', 4),
    ('Bebidas geladas', 'Suco de laranja', 'Natural, 300 ml', 12.00, 'bar', 1),
    ('Bebidas geladas', 'Água mineral', 'Com ou sem gás, 500 ml', 5.00, 'nenhum', 2),
    ('Salgados', 'Pão de queijo', 'Unidade, assado na hora', 6.00, 'cozinha', 1),
    ('Salgados', 'Misto quente', 'Pão de forma, queijo e presunto', 14.00, 'cozinha', 2),
    ('Doces', 'Bolo de fubá', 'Fatia', 9.00, 'balcao', 1),
    ('Doces', 'Brownie', 'Com nozes', 10.00, 'balcao', 2),
    ('Pratos', 'Omelete', 'Dois ovos, queijo e tomate, com salada', 24.00, 'cozinha', 1)
  ) as p(categoria, nome, descricao, preco, destino, ordem) on p.categoria = c.nome
  returning id, nome
),
grp as (
  insert into public.grupos_opcoes (produto_id, nome, tipo, obrigatorio, minimo, maximo, ordem)
  select pr.id, g.nome, g.tipo, g.obrigatorio, g.minimo, g.maximo, g.ordem
  from prod pr join (values
    ('Café com leite', 'Tamanho', 'unica', true, 1, 1, 1),
    ('Café com leite', 'Leite', 'unica', false, 0, 1, 2),
    ('Café com leite', 'Adicionais', 'multipla', false, 0, null, 3),
    ('Cappuccino', 'Tamanho', 'unica', true, 1, 1, 1),
    ('Cappuccino', 'Adicionais', 'multipla', false, 0, null, 2),
    ('Suco de laranja', 'Açúcar', 'unica', false, 0, 1, 1),
    ('Omelete', 'Recheio extra', 'multipla', false, 0, 3, 1)
  ) as g(produto, nome, tipo, obrigatorio, minimo, maximo, ordem) on g.produto = pr.nome
  returning id, produto_id, nome
)
insert into public.opcoes (grupo_id, nome, preco_extra, ordem)
select g.id, o.nome, o.preco_extra, o.ordem
from grp g
join prod pr on pr.id = g.produto_id
join (values
  ('Café com leite', 'Tamanho', 'Pequeno', 0, 1),
  ('Café com leite', 'Tamanho', 'Médio', 2.00, 2),
  ('Café com leite', 'Tamanho', 'Grande', 4.00, 3),
  ('Café com leite', 'Leite', 'Integral', 0, 1),
  ('Café com leite', 'Leite', 'Desnatado', 0, 2),
  ('Café com leite', 'Leite', 'Vegetal (aveia)', 3.00, 3),
  ('Café com leite', 'Adicionais', 'Dose extra de café', 3.00, 1),
  ('Café com leite', 'Adicionais', 'Canela', 0, 2),
  ('Café com leite', 'Adicionais', 'Chocolate', 2.00, 3),
  ('Cappuccino', 'Tamanho', 'Pequeno', 0, 1),
  ('Cappuccino', 'Tamanho', 'Grande', 4.00, 2),
  ('Cappuccino', 'Adicionais', 'Dose extra de café', 3.00, 1),
  ('Cappuccino', 'Adicionais', 'Chantilly', 2.50, 2),
  ('Suco de laranja', 'Açúcar', 'Sem açúcar', 0, 1),
  ('Suco de laranja', 'Açúcar', 'Com açúcar', 0, 2),
  ('Omelete', 'Recheio extra', 'Presunto', 4.00, 1),
  ('Omelete', 'Recheio extra', 'Cogumelos', 5.00, 2),
  ('Omelete', 'Recheio extra', 'Queijo extra', 4.00, 3)
) as o(produto, grupo, nome, preco_extra, ordem) on o.produto = pr.nome and o.grupo = g.nome;
