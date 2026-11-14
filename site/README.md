# Site cafe-da-mantiqueira.vercel.app

Fontes do site na Vercel. Nenhuma chave aqui: a função `api/painel.js` lê tudo de variáveis de ambiente.

| Rota | Arquivo | O que é |
|---|---|---|
| `/` e `/precos` | `index.html` + `app-orig.html` + `fix.js` | App "Preços do Café" (fichas técnicas) |
| `/diagnostico` | `diagnostico/index.html` | Ficha de campo |
| `/painel` | `painel/` | Painel gerencial (PWA) |
| `/api/painel` | `api/painel.js` | Proxy para a planilha; exige o PIN |

## Variáveis de ambiente (Vercel → Settings → Environment Variables, Production)

- `APPS_SCRIPT_URL`: URL `/exec` do Apps Script
- `CAFE_KEY`: chave aceita pelo Apps Script
- `PAINEL_PIN_HASH`: sha256 do PIN do painel

Sem as três, o painel responde `{erro:'codigo'}` para tudo.

## Ligar à Vercel pelo Git

Vercel → projeto → Settings → Git → conectar `moscardini123-ops/cafe-hoje`, branch `main`.
Em Settings → General → Root Directory, colocar `site`. Framework: Other. Sem build.
