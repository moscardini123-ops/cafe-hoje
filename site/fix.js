// Recupera o que ficou salvo só neste celular e envia item por item (nunca apaga a planilha)
function pendentesLocais(){
  let loc; try{loc=JSON.parse(LS.get('local')||'null')}catch(e){loc=null}
  if(!loc||!API||LS.get('local_enviado'))return null;
  const mapI=Object.fromEntries(DB.ings.map(x=>[x.nome,JSON.stringify(x)]));
  const mapR=Object.fromEntries(DB.recs.map(x=>[x.nome,JSON.stringify(x)]));
  const ings=(loc.ings||[]).filter(x=>JSON.stringify(x)!==mapI[x.nome]&&(confI(x)||!mapI[x.nome]||x.obs));
  const recs=(loc.recs||[]).filter(x=>JSON.stringify(x)!==mapR[x.nome]&&(confR(x)||!mapR[x.nome]||x.obs));
  return (ings.length||recs.length)?{ings,recs}:null;
}
async function enviarLocais(){
  const p=pendentesLocais(); if(!p)return;
  const b=document.getElementById('btnEnviar'); if(b){b.disabled=true;b.textContent='Enviando...'}
  let ok=0,fal=0;
  const manda=async(acao,o)=>{try{const r=await fetch(API,{method:'POST',body:JSON.stringify({action:acao,obj:o})});const j=await r.json();if(j.erro)throw 0;ok++}catch(e){fal++}};
  for(const o of p.ings)await manda('saveIng',o);
  for(const o of p.recs)await manda('saveRec',o);
  if(!fal){LS.set('local_enviado',new Date().toISOString());toast(ok+' itens enviados para a planilha')}
  else alert('Enviei '+ok+' e '+fal+' nao foram. Confira a internet e toque de novo.');
  carregar();
}
const telaInicioOriginal=telaInicio;
telaInicio=function(){
  const html=telaInicioOriginal(), pend=pendentesLocais();
  if(!pend)return html;
  const n=pend.ings.length+pend.recs.length;
  const aviso='<div class="card" style="border:2px solid #C8851A;background:#FFF6E5"><b>Achei '+n+' itens que você preencheu e ficaram só neste celular.</b><p class="small" style="margin:6px 0 10px">Toque no botão para mandar para a planilha. Nada do que já está lá é apagado.</p><button class="btn" id="btnEnviar" onclick="enviarLocais()">Enviar para a planilha</button></div>';
  return html.replace('</h2>','</h2>'+aviso);
};
render();
