// Café Hoje — resumo da semana (domingo à noite) e fechamento do mês (dia 1º)
// Lê a planilha (não usa o GrandChef). Uso:
//   MODO=semana node resumo.mjs [AAAA-MM-DD do domingo]   (padrão: hoje)
//   MODO=mes    node resumo.mjs [AAAA-MM]                  (padrão: mês passado)
const APPS = process.env.APPS_SCRIPT_URL || '', KEY = process.env.CAFE_KEY || '';
const MODO = process.env.MODO || 'semana';
const ENVIAR = process.env.ENVIAR_WPP !== '0';
const CONTAS = Number(process.env.CONTAS_MES || 14000);   // equipe + contas fixas por mês
const MARGEM = Number(process.env.MARGEM || 0.69);        // sobra de cada R$ 1 vendido depois de ingredientes, imposto e maquininha
const EQUILIBRIO = Math.round(CONTAS / MARGEM / 100) * 100; // ~R$ 20.300
const WPP = (process.env.WPP_DESTINOS || '').split(',').map(x => x.trim()).filter(Boolean).map(x => x.split(':'));

const FERIADOS = {
  '2026-01-01': '1º de janeiro', '2026-02-16': 'Carnaval', '2026-02-17': 'Carnaval', '2026-04-03': 'Sexta-feira Santa',
  '2026-04-21': 'Tiradentes', '2026-05-01': '1º de maio', '2026-06-04': 'Corpus Christi', '2026-09-07': '7 de setembro',
  '2026-10-12': '12 de outubro', '2026-11-02': 'Finados', '2026-11-15': '15 de novembro', '2026-11-20': 'Consciência Negra',
  '2026-12-25': 'Natal', '2027-01-01': '1º de janeiro', '2027-02-08': 'Carnaval', '2027-02-09': 'Carnaval',
  '2027-03-26': 'Sexta-feira Santa', '2027-04-21': 'Tiradentes', '2027-05-01': '1º de maio', '2027-05-27': 'Corpus Christi',
  '2027-09-07': '7 de setembro', '2027-10-12': '12 de outubro', '2027-11-02': 'Finados', '2027-11-15': '15 de novembro',
  '2027-11-20': 'Consciência Negra', '2027-12-25': 'Natal',
};
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const DS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const APELIDO = {
  'CAFÉ DA CASA COADO (ESPECIAL DA CASA)': 'Café coado', 'CAFE ESPRESSO SIMPLES': 'Espresso', 'CAFE ESPRESSO DUPLO': 'Espresso duplo',
  'CAPUCCINO ITALIANO': 'Cappuccino', 'CAFÉ COM LEITE': 'Café com leite', 'PAO DE QUEIJO SIMPLES': 'Pão de queijo',
  'PAO DE QUEIJO NA CHAPA': 'Pão de queijo na chapa', 'AGUAS SEM GAS': 'Água sem gás', 'AGUA COM GAS': 'Água com gás',
  'SUCO LARANJA': 'Suco de laranja', 'BISCOITAO  COM QUEIJO NA CHAPA': 'Biscoitão na chapa', 'PAO CAIPIRA COM QUEIJO': 'Pão caipira c/ queijo',
  'PAO CAIPIRA COM QUEIJO  E  BACON': 'Pão caipira c/ queijo e bacon', 'PAO CAIPIRA COM  BACON': 'Pão caipira c/ bacon',
  'BOLO DO DIA CENOURA COM CALDA FATIA': 'Bolo de cenoura', 'BOLO DE FUBA CREMOSO': 'Bolo de fubá', 'CHOCOLATE QUENTE': 'Chocolate quente',
  'TORTA GELADA  MANTIQUEIRA  FATIA': 'Torta Mantiqueira', 'PAO DO CORUJINHA': 'Pão do Corujinha', 'VIRADO DE BANANA': 'Virado de banana',
};
const nome = s => APELIDO[s] || (t => t.charAt(0).toUpperCase() + t.slice(1))(String(s).toLowerCase().replace(/\s+/g, ' ').replace(/\s*\(.*?\)\s*/g, ' ').trim());
const brl = v => 'R$ ' + Math.round(v || 0).toLocaleString('pt-BR');
const mil = v => '~R$ ' + Math.round(v / 1000).toLocaleString('pt-BR') + ' mil';
const dd = s => s.slice(8, 10) + '/' + s.slice(5, 7);
const wd = s => new Date(s + 'T12:00:00Z').getUTCDay();
const soma = (d, n) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const hojeSP = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
const pct = (a, b) => { const p = (a - b) / b * 100; return `${p >= 0 ? '📈 +' : '📉 −'}${Math.abs(p).toFixed(0)}%`; };

async function dias() {
  if (!APPS || !KEY) throw new Error('Faltam APPS_SCRIPT_URL / CAFE_KEY');
  for (let t = 1; ; t++) {
    try {
      const r = await fetch(`${APPS}?action=painel&k=${encodeURIComponent(KEY)}&n=500`);
      const j = JSON.parse(await r.text());
      if (j.erro) throw new Error(j.erro);
      return j.dias.map(d => ({ ...d, data: String(d.data).replace(/^'/, '') }));
    } catch (e) { if (t >= 4) throw e; console.log(`Planilha não respondeu (${e.message}), tentando de novo…`); await new Promise(r => setTimeout(r, 5000 * t)); }
  }
}
function junta(lista) {
  const T = {}, H = {};
  let fat = 0, ped = 0;
  for (const d of lista) {
    fat += d.fat; ped += d.ped;
    for (const t of d.top || []) T[t.p] = (T[t.p] || 0) + (Number(t.q) || 0);
    for (const [h, v] of Object.entries(d.hora || {})) H[h] = (H[h] || 0) + Number(v);
  }
  return {
    fat, ped, ticket: ped ? fat / ped : 0,
    top: Object.entries(T).sort((a, b) => b[1] - a[1]).slice(0, 5),
    pico: Object.entries(H).sort((a, b) => b[1] - a[1]).slice(0, 3),
  };
}
const entre = (D, a, b) => D.filter(d => d.data >= a && d.data <= b);
const feriado = (a, b) => Object.keys(FERIADOS).filter(k => k >= a && k <= b).map(k => FERIADOS[k]);

function semana(D, dom) {
  const ini = soma(dom, -6), ant0 = soma(ini, -7), ant1 = soma(ini, -1);
  const s = junta(entre(D, ini, dom)), a = junta(entre(D, ant0, ant1));
  const mes0 = dom.slice(0, 8) + '01', mesTot = entre(D, mes0, dom).reduce((x, d) => x + d.fat, 0);
  const L = [`*📆 Encerramento da semana — ${dd(ini)} a ${dd(dom)}*`, ''];
  if (!s.ped) return [...L, 'Nenhuma venda registrada na semana.'].join('\n');
  L.push(`💰 *${brl(s.fat)}* em ${s.ped} pedidos`, `🧾 Ticket médio: ${brl(s.ticket)}`);
  if (a.fat > 0) L.push(`${pct(s.fat, a.fat)} vs semana anterior (${brl(a.fat)} · ${a.ped} pedidos)`);
  // mesma semana do ano passado: 364 dias antes (mesmos dias da semana)
  const y0 = soma(ini, -364), y1 = soma(dom, -364), ly = junta(entre(D, y0, y1));
  if (ly.fat > 0) L.push(`${pct(s.fat, ly.fat)} vs mesma semana de ${y1.slice(0, 4)} (${brl(ly.fat)})`);
  const fe = feriado(ini, dom), fa = feriado(ant0, ant1);
  if (fe.length) L.push(`_(esta semana teve feriado: ${fe.join(', ')})_`);
  if (fa.length) L.push(`_(semana anterior teve feriado: ${fa.join(', ')})_`);
  L.push('', '🏆 *Top 5 produtos*');
  s.top.forEach(([p, q], i) => L.push(`${i + 1}. ${nome(p)} — ${q}`));
  L.push('', '⏰ *Horários de pico*', s.pico.map(([h, v]) => `${h}h - ${brl(v)}`).join(' · '));
  L.push('', `📅 Faturado em ${MESES[Number(dom.slice(5, 7)) - 1]} até agora: *${brl(mesTot)}*`);
  return L.join('\n');
}

function mes(D, ym) {
  const [y, m] = ym.split('-').map(Number);
  const ini = `${ym}-01`, fim = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const pym = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
  const lista = entre(D, ini, fim), s = junta(lista);
  const pa = entre(D, `${pym}-01`, `${pym}-31`).reduce((x, d) => x + d.fat, 0);
  const L = [`*🗓️ Fechamento de ${MESES[m - 1]}*`, ''];
  if (!s.ped) return [...L, 'Nenhuma venda registrada no mês.'].join('\n');
  const abertos = lista.filter(d => d.fat >= 300);
  L.push(`💰 *${brl(s.fat)}* em ${s.ped} pedidos`, `🧾 Ticket médio: ${brl(s.ticket)}`);
  if (pa > 0) L.push(`${pct(s.fat, pa)} vs ${MESES[(m + 10) % 12]} (${brl(pa)})`);
  const la = entre(D, `${y - 1}-${String(m).padStart(2, '0')}-01`, `${y - 1}-${String(m).padStart(2, '0')}-31`).reduce((x, d) => x + d.fat, 0);
  if (la > 0) L.push(`${pct(s.fat, la)} vs ${MESES[m - 1]} de ${y - 1} (${brl(la)})`);
  const ano = entre(D, `${y}-01-01`, fim).reduce((x, d) => x + d.fat, 0), anoA = entre(D, `${y - 1}-01-01`, `${y - 1}${fim.slice(4)}`).reduce((x, d) => x + d.fat, 0);
  if (anoA > 0) L.push(`📈 No ano: ${brl(ano)} · ${pct(ano, anoA).replace(/^📈 |^📉 /, '')} vs mesmo período de ${y - 1}`);
  L.push(`📆 ${abertos.length} dias abertos · média ${brl(s.fat / (abertos.length || 1))}/dia`);
  let acc = 0, diaEq = null;
  for (const d of lista) { acc += d.fat; if (!diaEq && acc >= EQUILIBRIO) diaEq = d.data; }
  L.push(diaEq
    ? `✅ Contas do mês (~${brl(EQUILIBRIO)}) pagas no dia ${dd(diaEq)}`
    : `❌ Contas do mês (~${brl(EQUILIBRIO)}) não foram cobertas — faltaram ${brl(EQUILIBRIO - s.fat)}`);
  L.push(`💵 Sobra estimada do mês: ${mil(s.fat * MARGEM - CONTAS)}`);
  const melhor = [...lista].sort((a, b) => b.fat - a.fat)[0];
  L.push(`🥇 Melhor dia: ${DS[wd(melhor.data)]} ${dd(melhor.data)} — ${brl(melhor.fat)}`);
  const sab = lista.filter(d => wd(d.data) === 6 && d.fat > 0).sort((a, b) => a.fat - b.fat)[0];
  if (sab) L.push(`🥉 Pior sábado: ${dd(sab.data)} — ${brl(sab.fat)}`);
  L.push('', '🏆 *Top 5 do mês*');
  s.top.forEach(([p, q], i) => L.push(`${i + 1}. ${nome(p)} — ${q}`));
  L.push('', `⏰ Pico: ${s.pico.map(([h]) => h + 'h').join(' · ')}`);
  return L.join('\n');
}

async function enviaWpp(texto) {
  for (const [fone, key] of WPP) {
    const u = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(fone)}&text=${encodeURIComponent(texto)}&apikey=${encodeURIComponent(key)}`;
    const r = await fetch(u); const t = await r.text();
    console.log(`WhatsApp ${fone.slice(0, 4)}…${fone.slice(-4)}: ${r.ok && !/error|invalid/i.test(t) ? 'enviado' : 'FALHOU ' + t.replace(/<[^>]+>/g, ' ').slice(0, 150)}`);
    await new Promise(res => setTimeout(res, 3000));
  }
}

const D = await dias();
let msg;
if (MODO === 'mes') {
  const h = hojeSP(), [y, m] = h.split('-').map(Number);
  const ym = (process.argv[2] || '').slice(0, 7) || (m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`);
  msg = mes(D, ym);
} else {
  msg = semana(D, process.argv[2] || hojeSP());
}
console.log('Resumo montado (' + msg.length + ' caracteres)');
if (ENVIAR && WPP.length) await enviaWpp(msg); else console.log('(WhatsApp não enviado: teste ou sem WPP_DESTINOS)');
