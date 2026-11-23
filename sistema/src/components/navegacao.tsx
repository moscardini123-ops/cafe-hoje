"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const MODULOS = [
  { href: "/", rotulo: "Início", icone: "🏠" },
  { href: "/cardapio", rotulo: "Cardápio", icone: "📋" },
  { href: "/mesas", rotulo: "Mesas", icone: "🪑", breve: true },
  { href: "/cozinha", rotulo: "Cozinha", icone: "🍳", breve: true },
  { href: "/caixa", rotulo: "Caixa", icone: "💵", breve: true },
];

export function Navegacao({ children }: { children: ReactNode }) {
  const atual = usePathname();
  const ativo = (href: string) => (href === "/" ? atual === "/" : atual.startsWith(href));

  return (
    <>
      {/* Barra lateral (telas médias e grandes) */}
      <aside className="hidden md:flex w-60 shrink-0 flex-col border-r border-border bg-card">
        <div className="flex items-center gap-2 px-4 py-4 border-b border-border">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-lg text-primary-foreground">☕</span>
          <div>
            <p className="font-semibold leading-tight">Café da Mantiqueira</p>
            <p className="text-xs text-muted">Sistema da cafeteria</p>
          </div>
        </div>
        <nav className="flex-1 p-2 space-y-0.5">
          {MODULOS.map((m) => (
            <Link
              key={m.href}
              href={m.breve ? "#" : m.href}
              aria-disabled={m.breve}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${
                ativo(m.href) ? "bg-primary text-primary-foreground" : m.breve ? "text-muted cursor-not-allowed" : "hover:bg-background"
              }`}
            >
              <span>{m.icone}</span>
              <span className="flex-1">{m.rotulo}</span>
              {m.breve && <span className="etiqueta bg-border text-muted">em breve</span>}
            </Link>
          ))}
        </nav>
        <div className="border-t border-border p-3">{children}</div>
      </aside>

      {/* Barra inferior (celular) */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-20 flex border-t border-border bg-card">
        {MODULOS.map((m) => (
          <Link
            key={m.href}
            href={m.breve ? "#" : m.href}
            aria-disabled={m.breve}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] ${
              ativo(m.href) ? "text-primary font-semibold" : m.breve ? "text-muted/50" : "text-muted"
            }`}
          >
            <span className="text-lg leading-none">{m.icone}</span>
            {m.rotulo}
          </Link>
        ))}
      </nav>
      <div className="md:hidden flex items-center justify-between gap-2 border-b border-border bg-card px-4 py-2">
        <p className="font-semibold">☕ Café da Mantiqueira</p>
        <div className="min-w-0 max-w-[55%]">{children}</div>
      </div>
    </>
  );
}
