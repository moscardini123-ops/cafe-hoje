# Sistema do Café da Mantiqueira

Sistema próprio e modular das duas lojas: estrada e praça. Um núcleo fixo e módulos que se ligam ou desligam por loja.

Esta pasta vai para um repositório privado quando ele for criado. Aqui só entra código: **nenhum dado de venda, de cliente, chave ou senha.**

## Como está organizado

| Parte | O que tem | Onde |
|---|---|---|
| Núcleo | Lojas, pessoas com PIN, módulos por loja, catálogo, insumos, receitas, calendário, registro de eventos | `db/migrations/0001_nucleo.sql` |
| Venda | Contrato que qualquer fonte de venda cumpre: pedidos e resumos por dia | `0002_venda.sql` |
| Sobra e perda | O que sobrou, destino e motivo | `0003_sobra.sql` |
| Produção | Previsão pela venda, lista da semana, registro, remessa por loja | `0004_producao.sql` |
| Caixa conferido | Contagem no fechamento × venda registrada | `0005_caixa.sql` |
| Compras | Lista de mercado a partir da produção | `0006_compras.sql` |
| Fiscal | NFC-e pela Focus NFe. Desligado até existir venda própria | `0007_fiscal.sql` |
| Módulos e lojas | Catálogo de módulos, dependências e o que fica ligado em cada loja | `0100_modulos_e_lojas.sql` |

**Regras dos módulos**, garantidas pelo banco:
- Um módulo só liga se as dependências estiverem ligadas na loja. Ex.: compras precisa de produção.
- Não dá para desligar um módulo do qual outro ligado depende.
- Venda pelo GrandChef e venda própria não ficam ligadas juntas. Trocar uma pela outra é desligar uma e ligar a outra.
- Fiscal só liga com venda própria.

## Como a lista de produção é calculada

1. Para cada dia aberto da semana, a média de venda de cada produto nos últimos 4 dias iguais da semana. Dias de feriado ou temporada ficam de fora da média. Dia sem venda do produto conta como zero.
2. Vezes o fator do dia, para temporada e feriado, e o fator da loja. A praça começa com 30% da estrada.
3. Se a sobra do produto nas últimas 4 semanas passou de 15% da venda, a previsão cai na mesma proporção.
4. O produto é convertido na receita que ele consome. Receita montada na loja, como o pão caipira, desce para a receita da cozinha central, como o pão caseiro.
5. Mais 10% de margem. Na praça, 15%. Dividido pelo rendimento e arredondado para cima.

A Eliana ajusta o número final de cada item antes de aprovar. A lista aprovada não muda mais.

## Testar

```bash
sistema/scripts/testar-banco.sh
```

Sobe um Postgres temporário, aplica as migrações e roda os testes de `db/testes/`. Não precisa de Supabase.

## Importar dados

Os importadores escrevem SQL na saída. Guarde os arquivos gerados em `sistema/dados/`, que fica fora do Git.

```bash
node sistema/scripts/importar-receitas.mjs receitas.json > sistema/dados/receitas.sql
```

```bash
node sistema/scripts/importar-vendas.mjs vendas.json estrada > sistema/dados/vendas.sql
```

```bash
node sistema/scripts/sugerir-vinculos.mjs receitas.json vendas.json > sistema/dados/vinculos.sql
```

- `receitas.json` é o formato do app de preços (`ings` e `recs`).
- `vendas.json` é o formato do painel (`dias` com `top`, `formas` e `hora`).
- `vinculos.sql` liga cada produto vendido à receita que ele consome. **Revise com a Eliana antes de aplicar.** As linhas marcadas "conferir" costumam estar erradas.

## O que falta

- [ ] Projeto no Supabase e permissões por loja (RLS).
- [ ] Robô gravando também no banco, além da planilha.
- [ ] Telas: lista de produção, sobra, fechamento de caixa, login por PIN.
- [ ] Mensagem da lista de produção para a Eliana no WhatsApp, toda segunda.
- [ ] Revisar com a Eliana: vínculos produto → receita, receitas feitas na loja ou em casa, rendimentos.
- [ ] Venda própria (PDV) e nota fiscal pela Focus NFe, por último.
