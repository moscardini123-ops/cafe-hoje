# Sistema próprio do Café da Mantiqueira — especificação v1

Base: mapeamento das telas do GrandChef 3.6.1 feito em 18/11/2026. O mapeamento completo fica fora deste repositório, porque contém dados de venda e de clientes.

Este repositório é público. Nenhum número de faturamento, dado de cliente, chave ou senha entra aqui.

---

## 1. Decisão de arquitetura

> **Atualização de 18/11/2026:** a família decidiu ter um sistema próprio completo e modular, rodando nas duas lojas em menos de um mês. A venda própria com NFC-e (Focus NFe) é o último módulo. Até ele ficar pronto, a venda continua no GrandChef, ligada ao sistema como um módulo de leitura. Código e estrutura em `sistema/`.

**O GrandChef continua fazendo a venda. O sistema próprio faz o resto, por cima dele.**

| Fica no GrandChef | Vai para o sistema próprio |
|---|---|
| Venda no balcão, na mesa e pelo QR Code da mesa | Conferência do caixa |
| Tela e impressão de preparo | Registro de sobra e perda |
| Pagamento (maquininha, Pix) | Lista de produção da semana |
| Nota fiscal (NFC-e) | Cardápio central com custo e margem |
| Abrir e fechar o caixa no sistema | Comparação entre as duas lojas |
| Cadastro de produto e preço (por enquanto) | Estoque do empório |

**Por quê**
- O pedido pelo QR Code da mesa é o canal principal de venda. Refazer isso, com nota fiscal e maquininha, é o trabalho mais caro e mais arriscado.
- Emitir NFC-e exige credenciamento na Secretaria da Fazenda de Minas, certificado digital e contingência.
- O que falta ao café (produção, sobra, caixa conferido) não depende de nada disso.

**Revisar esta decisão** depois de 6 meses de sistema próprio rodando. Se for substituir o PDV, usar um emissor fiscal terceirizado (API de NFC-e), nunca emissão própria.

**Como os dados correm**

```
GrandChef ──(robô, só leitura)──> Planilha Google ──> Painel e apps (Vercel)
                                       ^
              formulários do sistema próprio (caixa, sobra, produção)
```

- O robô (`coletor.mjs`) já baixa, por dia: todos os pedidos com itens, venda por produto, formas de pagamento e venda por hora.
- Os formulários novos gravam na mesma planilha, pelo Apps Script.
- As telas novas ficam no site da Vercel (`site/`), protegidas por PIN como o painel.

**Regra herdada do mapeamento:** um clique de navegação nunca cria nem altera dado. Toda ação de liga/desliga tem rótulo escrito, não só ícone.

---

## 2. Ajustes no GrandChef sem programar

Fazer na semana 2 da estadia, com a Eliana do lado. Custo zero, efeito imediato.

| # | Ajuste | Onde | Por quê |
|---|---|---|---|
| 1 | Criar um login com PIN para cada pessoa da equipe, no cargo certo (Operador de Caixa, Garçom, Cozinheiro) | Usuários › Funcionários e Prestadores | Hoje todos usam o login de administrador. Não dá para saber quem vendeu, deu desconto ou cancelou |
| 2 | Ligar "exigir motivo no cancelamento" | Sistema › Comportamento | Cancelamento sem motivo é o furo mais comum de caixa |
| 3 | Ligar "informar forma de pagamento no fechamento" | Sistema › Comportamento | Prepara a conferência do caixa |
| 4 | Corrigir os horários: terça fechado e horário real nos outros dias | Configurações › Horários | O cardápio online diz "aberto até 23:59" todos os dias |
| 5 | Desativar as mesas que não existem (ficar com 11) e as comandas sem uso | Mesas, Comandas | Menos erro de lançamento |
| 6 | Juntar as categorias duplicadas e apagar "Borda" | Produtos › Categorias | Cardápio mais limpo para o cliente |
| 7 | Reduzir os setores de preparo a cozinha e bar | Ambiente › Setores | A impressão vai para o lugar certo |
| 8 | Nunca usar "Limpar dados" | Sistema › Comportamento | Apaga o histórico |

Os itens 1 a 3 dependem de a Eliana concordar com a nova alçada da Cristina (processo 5 do plano da estadia).

---

## 3. Módulos do sistema próprio

### Fase 1 — o que muda a rotina (semanas 2 a 4)

#### M1. Fechamento de caixa conferido

- **Objetivo:** todo dia, comparar o que o GrandChef diz que entrou com o que foi contado na gaveta e na maquininha.
- **Quem usa:** quem fecha o caixa (Cristina nos fins de semana). Matheus confere.
- **Entrada:** formulário no celular, depois de fechar o caixa no GrandChef.
  - PIN de quem está fechando.
  - Dinheiro contado na gaveta.
  - Total de crédito, débito e Pix pelo relatório da maquininha.
  - Sangrias feitas no dia.
- **Regras:**
  - O sistema busca as formas de pagamento do dia que o robô já coletou e calcula a diferença por forma.
  - Diferença total acima de R$ 20 exige justificativa, escolhida numa lista: troco errado, venda não lançada, sangria não registrada, pagamento em outra forma, outro (com texto).
  - A comparação definitiva sai na recoleta das 8h do dia seguinte, quando o dia já está completo no robô.
- **Saída:**
  - Aba "Fechamento" na planilha.
  - WhatsApp para o Matheus quando a diferença passar de R$ 20.
  - Linha nova no resumo semanal: dias conferidos e diferença acumulada.
- **Pronto quando:** 7 fechamentos seguidos registrados, com diferença calculada sozinha.

#### M2. Sobra e perda

- **Objetivo:** saber o que sobrou e o que foi jogado fora, por item, para produzir pela venda.
- **Quem usa:** quem fecha a cozinha, todo dia de funcionamento. Domingo é obrigatório.
- **Entrada:** lista fixa dos itens de produção própria (bolos, pães, salgados, tortas), com campo de quantidade.
  - Para cada item: quanto sobrou e o destino.
  - Destinos: vende amanhã, equipe comeu, doação, descarte.
  - Se for descarte, o motivo: venceu, queimou ou estragou, caiu ou quebrou, outro.
- **Regras:**
  - Unidade é a mesma da venda (fatia, unidade, porção).
  - Item sem preenchimento conta como sobra zero, mas o dia fica marcado como incompleto.
- **Saída:** aba "Sobra" na planilha. Card de sobra no painel. Base para o M3.
- **Pronto quando:** 2 domingos seguidos registrados.

#### M3. Lista de produção da semana

- **Objetivo:** dizer à Eliana quanto produzir de cada item, de terça a quinta, pela venda real.
- **Quem usa:** Eliana. Matheus revisa.
- **Quando:** gerada toda segunda às 20h (o café fecha na terça).
- **Cálculo por item:**
  1. Venda média por dia da semana nas últimas 4 semanas, a partir da venda por produto que o robô já coleta.
  2. Semanas com feriado ou temporada marcadas no calendário entram separadas.
  3. Se a sobra média do item (M2) passou de 15% da venda, reduzir na mesma proporção.
  4. Somar margem de segurança de 10%.
  5. Converter para unidade de produção pelo rendimento da receita (ex.: fatias por bolo), arredondando para cima.
- **Dado que falta:** a ligação entre o produto vendido e o item produzido (ex.: "fatia de bolo de cenoura" sai do "bolo de cenoura", que rende N fatias). Montar uma vez, a partir das receitas do app de preços.
- **Saída:**
  - Mensagem de WhatsApp para a Eliana, em linguagem simples: "Esta semana: 5 bolos de cenoura (vendeu 52 fatias na semana passada, sobraram 3)."
  - Versão para imprimir no formato da folha de produção que já existe.
- **Pronto quando:** a Eliana produzir 2 semanas pela lista e a sobra de domingo cair.

### Fase 2 — dinheiro e duas lojas (mês 2)

#### M4. Cardápio central com custo e margem

- Base: exportação de produtos do GrandChef mais as receitas e ingredientes do app de preços.
- Para cada item: preço, custo pela receita, sobra por unidade (preço × 0,57 − ingredientes), categoria limpa.
- Mudança de preço continua sendo feita à mão no GrandChef. O sistema próprio é a referência, não sincroniza de volta.

#### M5. Duas lojas no painel

- O GrandChef da praça como loja separada, idealmente com conta e CNPJ próprios.
- O robô passa a receber a loja como parâmetro, com as chaves de cada loja em Secrets separados.
- Painel com estrada e praça lado a lado, meta diária da praça e limite de perda acumulado.

#### M6. Venda por hora e escala

- Venda por faixa de hora (já coletada) cruzada com quem estava trabalhando.
- Entrada: escala da semana, num formulário simples.
- Saída: horas com gente demais ou de menos, para ajustar a escala e o horário de abertura.

### Fase 3 — estoque do empório (mês 3)

#### M7. Estoque do empório

- Só produto de revenda (café em grão, geleias, queijos, bebidas). Produção própria fica no M2 e no M3.
- Entrada de compra com foto da nota (processo 2 do plano: compras do café separadas das da casa).
- Saída pela venda que o robô coleta.
- Contagem mensal com diferença.
- Alerta de estoque mínimo e de validade.

---

## 4. Fora de escopo agora

- Substituir o PDV, o pedido pelo QR Code, a nota fiscal ou a maquininha.
- Delivery, marketplaces, fidelidade por pontos, promoções.
- Contas a pagar e DRE (ficam no Fingu).
- Qualquer escrita no GrandChef. O robô e o sistema próprio só leem.
- Guardar dado pessoal de cliente (nome, telefone, CPF). Os relatórios são por produto, dia e forma de pagamento.

---

## 5. Perguntas que bloqueiam

| Pergunta | Bloqueia |
|---|---|
| Quem fecha o caixa e a que horas? Alguém já conta a gaveta? | M1 |
| Qual maquininha usam e se ela tem relatório diário por forma | M1 |
| Quais itens a Eliana produz e o rendimento de cada um | M2, M3 |
| Como ela decide hoje quanto produzir | M3 |
| A praça terá CNPJ e conta própria no GrandChef? | M5 |
| Qual emissor de NFC-e o GrandChef usa hoje | Revisão da decisão de arquitetura |

As demais perguntas do mapeamento ficam para a conversa com a equipe na semana 1.
