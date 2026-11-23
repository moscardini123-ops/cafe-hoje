# Sistema da cafeteria (`sistema/`)

Aplicativo web de gestão do Café da Mantiqueira: cardápio, comandas, cozinha, caixa, relatórios e estoque, construído módulo por módulo.

- **Next.js 16** (App Router) + **Tailwind 4**
- **Supabase** (Postgres + Auth + Realtime): projeto `cafe-mantiqueira`
- Deploy na **Vercel** como projeto próprio, com *Root Directory* = `sistema`

## Módulos

| Módulo | Estado | Rota |
|---|---|---|
| Login e perfis (admin, gerente, garçom, cozinha, caixa) | pronto | `/login` |
| Cardápio: categorias, produtos, tamanhos/variações e adicionais | pronto | `/cardapio` |
| Mesas e comandas | a fazer | `/mesas` |
| Tela da cozinha | a fazer | `/cozinha` |
| Caixa e fechamento | a fazer | `/caixa` |
| Relatórios | a fazer | `/relatorios` |
| Estoque | a fazer | `/estoque` |

## Rodar localmente

```bash
cd sistema
cp .env.example .env.local   # preencha com URL e chave publicável do Supabase
npm install
npm run dev
```

## Banco de dados

As migrações ficam em `supabase/migrations/` e são aplicadas em ordem no projeto Supabase (SQL Editor ou CLI). A `0002` é um cardápio de exemplo e pode ser apagada pelo próprio sistema.

Regras de acesso (RLS):

- todo usuário logado **lê** o cardápio;
- só **admin** e **gerente** alteram categorias, produtos e opções;
- o **primeiro usuário** criado no Auth vira admin automaticamente; os seguintes entram como garçom até um admin mudar o papel.

Cadastro de usuários: o auto-cadastro está desligado. Novos acessos são criados pelo administrador (Supabase → Authentication → Users → *Invite user*), e o convidado entra pelo link do e-mail.

## Variáveis de ambiente

| Nome | Onde pegar |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase → Project Settings → API Keys (`sb_publishable_...`) |

A chave publicável pode ficar no navegador; a segurança vem das políticas de RLS. Nunca use a chave `service_role` ou `sb_secret_...` neste app.
