(function(){
const MES=['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
const brl=v=>'R$ '+Math.round(v).toLocaleString('pt-BR'), mil=v=>v>=1e5?'R$ '+Math.round(v/1e3).toLocaleString('pt-BR')+' mil':'R$ '+(v/1e3).toLocaleString('pt-BR',{maximumFractionDigits:1})+' mil';
const num=v=>Math.round(v).toLocaleString('pt-BR');
const norm=s=>{s=String(s||'');let m;if((m=s.match(/^(\d{4})-(\d{2})-(\d{2})/)))return `${m[1]}-${m[2]}-${m[3]}`;if((m=s.match(/^(\d{2})\/(\d{2})\/(\d{4})/)))return `${m[3]}-${m[2]}-${m[1]}`;return null};
const hoje=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date());
function chip(a,b){if(!(b>0))return '';const p=(a-b)/b*100,c=Math.abs(p)<3?'flat':p>0?'up':'down';return `<span class="chip ${c}" style="font-size:13px;padding:2px 8px;margin:0">${p>=0?'▲ +':'▼ −'}${Math.abs(p).toFixed(0)}%</span>`}
function dados(){try{return (JSON.parse(localStorage.getItem('painel_cache')||'{}').dias||[]).map(x=>({d:norm(x.data),f:+x.fat||0,p:+x.ped||0})).filter(x=>x.d)}catch(e){return []}}
function somaM(D,ym,ate){let f=0,p=0;for(const x of D)if(x.d.startsWith(ym)&&(!ate||+x.d.slice(8,10)<=ate)){f+=x.f;p+=x.p}return{f,p}}
function cards(){
  const D=dados();if(!D.length)return '';
  const h=hoje(),Y=+h.slice(0,4),M=+h.slice(5,7),dia=+h.slice(8,10);const rows=[];
  for(let i=0;i<12;i++){let y=Y,m=M-i;while(m<1){m+=12;y--}
    const ym=`${y}-${String(m).padStart(2,'0')}`,atual=i===0,ly=`${y-1}-${String(m).padStart(2,'0')}`;
    const s=somaM(D,ym,atual?dia:0),a=somaM(D,ly,atual?dia:0);
    rows.push({lab:`${MES[m-1]}/${String(y).slice(2)}`,atual,s,a,ly:`${MES[m-1]}/${String(y-1).slice(2)}`});}
  const mx=Math.max(1,...rows.map(r=>Math.max(r.s.p,r.a.p)));
  const L=[`<div class="card" id="mesames"><h2>Pedidos mês a mês</h2><p class="cmp" style="margin:0 0 8px">Barra: pedidos do mês. Traço: mesmo mês do ano anterior.</p><ul class="hrs">`];
  for(const r of rows)L.push(`<li style="grid-template-columns:54px 1fr 64px"><span><b style="text-align:left">${r.lab}</b></span><span class="hb${r.atual?'':' '}"><i style="width:${r.s.p/mx*100}%"></i>${r.a.p?`<em style="left:${r.a.p/mx*100}%"></em>`:''}</span><b>${num(r.s.p)}</b></li>
   <li style="grid-template-columns:54px 1fr;margin:-4px 0 4px;font-size:13.5px;color:var(--ink3)"><span></span><span>${r.atual?`até o dia ${dia} · `:''}${mil(r.s.f)} · ticket ${r.s.p?brl(r.s.f/r.s.p):'—'}${r.a.p?` · ${r.ly}: ${num(r.a.p)} pedidos `+chip(r.s.p,r.a.p):''}</span></li>`);
  L.push('</ul></div>');
  // por ano
  const ini=D.reduce((m,x)=>x.d<m?x.d:m,D[0].d);const anos=[...new Set(D.map(x=>+x.d.slice(0,4)))].sort();const md=h.slice(5);
  L.push(`<div class="card"><h2>Por ano</h2><table style="width:100%;border-collapse:collapse;font-size:15px"><tr style="color:var(--ink3);font-size:12px;text-transform:uppercase;letter-spacing:.05em"><td style="padding:4px 0">Ano</td><td style="text-align:right">Pedidos</td><td style="text-align:right">Vendas</td><td style="text-align:right">Ticket</td></tr>`);
  for(const y of anos){let f=0,p=0;for(const x of D)if(x.d.startsWith(y+'-')){f+=x.f;p+=x.p}
    L.push(`<tr style="border-top:1px solid var(--line)"><td style="padding:8px 0;font-weight:700">${y}${y===Y?' <span style="font-weight:400;color:var(--ink3);font-size:13px">até hoje</span>':(y===anos[0]&&ini.slice(5,7)!=='01'?` <span style="font-weight:400;color:var(--ink3);font-size:13px">desde ${MES[+ini.slice(5,7)-1]}</span>`:'')}</td><td style="text-align:right;font-weight:600">${num(p)}</td><td style="text-align:right">${mil(f)}</td><td style="text-align:right">${p?brl(f/p):'—'}</td></tr>`);}
  const py=Y-1;let a=0,b=0,pa=0,pb=0;for(const x of D){if(x.d.startsWith(Y+'-')){a+=x.f;pa+=x.p}if(x.d.startsWith(py+'-')&&x.d.slice(5)<=md){b+=x.f;pb+=x.p}}
  L.push(`</table>${pb?`<p class="cmp" style="margin-top:8px">${Y} até ${h.slice(8,10)}/${h.slice(5,7)}: ${num(pa)} pedidos ${chip(pa,pb)} vs ${num(pb)} no mesmo período de ${py}.</p>`:''}${anos[0]&&D[0]?`<p class="cmp">Dados desde ${D.reduce((m,x)=>x.d<m?x.d:m,D[0].d).split('-').reverse().join('/')}.</p>`:''}</div>`);
  return L.join('');
}
let pend=false;
function por(){pend=false;const app=document.getElementById('app');if(!app||document.getElementById('mesames'))return;
  const inst=app.querySelector('details.inst');if(!inst)return;const alvo=inst.closest('.card');
  const w=document.createElement('div');w.innerHTML=cards();while(w.firstChild)alvo.parentNode.insertBefore(w.firstChild,alvo);}
new MutationObserver(()=>{if(!pend){pend=true;setTimeout(por,0)}}).observe(document.getElementById('app'),{childList:true});
setTimeout(por,0);
})();
