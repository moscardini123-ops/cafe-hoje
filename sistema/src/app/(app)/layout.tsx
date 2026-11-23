import { Suspense } from "react";
import { Navegacao } from "@/components/navegacao";
import { UsuarioAtual } from "@/components/usuario-atual";

export default function LayoutApp({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Navegacao>
        <Suspense fallback={<div className="h-10" />}>
          <UsuarioAtual />
        </Suspense>
      </Navegacao>
      <main className="flex-1 min-w-0 p-4 md:p-6 pb-20 md:pb-6">{children}</main>
    </div>
  );
}
