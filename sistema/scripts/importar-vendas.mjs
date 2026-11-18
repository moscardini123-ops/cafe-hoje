// Importa o histórico diário de vendas para o módulo de venda.
// Entrada: o JSON do painel ({dias: [{data, fat, ped, canc, desc, formas, hora, top: [{p, c, q, v}]}]}),
// o mesmo que o Apps Script devolve em action=painel.
// Uso: node sistema/scripts/importar-vendas.mjs arquivo.json [loja] > vendas.sql
import { lerJson, q, n, sai } from './lib.mjs';

const [arq, loja = 'estrada'] = process.argv.slice(2);
if (!arq) { console.error('Uso: importar-vendas.mjs arquivo.json [loja]'); process.exit(1); }
const dias = (lerJson(arq).dias || []).filter(d => d && /^\d{4}-\d{2}-\d{2}$/.test(d.data));

const FORMAS = { dinheiro: 'dinheiro', credito: 'credito', debito: 'debito', pix: 'pix' };
const LOJA = `(select id from core.loja where slug = ${q(loja)})`;
const L = ['begin;'];

// Produtos e categorias novos, com o nome do GrandChef como apelido.
const produtos = new Map();
for (const d of dias) for (const t of d.top || []) if (t && t.p && !produtos.has(t.p)) produtos.set(t.p, t.c || null);
for (const c of new Set([...produtos.values()].filter(Boolean))) {
  L.push(`insert into core.categoria (nome) values (${q(c)}) on conflict (nome) do nothing;`);
}
for (const [p, c] of produtos) {
  L.push(`insert into core.produto (nome, categoria_id) values (${q(p)}, ${c ? `(select id from core.categoria where nome = ${q(c)})` : 'null'}) on conflict (nome) do nothing;`);
  L.push(`insert into core.produto_alias (origem, nome_externo, produto_id) select 'grandchef', ${q(p)}, id from core.produto where nome = ${q(p)} on conflict do nothing;`);
}

for (const d of dias) {
  L.push(`insert into venda.resumo_dia (loja_id, data, faturamento, pedidos, cancelados, descontos, por_hora) values (${LOJA}, ${q(d.data)}, ${n(d.fat || 0)}, ${n(d.ped || 0)}, ${n(d.canc || 0)}, ${n(d.desc || 0)}, ${q(JSON.stringify(d.hora || {}))})
  on conflict (loja_id, data) do update set faturamento = excluded.faturamento, pedidos = excluded.pedidos, cancelados = excluded.cancelados, descontos = excluded.descontos, por_hora = excluded.por_hora, atualizado_em = now();`);
  L.push(`delete from venda.produto_dia where loja_id = ${LOJA} and data = ${q(d.data)};`);
  const agreg = new Map();
  for (const t of d.top || []) {
    if (!t || !t.p) continue;
    const a = agreg.get(t.p) || { q: 0, v: 0 };
    a.q += Number(t.q) || 0; a.v += Number(t.v) || 0; agreg.set(t.p, a);
  }
  for (const [p, a] of agreg) {
    L.push(`insert into venda.produto_dia (loja_id, data, produto_id, quantidade, valor) select ${LOJA}, ${q(d.data)}, produto_id, ${n(a.q)}, ${n(a.v.toFixed(2))} from core.produto_alias where origem = 'grandchef' and nome_externo = ${q(p)};`);
  }
  L.push(`delete from venda.pagamento_dia where loja_id = ${LOJA} and data = ${q(d.data)};`);
  const formas = {};
  for (const [k, v] of Object.entries(d.formas || {})) {
    const f = FORMAS[k] || 'outros';
    formas[f] = (formas[f] || 0) + (Number(v) || 0);
  }
  for (const [f, v] of Object.entries(formas)) if (v) {
    L.push(`insert into venda.pagamento_dia (loja_id, data, forma, valor) values (${LOJA}, ${q(d.data)}, ${q(f)}, ${n(v.toFixed(2))});`);
  }
}
L.push('commit;');
sai(L);
console.error(`${dias.length} dias, ${produtos.size} produtos, loja ${loja}.`);
