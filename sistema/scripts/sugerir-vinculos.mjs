// Sugere qual receita cada produto vendido consome, comparando os nomes.
// Gera SQL comentado para revisão humana: confira com a Eliana antes de aplicar.
// Uso: node sistema/scripts/sugerir-vinculos.mjs receitas.json vendas.json > vinculos.sql
import { lerJson, q, norm, sai } from './lib.mjs';

const [arqRec, arqVen] = process.argv.slice(2);
if (!arqRec || !arqVen) { console.error('Uso: sugerir-vinculos.mjs receitas.json vendas.json'); process.exit(1); }
const recs = (lerJson(arqRec).recs || lerJson(arqRec).receitas || []).filter(r => r.tipo !== 'base');
const vendidos = new Map();
for (const d of lerJson(arqVen).dias || []) for (const t of d.top || []) if (t && t.p) vendidos.set(t.p, (vendidos.get(t.p) || 0) + (Number(t.q) || 0));

const PALAVRAS_VAZIAS = new Set(['de', 'da', 'do', 'com', 'e', 'a', 'o', 'fatia', 'unidade', 'un', 'pedaco', 'copo']);
const tokens = s => norm(s).split(' ').filter(w => w.length > 1 && !PALAVRAS_VAZIAS.has(w));

// Semelhança de Dice entre conjuntos de palavras, com bônus quando todas as palavras da receita aparecem.
function nota(produto, receita) {
  const a = new Set(tokens(produto)), b = new Set(tokens(receita));
  if (!a.size || !b.size) return 0;
  let comum = 0; for (const w of b) if (a.has(w)) comum++;
  const dice = 2 * comum / (a.size + b.size);
  return comum === b.size ? Math.max(dice, 0.75) : dice;
}

const L = ['-- Vínculos produto vendido → receita. Revise: apague as linhas erradas e ajuste "quantidade".',
  '-- quantidade = quanto 1 unidade vendida consome do rendimento da receita (ex.: 1 fatia).', 'begin;'];
const semPar = [];
for (const [p, qtd] of [...vendidos].sort((x, y) => y[1] - x[1])) {
  const melhor = recs.map(r => ({ r, s: nota(p, r.nome) })).sort((x, y) => y.s - x.s)[0];
  if (!melhor || melhor.s < 0.5) { semPar.push(`${p} (${qtd})`); continue; }
  const conf = melhor.s >= 0.75 ? 'alta' : 'conferir';
  L.push(`-- ${conf} (${melhor.s.toFixed(2)}): "${p}" vendeu ${qtd} → "${melhor.r.nome}" rende ${melhor.r.rende} ${melhor.r.un || melhor.r.rende_un || ''}`);
  L.push(`insert into producao.produto_receita (produto_id, receita_id, quantidade) select p.produto_id, r.id, 1 from core.produto_alias p, core.receita r where p.origem = 'grandchef' and p.nome_externo = ${q(p)} and r.nome = ${q(melhor.r.nome)} on conflict do nothing;`);
}
L.push('commit;', '', '-- Sem receita parecida (bebidas prontas, revenda ou nome muito diferente):', ...semPar.map(s => `--   ${s}`));
sai(L);
console.error(`${vendidos.size} produtos vendidos; ${vendidos.size - semPar.length} com sugestão, ${semPar.length} sem.`);
