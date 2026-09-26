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
}
if (!APPS) console.log('(sem APPS_SCRIPT_URL: nada foi gravado na planilha)');
if (diasRefresh <= 5) console.log(`ATENÇÃO: renovar acesso (vence em ${diasRefresh} dias)`);
