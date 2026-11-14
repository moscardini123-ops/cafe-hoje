# cafe-hoje

Robô de dados e site do Café da Mantiqueira. Repositório público: só código, sem chaves nem dados de venda.

## O que tem aqui

| Pasta ou arquivo | O que é |
|---|---|
| `coletor.mjs` | Coleta o dia no GrandChef, grava na planilha e manda o resumo no WhatsApp |
| `resumo.mjs` | Resumos semanal e mensal |
| `recados.mjs` | Recados motivadores no fim das mensagens |
| `.github/workflows/diario.yml` | Workflow do GitHub Actions, disparado pelo Apps Script |
| `site/` | Fontes de cafe-da-mantiqueira.vercel.app (app de preços, ficha de campo, painel e API). Deploy automático pela Vercel, com Root Directory `site` |

## Regras

- Chaves ficam em GitHub Secrets, propriedades do Apps Script ou variáveis de ambiente da Vercel. Nunca no código.
- O robô só lê do GrandChef.
- Os logs do Actions não mostram faturamento nem o texto das mensagens.
