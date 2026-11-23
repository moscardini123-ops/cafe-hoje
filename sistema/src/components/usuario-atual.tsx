import { criarClienteServidor } from "@/lib/supabase/server";
import { PAPEIS, type Papel } from "@/lib/tipos";
import { sair } from "@/app/(app)/acoes";

export async function UsuarioAtual() {
  const supabase = await criarClienteServidor();
  const { data } = await supabase.auth.getClaims();
  const uid = data?.claims?.sub as string | undefined;
  if (!uid) return null;
  const { data: perfil } = await supabase
    .from("perfis")
    .select("nome, papel")
    .eq("id", uid)
    .maybeSingle();

  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <div className="min-w-0">
        <p className="truncate font-medium">{perfil?.nome || data?.claims?.email}</p>
        <p className="truncate text-xs text-muted">{PAPEIS[(perfil?.papel as Papel) || "garcom"]}</p>
      </div>
      <form action={sair}>
        <button className="botao-secundario !px-2 !py-1 text-xs" title="Sair">
          Sair
        </button>
      </form>
    </div>
  );
}
