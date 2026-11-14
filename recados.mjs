// Recados motivadores no fim das mensagens do WhatsApp.
// O recado muda conforme o resultado (dia/semana/mês bom ou fraco) e gira pela data, para não repetir.

const R = {
  otimo: [
    'Que dia! Esse resultado é fruto do capricho de vocês em cada xícara. 👏',
    'Casa cheia é sinal de trabalho bem feito. Orgulho dessa equipe!',
    'Dia de colher o que vocês plantaram. Aproveitem essa conquista!',
    'Os clientes voltam porque são bem recebidos. Isso é mérito de vocês.',
    'Resultado lindo! Hoje vale descansar com o coração tranquilo.',
    'Cada pão, cada café e cada sorriso somaram nesse número. Parabéns!',
    'Que orgulho ver o café crescendo assim, dia após dia.',
  ],
  bom: [
    'Mais um dia de portas abertas e clientes bem atendidos. Isso constrói o café.',
    'Constância vale ouro. Um dia de cada vez, sempre com carinho.',
    'Dia bom, trabalho honesto. Obrigado por tanto cuidado com o café.',
    'Quem planta com paciência colhe com fartura. Sigam assim!',
    'O café está em boas mãos. Bom descanso hoje!',
    'Cada cliente bem atendido volta e traz mais um. Continuem assim!',
  ],
  fraco: [
    'Dias mais calmos fazem parte. O que importa é a caminhada, e ela está boa.',
    'Movimento tem altos e baixos, mas o café vem crescendo no ano. Confiem no trabalho de vocês!',
    'Dia tranquilo também é dia de cuidar da casa e se preparar para o próximo cheio.',
    'Não se cobre por um dia mais fraco: o mês é feito de muitos dias, e vocês estão indo bem.',
    'Até as melhores cafeterias têm dias calmos. Amanhã é uma nova chance.',
    'Respira fundo: o trabalho de vocês aparece no ano, não em um dia só.',
  ],
  semana_boa: [
    'Que semana! Vocês merecem cada real desse resultado. Descansem bem. 🌿',
    'Semana bonita de ver. O carinho de vocês está chegando nos clientes.',
    'Mais uma semana vencida com garra. Orgulho dessa família!',
  ],
  semana_fraca: [
    'Semana mais calma, e tudo bem. O ano está bom e a próxima semana é nova.',
    'Nem toda semana é cheia, mas toda semana vocês fazem bem feito. Bom descanso!',
    'Semana tranquila serve para recarregar. Vocês estão no caminho certo.',
  ],
  mes_bom: [
    'Mês fechado com chave de ouro! Esse café é obra de vocês. 🎉',
    'Que mês! Cada madrugada de trabalho está valendo a pena.',
  ],
  mes_fraco: [
    'Mês mais calmo, mas o café segue firme e crescendo no ano. Força e confiança!',
    'Meses fracos passam; o que vocês construíram fica. Bora para o próximo!',
  ],
};

// tipo: 'otimo' | 'bom' | 'fraco' | 'semana_boa' | 'semana_fraca' | 'mes_bom' | 'mes_fraco'
export function recado(tipo, dataISO) {
  const lista = R[tipo] || R.bom;
  const n = Math.floor(new Date((dataISO || new Date().toISOString().slice(0, 10)) + 'T12:00:00Z') / 864e5);
  return '💬 _' + lista[n % lista.length] + '_';
}

// variação em % (ex.: +18 ou −7) → tipo do dia
export function tipoDia(variacao) {
  if (variacao == null || isNaN(variacao)) return 'bom';
  if (variacao >= 15) return 'otimo';
  if (variacao >= -5) return 'bom';
  return 'fraco';
}
