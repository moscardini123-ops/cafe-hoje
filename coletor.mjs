// Café Hoje — coletor GrandChef (Node 18+, sem dependências)
// Uso: GC_DEVICE=... GC_REFRESH=... node coletor.mjs [AAAA-MM-DD]
// GC_DEVICE  = vuex.connection.device.access_token   (vale 1 ano)
// GC_REFRESH = vuex.authorization.user.refresh_token (vale 30 dias)
// Saída: resumo do dia em JSON (stdout) e, se APPS_SCRIPT_URL existir, envia para a planilha.
const BASE = 'https://cafedamantiqueira.grandchef.com.br/graphql';
const limpa = v => String(v || '').trim().replace(/^["']|["']$/g, '').replace(/^(Bearer|Device)\s+/i, '');
const DEVICE = limpa(process.env.GC_DEVICE), REFRESH = limpa(process.env.GC_REFRESH);
const marca = v => `${v.length} caracteres, termina em ...${v.slice(-5)}`;
let TOKEN = '';

async function login() {
  const r = await fetch(BASE, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-app-version': '3.6.0', authorization: 'Device ' + DEVICE },
    body: JSON.stringify({ operationName: 'RefreshToken',
      query: 'mutation RefreshToken($refresh_token: String!) { RefreshToken(refresh_token: $refresh_token) { access_token } }',
      variables: { refresh_token: REFRESH } }),
  });
  const j = await r.json();
  const t = j?.data?.RefreshToken?.access_token;
  if (!t) {
    console.log('GC_DEVICE :', marca(DEVICE), '(esperado: 407, ...OmdnM)');
    console.log('GC_REFRESH:', marca(REFRESH), '(esperado: 303, ...iekKJA)');
    throw new Error('Login falhou: ' + JSON.stringify(j.errors || j));
  }
  TOKEN = `Bearer ${t}, Device ${DEVICE}`;
  const exp = JSON.parse(Buffer.from(REFRESH.split('.')[1], 'base64url')).exp * 1000;
  const dias = Math.floor((exp - Date.now()) / 864e5);
  if (dias <= 5) console.warn(`ATENÇÃO: refresh token vence em ${dias} dias — renovar.`);
  return dias;
}
const APPS = process.env.APPS_SCRIPT_URL || '';
const KEY = process.env.CAFE_KEY || '';

async function gql(operationName, query, variables) {
  const r = await fetch(BASE, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-app-version': '3.6.0', authorization: TOKEN },
    body: JSON.stringify({ operationName, query, variables }),
  });
  const j = await r.json();
  if (j.errors && !j.data) throw new Error(operationName + ': ' + JSON.stringify(j.errors));
  if (j.errors) console.warn(`aviso ${operationName}: ${j.errors.length} campo(s) com erro, ignorados`);
  return j.data;
}

const Q_PEDIDOS = `query GetOrdersReport($filter: PedidoFilter, $order: PedidoOrder, $page: Int, $limit: Int) {
  relatorio_pedidos(filter: $filter, order: $order, page: $page, limit: $limit) {
    pedidos { data { id codigo tipo origem mesa { nome } comanda { nome } estado total descontos pessoas data_criacao data_conclusao } last_page total }
    total ticket_medio cancelados total_cancelados descontos
  } }`;

const Q_PEDIDO = `query GetOrderSummary($codigo: String) { pedido(codigo: $codigo) {
  id codigo total
  itens { quantidade preco total cancelado produto { id descricao } }
  pagamentos { lancado estado forma { tipo descricao } } } }`;

const Q_PRODUTOS = `query GetDashboardProductSales($inicio: DateTime, $fim: DateTime) {
  venda_produto(inicio: $inicio, fim: $fim) { produto_id descricao categoria quantidade valor } }`;

const Q_PAGTOS = `query GetDashboardPaymentMethod($inicio: DateTime!, $fim: DateTime!) {
  pagamento_venda(inicio: $inicio, fim: $fim) { descricao tipo quantidade valor } }`;

const hojeSP = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);

async function coletaDia(dia) {
  const ini = `${dia}T00:00:00-03:00`, fim = `${dia}T23:59:59-03:00`;
  const pedidos = []; let page = 1, rel;
  do {
    rel = (await gql('GetOrdersReport', Q_PEDIDOS, {
      filter: { data_criacao: { from: ini, to: fim } }, order: { id: 'asc' }, page, limit: 100,
    })).relatorio_pedidos;
    pedidos.push(...rel.pedidos.data);
  } while (page++ < rel.pedidos.last_page);

  const itens = [], pagamentos = [];
  for (const p of pedidos) {
    const d = (await gql('GetOrderSummary', Q_PEDIDO, { codigo: p.codigo })).pedido;
    for (const it of d.itens) if (!it.cancelado)
      itens.push({ pedido: p.id, produto: it.produto?.descricao, quantidade: it.quantidade, preco: it.preco, total: it.total });
    for (const pg of d.pagamentos) pagamentos.push({ pedido: p.id, forma: pg.forma?.descricao, valor: pg.lancado });
  }

  const produtos = (await gql('GetDashboardProductSales', Q_PRODUTOS, { inicio: ini, fim })).venda_produto;
  const formas = (await gql('GetDashboardPaymentMethod', Q_PAGTOS, { inicio: ini, fim })).pagamento_venda;

  const porHora = {};
  for (const p of pedidos) {
    const h = new Date(new Date(p.data_criacao).getTime() - 3 * 3600e3).getUTCHours();
    porHora[h] = (porHora[h] || 0) + p.total;
  }
  return {
    dia,
    resumo: { faturamento: rel.total || 0, pedidos: pedidos.length, ticket_medio: rel.ticket_medio,
              cancelados: rel.cancelados, descontos: rel.descontos },
    top: [...produtos].sort((a, b) => b.valor - a.valor),
    formas, porHora, pedidos, itens, pagamentos,
  };
}

// ---------- WhatsApp (CallMeBot) ----------
// WPP_DESTINOS = "5535999999999:APIKEY,5535988888888:APIKEY2"   ENVIAR_WPP=1 liga o envio
const WPP = (process.env.WPP_DESTINOS || '').split(',').map(x => x.trim()).filter(Boolean).map(x => x.split(':'));
const PAINEL = process.env.PAINEL_URL || `https://cafe-da-mantiqueira.vercel.app/painel?api=${encodeURIComponent(process.env.APPS_SCRIPT_URL || '')}&k=${encodeURIComponent(process.env.CAFE_KEY || '')}`;
const DS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'], DL = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const brl = v => 'R$ ' + (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const brl0 = v => 'R$ ' + Math.round(v || 0).toLocaleString('pt-BR');
const nomeP = s => { s = String(s).toLowerCase().replace(/\s+/g, ' ').replace(/\s*\(.*?\)\s*/g, ' ').trim(); return s.charAt(0).toUpperCase() + s.slice(1); };

async function totalDia(dia) {
  const q = `query GetOrdersReport($filter: PedidoFilter, $page: Int, $limit: Int) { relatorio_pedidos(filter: $filter, page: $page, limit: $limit) { total pedidos { total } } }`;
  const r = (await gql('GetOrdersReport', q, { filter: { data_criacao: { from: `${dia}T00:00:00-03:00`, to: `${dia}T23:59:59-03:00` } }, page: 1, limit: 1 })).relatorio_pedidos;
  return { fat: r.total || 0, ped: r.pedidos.total || 0 };
}

function mensagem(out, ant) {
  const d = new Date(out.dia + 'T12:00:00Z'), wd = d.getUTCDay(), r = out.resumo;
  const titulo = `*☕ Café da Mantiqueira — ${DS[wd]} ${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}*`;
  if (!out.pedidos.length) return `${titulo}\n\nNenhuma venda registrada hoje.\n\n📊 Painel: ${PAINEL}`;
  const L = [titulo, '', `💰 *${brl(r.faturamento)}* em ${out.pedidos.length} pedidos`];
  if (ant && ant.fat > 0) {
    const p = (r.faturamento - ant.fat) / ant.fat * 100;
    L.push(`${p >= 0 ? '📈' : '📉'} ${p >= 0 ? '+' : '−'}${Math.abs(p).toFixed(0)}% vs ${DL[wd]} passad${wd === 0 || wd === 6 ? 'o' : 'a'} (${brl(ant.fat)})`);
  }
  L.push(`🧾 Ticket médio: ${brl(r.faturamento / out.pedidos.length)}`, '', '🏆 *Mais vendidos*');
  [...out.top].sort((a, b) => b.quantidade - a.quantidade).slice(0, 5)
    .forEach((t, i) => L.push(`${i + 1}. ${nomeP(t.descricao)} — ${t.quantidade} un`));
  const F = {}; out.formas.forEach(f => F[f.descricao] = (F[f.descricao] || 0) + f.valor);
  L.push('', '💳 ' + Object.entries(F).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${brl0(v)}`).join(' · '));
  const hs = Object.entries(out.porHora).sort((a, b) => b[1] - a[1]);
  if (hs.length) L.push(`⏰ Hora mais cheia: ${hs[0][0]}h (${brl0(hs[0][1])})`);
  L.push('', `📊 Painel: ${PAINEL}`);
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

const diasRefresh = await login();
const soma = (d, n) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const ini = process.argv[2] || hojeSP(), fimR = process.argv[3] || ini;
for (let dia = ini; dia <= fimR; dia = soma(dia, 1)) {
  const out = await coletaDia(dia);
  out.diasRefresh = diasRefresh;
  const r = out.resumo;
  console.log(`${dia}  R$ ${(r.faturamento || 0).toFixed(2).padStart(9)}  ${String(out.pedidos.length).padStart(3)} pedidos  ${String(out.itens.length).padStart(4)} itens`);
  if (APPS && out.pedidos.length) {
    const resp = await fetch(APPS, { method: 'POST', body: JSON.stringify({ action: 'cafeHoje', key: KEY, ...out }) });
    const t = await resp.text();
    if (!t.includes('"ok":true')) console.log('   planilha:', t.slice(0, 200));
  }
  if (process.env.ENVIAR_WPP === '1') {
    const ant = await totalDia(soma(dia, -7)).catch(() => null);
    const msg = mensagem(out, ant);
    console.log('\n' + msg + '\n');
    if (WPP.length) await enviaWpp(msg); else console.log('(sem WPP_DESTINOS: mensagem não enviada)');
  }
}
if (!APPS) console.log('(sem APPS_SCRIPT_URL: nada foi gravado na planilha)');
if (diasRefresh <= 5) console.log(`ATENÇÃO: renovar acesso (vence em ${diasRefresh} dias)`);
