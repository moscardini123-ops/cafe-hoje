-- Catálogo de módulos e as duas lojas, com o que fica ligado em cada uma.
-- Sem dados de venda nem de pessoas: isso entra pelos importadores, direto no banco.

insert into core.modulo (slug, nome, descricao, depende_de, conflita_com) values
  ('venda_grandchef', 'Venda pelo GrandChef', 'O robô lê pedidos, itens e pagamentos do GrandChef. Só leitura.', '{}', '{venda_propria}'),
  ('venda_propria',   'Venda própria (PDV)',  'Balcão e mesas no sistema próprio.', '{}', '{venda_grandchef}'),
  ('fiscal',          'Nota fiscal (NFC-e)',  'Emissão pela Focus NFe a partir da venda própria.', '{venda_propria}', '{}'),
  ('painel',          'Painel',               'Vendas do dia, semana, mês e ano; comparação entre lojas.', '{venda_grandchef|venda_propria}', '{}'),
  ('sobra',           'Sobra e perda',        'Registro diário do que sobrou, destino e motivo.', '{}', '{}'),
  ('producao',        'Produção',             'Lista da semana pela venda, registro do que foi feito e remessa por loja.', '{venda_grandchef|venda_propria}', '{}'),
  ('compras',         'Compras',              'Lista de mercado gerada pela produção.', '{producao}', '{}'),
  ('caixa',           'Caixa conferido',      'Contagem no fechamento comparada com a venda registrada.', '{venda_grandchef|venda_propria}', '{}'),
  ('estoque_emporio', 'Estoque do empório',   'Entradas com nota, saída pela venda, contagem mensal.', '{venda_grandchef|venda_propria}', '{}'),
  ('escala',          'Escala da equipe',     'Quem trabalha em cada dia e horário, cruzado com a venda por hora.', '{}', '{}');

insert into core.loja (slug, nome, dias_fechados) values
  ('estrada', 'Café da Mantiqueira — Estrada', '{2}'),   -- fecha às terças
  ('praca',   'Café da Mantiqueira — Praça',   '{}');    -- horário a definir

-- Ordem importa: dependências antes de quem depende.
insert into core.loja_modulo (loja_id, modulo, ativo, config)
select l.id, m.modulo, true, m.config::jsonb
from core.loja l
cross join (values
  (1, 'venda_grandchef', '{}'),
  (2, 'painel',          '{}'),
  (3, 'sobra',           '{}'),
  (4, 'producao',        '{"margem": 0.10, "limite_sobra": 0.15, "semanas": 4}'),
  (5, 'compras',         '{}'),
  (6, 'caixa',           '{"limite_diferenca": 20}')
) as m(ordem, modulo, config)
where l.slug = 'estrada'
order by m.ordem;

-- A praça não tem histórico: a produção usa a estrada como base, com fator a calibrar.
insert into core.loja_modulo (loja_id, modulo, ativo, config)
select l.id, m.modulo, true, m.config::jsonb
from core.loja l
cross join (values
  (1, 'venda_grandchef', '{}'),
  (2, 'painel',          '{}'),
  (3, 'sobra',           '{}'),
  (4, 'producao',        '{"margem": 0.15, "limite_sobra": 0.15, "semanas": 4, "base_loja": "estrada", "fator": 0.3}'),
  (5, 'caixa',           '{"limite_diferenca": 20}')
) as m(ordem, modulo, config)
where l.slug = 'praca'
order by m.ordem;
