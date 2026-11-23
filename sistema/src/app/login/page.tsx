import { Suspense } from "react";
import { FormularioLogin } from "./formulario";

export const metadata = { title: "Entrar" };

export default function PaginaLogin() {
  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-2xl text-primary-foreground">
            ☕
          </div>
          <h1 className="text-xl font-semibold">Café da Mantiqueira</h1>
          <p className="text-sm text-muted">Entre para acessar o sistema</p>
        </div>
        <Suspense>
          <FormularioLogin />
        </Suspense>
      </div>
    </main>
  );
}
