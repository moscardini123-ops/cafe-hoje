(function(){
const CONTAS = 14000, MARGEM = 0.69, EQ = Math.round(CONTAS / MARGEM / 100) * 100; // ~R$ 20.300
const DS = ['domingo','segunda','terça','quarta','quinta','sexta','sábado'], DSc = ['dom','seg','ter','qua','qui','sex','sáb'];
const MES = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
const $ = s => document.getElementById(s);
const ls = { get(k){try{return localStorage.getItem(k)}catch(e){return null}}, set(k,v){try{localStorage.setItem(k,v)}catch(e){}} };
const brl = v => 'R$ ' + Math.round(v).toLocaleString('pt-BR');
const brl2 = v => 'R$ ' + v.toLocaleString('pt-BR', {minimumFractionDigits:2, maximumFractionDigits:2});
const add = (d, n) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const wd = d => new Date(d + 'T12:00:00Z').getUTCDay();
const ddmm = d => d.slice(8, 10) + '/' + d.slice(5, 7);
const ddmmyy = d => ddmm(d) + '/' + d.slice(2, 4);
const hojeSP = () => new Intl.DateTimeFormat('en-CA', {timeZone:'America/Sao_Paulo'}).format(new Date());
function pascoa(y){const a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),mo=Math.floor((h+l-7*m+114)/31),da=((h+l-7*m+114)%31)+1;return `${y}-${String(mo).padStart(2,'0')}-${String(da).padStart(2,'0')}`}
const FER = {};
for (let y = 2023; y <= 2030; y++) {
Object.assign(FER, {[`${y}-01-01`]:'Ano-Novo',[`${y}-04-21`]:'Tiradentes',[`${y}-05-01`]:'Dia do Trabalho',[`${y}-09-07`]:'Independência',
[`${y}-10-12`]:'N. Sra. Aparecida',[`${y}-11-02`]:'Finados',[`${y}-11-15`]:'Proclamação da República',[`${y}-12-25`]:'Natal'});
if (y >= 2024) FER[`${y}-11-20`] = 'Consciência Negra';
const p = pascoa(y);
FER[add(p,-48)] = 'Carnaval'; FER[add(p,-47)] = 'Carnaval'; FER[add(p,-2)] = 'Sexta-feira Santa'; FER[p] = 'Páscoa'; FER[add(p,60)] = 'Corpus Christi';
}
const feriadoPerto = d => FER[d] ? FER[d] : (FER[add(d,1)] && (wd(d)===5||wd(d)===0) ? 'véspera de ' + FER[add(d,1)] : (FER[add(d,-1)] && wd(d)===6 ? 'feriadão de ' + FER[add(d,-1)] : null));
const P = new URLSearchParams(location.search);
let api = P.get('api'), k = P.get('k'), pin = P.get('c');
if (api && k) { ls.set('painel_api', api.split('?')[0]); ls.set('painel_k', k); }
if (pin) ls.set('painel_pin', pin);
if (api || k || pin) history.replaceState(null, '', location.pathname);   // tira a chave do endereço
api = ls.get('painel_api'); k = ls.get('painel_k'); pin = ls.get('painel_pin');
let D = [], IDX = {}, sel = hojeSP(), modo = ls.get('painel_modo') || 'semana';
async function carregar() {
const cache = ls.get('painel_cache');
if (cache) { try { usar(JSON.parse(cache)); } catch(e) {} }
let url;
if (pin) url = `/api/painel?c=${encodeURIComponent(pin)}&n=900`;
else if (api && k) url = `${api}?action=painel&k=${encodeURIComponent(k)}&n=900`;
else return pedirPin();
try {
const r = await fetch(url); const j = await r.json();
if (j.erro) { if (pin) { ls.set('painel_pin',''); return pedirPin('Código não confere. Tente de novo.'); } throw new Error(j.erro); }
usar(j); ls.set('painel_cache', JSON.stringify(j));
} catch (e) {
if (!D.length) $('app').innerHTML = `<p class="msg">Não consegui carregar agora.<br>Confira a internet e abra de novo.</p>`;
else $('upd').textContent = 'sem internet · dados salvos';
}
}
function pedirPin(err) {
$('app').innerHTML = `<div class="pin"><p class="txt">Digite o código do painel<br>(é só uma vez neste celular)</p>
<input id="pinI" inputmode="numeric" autocomplete="one-time-code" maxlength="8"><button id="pinB">Entrar</button>${err ? `<p class="err">${err}</p>` : ''}</div>`;
$('pinB').onclick = () => { const v = $('pinI').value.replace(/\D/g,''); if (!v) return; pin = v; ls.set('painel_pin', v); $('app').innerHTML = '<p class="msg">Carregando…</p>'; carregar(); };
}
function usar(j) {
D = (j.dias || []).map(x => ({...x, data: normData(x.data)})).filter(x => x.data).sort((a,b) => a.data < b.data ? -1 : 1);
IDX = {}; D.forEach(x => IDX[x.data] = x);
render();
}
function normData(s) { s = String(s||''); let m;
if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) return `${m[1]}-${m[2]}-${m[3]}`;
if ((m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/))) return `${m[3]}-${m[2]}-${m[1]}`;
return null; }
const soma = (a, b) => { let f = 0, p = 0; for (const x of D) { if (x.data < a) continue; if (x.data > b) break; f += x.fat; p += x.ped; } return {f, p}; };
const desloc = d => modo === 'ano' ? add(d, -364) : add(d, -7);         // mesmo dia da semana
const fimMes = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
function mesComp(d) { // mesmo pedaço do mês, no mês anterior ou no mesmo mês do ano passado
let y = +d.slice(0,4), m = +d.slice(5,7), dia = +d.slice(8,10);
if (modo === 'ano') y -= 1; else { m -= 1; if (!m) { m = 12; y -= 1; } }
const mm = String(m).padStart(2,'0'), ult = Math.min(dia, fimMes(y, m));
return {a:`${y}-${mm}-01`, b:`${y}-${mm}-${String(ult).padStart(2,'0')}`, nome: modo === 'ano' ? `${MES[m-1]} de ${y}` : MES[m-1]};
}
function chip(v, b, rot) {
if (!(b > 0)) return rot ? `<span class="chip flat">sem venda em ${rot}</span>` : `<span class="chip flat">sem comparação</span>`;
const p = (v - b) / b * 100, c = Math.abs(p) < 3 ? 'flat' : p > 0 ? 'up' : 'down';
return `<span class="chip ${c}">${p >= 0 ? '▲ +' : '▼ −'}${Math.abs(p).toFixed(0)}%${rot ? ' vs ' + rot : ''}</span>`;
}
const nomeP = s => String(s||'').toLowerCase().replace(/\s+/g,' ').trim().replace(/(^|[\s(])([^\s(])/g, (m,a,b) => a + b.toUpperCase()).replace(/ (Com|De|Da|Do|Das|Dos|E|Na|No|Em|Ao) /g, w => w.toLowerCase());
function render() {
const hoje = hojeSP(), primeiro = D.length ? D[0].data : hoje;
if (sel > hoje) sel = hoje;
const x = IDX[sel], cd = desloc(sel), cx = IDX[cd];
const rotC = modo === 'ano' ? `${DSc[wd(cd)]} ${ddmmyy(cd)}` : `${DSc[wd(cd)]} passad${wd(cd)===0||wd(cd)===6?'o':'a'}`;
const L = [];
L.push(`<div class="nav"><button id="ant" aria-label="Dia anterior" ${sel <= primeiro ? 'disabled' : ''}>‹</button>
<div class="dia"><b>${sel === hoje ? 'Hoje' : sel === add(hoje,-1) ? 'Ontem' : DS[wd(sel)][0].toUpperCase()+DS[wd(sel)].slice(1)}, ${ddmm(sel)}</b>
${sel !== hoje ? `<a href="#" id="volta">voltar para hoje</a>` : `<span>${DS[wd(sel)]}</span>`}</div>
<button id="prox" aria-label="Próximo dia" ${sel >= hoje ? 'disabled' : ''}>›</button></div>
<div class="seg" id="seg"><button data-m="semana" class="${modo==='semana'?'on':''}">vs semana passada</button><button data-m="ano" class="${modo==='ano'?'on':''}">vs ano passado</button></div>`);
const fs = feriadoPerto(sel), fc = feriadoPerto(cd);
if (fs || fc) L.push(`<div class="feriado">${fs ? `📅 ${sel===hoje?'Hoje':'Este dia'} é ${fs}.` : ''}${fs && fc ? '<br>' : ''}${fc ? `📅 O dia comparado (${ddmmyy(cd)}) foi ${fc}.` : ''}</div>`);
L.push('<div class="cards">');
if (x && x.ped) {
L.push(`<div class="card"><h2>Vendas ${sel===hoje?'de hoje':'do dia'}</h2><div class="big">${brl(x.fat)}</div>${chip(x.fat, cx && cx.fat, rotC)}
<p class="cmp">${cx && cx.fat ? `${DS[wd(cd)]} ${ddmmyy(cd)}: ${brl(cx.fat)} em ${cx.ped} pedidos` : `${DS[wd(cd)]} ${ddmmyy(cd)}: sem vendas`}</p>
<div class="row"><div><b>${x.ped}</b>pedidos</div><div><b>${brl2(x.ticket || x.fat / x.ped)}</b>por pedido</div>${x.canc ? `<div><b>${x.canc}</b>cancelados</div>` : ''}</div></div>`);
} else {
L.push(`<div class="card"><h2>Vendas ${sel===hoje?'de hoje':'do dia'}</h2><div class="big">R$ 0</div><p class="cmp">${sel===hoje?'Nenhuma venda registrada ainda hoje.':'Café fechado ou sem vendas neste dia.'}</p>
${cx && cx.fat ? `<p class="cmp">${DS[wd(cd)]} ${ddmmyy(cd)}: ${brl(cx.fat)}</p>` : ''}</div>`);
}
L.push(contas());
if (x && x.ped) {
const h = x.hora || {}, hc = (cx && cx.hora) || {};
const hs = [...new Set([...Object.keys(h), ...Object.keys(hc)].map(Number))].filter(n => n >= 6 && n <= 22).sort((a,b) => a-b);
if (hs.length) {
const mx = Math.max(1, ...hs.map(n => Math.max(+h[n]||0, +hc[n]||0))), pk = hs.reduce((a,n) => (+h[n]||0) > (+h[a]||0) ? n : a, hs[0]);
L.push(`<div class="card"><h2>Movimento por hora</h2><ul class="hrs">${hs.map(n => `<li><span>${n}h</span><span class="hb${n===pk?' pk':''}"><i style="width:${(+h[n]||0)/mx*100}%"></i>${hc[n]?`<em style="left:${(+hc[n])/mx*100}%"></em>`:''}</span><b>${brl(+h[n]||0)}</b></li>`).join('')}</ul>
<div class="leg"><span><i></i>${sel===hoje?'hoje':ddmm(sel)}</span><span><i class="t"></i>${ddmmyy(cd)}</span><span>mais cheia: <b>${pk}h</b></span></div></div>`);
}
const top = [...(x.top||[])].filter(t => t && t.p && !/embalage|sacola|taxa|couvert/i.test(t.p)).sort((a,b) => (b.q||0) - (a.q||0)).slice(0, 5);
if (top.length) L.push(`<div class="card"><h2>Mais vendidos</h2><ol class="top">${top.map(t => `<li>${nomeP(t.p)} <span>· ${t.q} un</span></li>`).join('')}</ol></div>`);
}
const seg = add(sel, -((wd(sel) + 6) % 7)), sw = soma(seg, sel), swc = soma(desloc(seg), desloc(sel));
const m0 = sel.slice(0,8) + '01', sm = soma(m0, sel), mc = mesComp(sel), smc = soma(mc.a, mc.b);
const y0 = sel.slice(0,4) + '-01-01', sy = soma(y0, sel), yc0 = (+sel.slice(0,4)-1) + '-01-01', ycd = (+sel.slice(0,4)-1) + sel.slice(4), syc = soma(yc0, ycd);
const ferSem = d0 => { const f = []; for (let d = d0, i = 0; i < 7; i++, d = add(d,1)) if (FER[d] && !f.includes(FER[d])) f.push(FER[d]); return f; };
const fs1 = ferSem(seg), fs2 = ferSem(desloc(seg));
L.push(`<div class="duo"><div class="card"><h2>Semana</h2><div class="big">${brl(sw.f)}</div>${chip(sw.f, swc.f)}
<p class="cmp">seg ${ddmm(seg)} a ${DSc[wd(sel)]} ${ddmm(sel)}<br>${modo==='ano'?'mesma semana de '+(+sel.slice(0,4)-1):'semana anterior'}: ${brl(swc.f)}${fs2.length?` <i>(teve ${fs2.join(', ')})</i>`:''}${fs1.length?`<br><i>esta semana tem ${fs1.join(', ')}</i>`:''}</p></div>
<div class="card"><h2>${MES[+sel.slice(5,7)-1]}</h2><div class="big">${brl(sm.f)}</div>${chip(sm.f, smc.f)}
<p class="cmp">até o dia ${+sel.slice(8,10)}<br>${mc.nome}: ${brl(smc.f)}</p></div></div>`);
if (syc.f > 0) L.push(`<div class="card"><h2>No ano de ${sel.slice(0,4)}</h2><div class="big">${brl(sy.f)}</div>${chip(sy.f, syc.f, sel.slice(0,4)-1)}
<p class="cmp">1º/jan a ${ddmm(sel)} · mesmo período de ${sel.slice(0,4)-1}: ${brl(syc.f)}</p>
<div class="row"><div><b>${sy.p.toLocaleString('pt-BR')}</b>pedidos</div><div><b>${syc.p.toLocaleString('pt-BR')}</b>em ${sel.slice(0,4)-1}</div></div></div>`);
if (x && x.ped && x.formas) {
const F = Object.entries(x.formas).filter(([,v]) => v > 0).sort((a,b) => b[1]-a[1]);
const nm = {debito:'Débito',credito:'Crédito',dinheiro:'Dinheiro',pix:'Pix',outros:'Outros'};
if (F.length) L.push(`<div class="card"><h2>Como pagaram</h2><p class="formas">${F.map(([k2,v]) => `${nm[k2]||k2} <b>${brl(v)}</b>`).join(' · ')}</p></div>`);
}
L.push(`<div class="card"><details class="inst"><summary>Colocar o painel na tela do celular</summary>
<p><b>iPhone (Safari):</b> toque em Compartilhar (quadrado com seta) → <b>Adicionar à Tela de Início</b>.</p>
<p><b>Android (Chrome):</b> toque nos 3 pontinhos ⋮ → <b>Adicionar à tela inicial</b>.</p>
<p>Vai aparecer o ícone "Café Hoje", que abre direto aqui.</p></details></div>`);
L.push('</div>');
if (x && x.atual) L.push(`<p class="atual">Atualizado: ${x.atual}</p>`);
$('app').innerHTML = L.join('');
const last = D.length ? D[D.length-1] : null;
$('upd').textContent = last && last.atual ? 'atualizado ' + String(last.atual).slice(-5) : '';
$('ant').onclick = () => { sel = add(sel,-1); render(); };
$('prox').onclick = () => { sel = add(sel,1); render(); };
if ($('volta')) $('volta').onclick = e => { e.preventDefault(); sel = hojeSP(); render(); };
$('seg').onclick = e => { const b = e.target.closest('button'); if (!b) return; modo = b.dataset.m; ls.set('painel_modo', modo); render(); };
}
function contas() {
const y = +sel.slice(0,4), m = +sel.slice(5,7), dia = +sel.slice(8,10), mm = String(m).padStart(2,'0');
const ini = sel.slice(0,8) + '01', lista = D.filter(x => x.data >= ini && x.data <= sel);
let acc = 0, diaEq = null; for (const x of lista) { acc += x.fat; if (!diaEq && acc >= EQ) diaEq = x.data; }
const pct = Math.min(100, acc / EQ * 100);
let txt;
if (diaEq) {
const sobra = acc * MARGEM - CONTAS;
txt = `✅ <b>Contas do mês pagas no dia ${+diaEq.slice(8,10)}.</b><br>Daí em diante, o que entra é sobra. Sobra estimada até agora: <b>${brl(Math.max(0, sobra))}</b> (antes da retirada).`;
} else {
txt = `<b>${pct.toFixed(0)}% das contas</b> do mês já pagas · faltam <b>${brl(EQ - acc)}</b>.`;
const ya = `${y-1}-${mm}`, lyLista = D.filter(x => x.data.startsWith(ya));
const lyAte = lyLista.filter(x => +x.data.slice(8,10) <= dia).reduce((a,x) => a + x.fat, 0);
if (lyLista.length && lyAte > 0 && acc > 0) {
const r = acc / lyAte; let c = 0, prev = null;
for (const x of lyLista) { c += x.fat; if (c * r >= EQ) { prev = +x.data.slice(8,10); break; } }
const totM = lyLista.reduce((a,x) => a + x.fat, 0) * r;
txt += prev && prev > dia ? `<br>No ritmo deste mês, devem fechar por volta do <b>dia ${prev}</b>.`
: !prev ? `<br>No ritmo deste mês, ${MES[m-1]} fecha perto de <b>${brl(totM)}</b>, abaixo das contas.` : '';
}
}
return `<div class="card"><h2>Contas do mês</h2><div class="prog${diaEq?'':' falta'}"><i style="width:${pct}%"></i></div>
<p class="txt">${txt}</p><p class="cmp">Contas fixas + equipe ≈ ${brl(CONTAS)}. Para cobrir, o café precisa vender ~${brl(EQ)} no mês.</p></div>`;
}
carregar();
})();
