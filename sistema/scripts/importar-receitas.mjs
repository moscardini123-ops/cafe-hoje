// Importa insumos e receitas do app "Preços do Café" para o núcleo.
// Entrada: o JSON do app (o mesmo de site/seed.json ou o que o Apps Script devolve sem "action").
// Uso: node sistema/scripts/importar-receitas.mjs arquivo.json > receitas.sql
import { lerJson, q, n, sai } from './lib.mjs';

const arq = process.argv[2];
if (!arq) { console.error('Uso: importar-receitas.mjs arquivo.json'); process.exit(1); }
const d = lerJson(arq);
const ings = d.ings || d.ingredientes || [];
const recs = d.recs || d.receitas || [];

const unidade = u => ({ g: 'g', kg: 'g', ml: 'ml', l: 'ml', un: 'un' }[String(u || '').toLowerCase()] || 'un');
const L = ['begin;'];

for (const i of ings) {
  L.push(`insert into core.insumo (nome, unidade, embalagem, preco, atualizado_em) values (${q(i.nome)}, ${q(unidade(i.un ?? i.unidade))}, ${n(i.emb ?? i.embalagem)}, ${n(i.preco)}, ${q(i.conferido_em && /^\d{4}-/.test(i.conferido_em) ? i.conferido_em : null)})
  on conflict (nome) do update set unidade = excluded.unidade, embalagem = excluded.embalagem, preco = excluded.preco;`);
}

for (const r of recs) {
  const tipo = r.tipo === 'base' ? 'base' : 'produto';
  // Receita que rende uma unidade só (bebida, lanche na chapa) é montada na loja na hora.
  // O resto (bolos, pães, tortas, bases) sai da cozinha central. Ajustável depois, à mão.
  const onde = tipo === 'base' || Number(r.rende) > 1 ? 'cozinha_central' : 'loja';
  L.push(`insert into core.receita (nome, tipo, rende, rende_unidade, preco_venda, onde_produz) values (${q(r.nome)}, ${q(tipo)}, ${n(r.rende || 1)}, ${q(r.un ?? r.rende_un ?? r.rende_unidade ?? 'unidades')}, ${n(r.preco ?? r.preco_venda)}, ${q(onde)})
  on conflict (nome) do update set tipo = excluded.tipo, rende = excluded.rende, rende_unidade = excluded.rende_unidade, preco_venda = excluded.preco_venda;`);
}

// Itens depois, porque uma receita pode usar outra que vem mais abaixo na lista.
const faltam = [];
for (const r of recs) {
  const itens = typeof r.itens === 'string' ? JSON.parse(r.itens) : (r.itens || []);
  L.push(`delete from core.receita_item where receita_id = (select id from core.receita where nome = ${q(r.nome)});`);
  for (const it of itens) {
    const nome = it.n ?? it.ref;
    if (it.t === 'r') {
      if (!recs.some(x => x.nome === nome)) { faltam.push(`${r.nome} → receita "${nome}"`); continue; }
      L.push(`insert into core.receita_item (receita_id, sub_receita_id, quantidade) select r.id, s.id, ${n(it.q)} from core.receita r, core.receita s where r.nome = ${q(r.nome)} and s.nome = ${q(nome)};`);
    } else {
      if (!ings.some(x => x.nome === nome)) { faltam.push(`${r.nome} → insumo "${nome}"`); continue; }
      L.push(`insert into core.receita_item (receita_id, insumo_id, quantidade) select r.id, i.id, ${n(it.q)} from core.receita r, core.insumo i where r.nome = ${q(r.nome)} and i.nome = ${q(nome)};`);
    }
  }
}
L.push('commit;');
sai(L);
console.error(`${ings.length} insumos, ${recs.length} receitas.`);
if (faltam.length) console.error(`Itens ignorados por não existirem no cadastro (${faltam.length}):\n  ` + faltam.join('\n  '));
