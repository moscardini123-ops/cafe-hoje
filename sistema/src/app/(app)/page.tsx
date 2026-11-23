import Link from "next/link";

export const metadata = { title: "Início" };

const CARTOES = [
  { href: "/cardapio", titulo: "Cardápio", texto: "Categorias, produtos, preços, tamanhos e adicionais.", icone: "📋", pronto: true },
  { href: "/mesas", titulo: "Mesas e comandas", texto: "Mapa de mesas, abrir comanda e lançar pedidos.", icone: "🪑", pronto: false },
  { href: "/cozinha", titulo: "Tela da cozinha", texto: "Pedidos chegando em tempo real para preparar.", icone: "🍳", pronto: false },
  { href: "/caixa", titulo: "Caixa", texto: "Fechar contas, dividir, formas de pagamento.", icone: "💵", pronto: false },
  { href: "/relatorios", titulo: "Relatórios", texto: "Vendas por dia, produto e horário.", icone: "📈", pronto: false },
  { href: "/estoque", titulo: "Estoque", texto: "Insumos, baixa automática e alertas.", icone: "📦", pronto: false },
];

export default function Inicio() {
  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-semibold">Bem-vindo</h1>
      <p className="text-muted">O sistema está sendo construído módulo por módulo. Comece pelo cardápio.</p>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {CARTOES.map((c) =>
          c.pronto ? (
            <Link key={c.href} href={c.href} className="rounded-2xl border border-border bg-card p-4 hover:border-primary transition">
              <div className="text-2xl">{c.icone}</div>
              <h2 className="mt-2 font-semibold">{c.titulo}</h2>
              <p className="text-sm text-muted">{c.texto}</p>
            </Link>
          ) : (
            <div key={c.href} className="rounded-2xl border border-dashed border-border p-4 opacity-70">
              <div className="text-2xl grayscale">{c.icone}</div>
              <h2 className="mt-2 font-semibold flex items-center gap-2">
                {c.titulo} <span className="etiqueta bg-border text-muted">em breve</span>
              </h2>
              <p className="text-sm text-muted">{c.texto}</p>
            </div>
          ),
        )}
      </div>
    </div>
  );
}
