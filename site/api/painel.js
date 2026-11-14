// Painel Café Hoje — busca os dados na planilha sem expor a chave no link.
// Config via env vars da Vercel (APPS_SCRIPT_URL, CAFE_KEY, PAINEL_PIN_HASH). Valores reais em SEGREDOS-NAO-COMMITAR.md.
// Antes: config no próprio código da função (o código das funções da Vercel não é público). O PIN fica só como hash.
const crypto = require('crypto');
const CFG = {
  url: process.env.APPS_SCRIPT_URL || '',
  key: process.env.CAFE_KEY || '',
  pinHash: process.env.PAINEL_PIN_HASH || ''
};
const hash = v => crypto.createHash('sha256').update(String(v)).digest('hex');
module.exports = async (req, res) => {
  const q = req.query || {};
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (hash(q.c || '') !== CFG.pinHash) {
    await new Promise(r => setTimeout(r, 800));
    res.statusCode = 200; return res.end(JSON.stringify({ erro: 'codigo' }));
  }
  const n = Math.min(Math.max(parseInt(q.n, 10) || 900, 1), 1500);
  const url = `${CFG.url}?action=painel&k=${encodeURIComponent(CFG.key)}&n=${n}`;
  try {
    const r = await fetch(url, { redirect: 'follow' });
    const t = await r.text();
    JSON.parse(t);
    res.statusCode = 200; res.end(t);
  } catch (e) {
    res.statusCode = 502; res.end(JSON.stringify({ erro: 'planilha', detalhe: String(e.message || e).slice(0, 120) }));
  }
};
