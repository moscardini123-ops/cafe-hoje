"use client";

import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { criarClienteNavegador } from "@/lib/supabase/client";

export function FormularioLogin() {
  const router = useRouter();
  const params = useSearchParams();
  const voltar = params.get("voltar") || "/";
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [modo, setModo] = useState<"senha" | "link">("senha");
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  async function entrar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setAviso(null);
    setCarregando(true);
    const supabase = criarClienteNavegador();
    try {
      if (modo === "senha") {
        const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
        if (error) throw error;
        router.replace(voltar);
        router.refresh();
      } else {
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: {
            shouldCreateUser: false,
            emailRedirectTo: `${location.origin}/auth/confirm?voltar=${encodeURIComponent(voltar)}`,
          },
        });
        if (error) throw error;
        setAviso("Enviamos um link de acesso para o seu e-mail. Abra-o neste aparelho.");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setErro(
        /invalid login/i.test(msg)
          ? "E-mail ou senha incorretos."
          : /signups not allowed|not found/i.test(msg)
            ? "Este e-mail não está cadastrado. Peça ao administrador para criar seu acesso."
            : msg,
      );
    } finally {
      setCarregando(false);
    }
  }

  return (
    <form onSubmit={entrar} className="space-y-4">
      <label className="block space-y-1">
        <span className="text-sm font-medium">E-mail</span>
        <input
          className="campo"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>
      {modo === "senha" && (
        <label className="block space-y-1">
          <span className="text-sm font-medium">Senha</span>
          <input
            className="campo"
            type="password"
            autoComplete="current-password"
            required
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
          />
        </label>
      )}
      {erro && <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{erro}</p>}
      {aviso && <p className="rounded-lg bg-success/10 px-3 py-2 text-sm text-success">{aviso}</p>}
      <button className="botao-primario w-full" disabled={carregando}>
        {carregando ? "Entrando…" : modo === "senha" ? "Entrar" : "Enviar link por e-mail"}
      </button>
      <button
        type="button"
        className="w-full text-center text-sm text-muted hover:underline"
        onClick={() => setModo(modo === "senha" ? "link" : "senha")}
      >
        {modo === "senha" ? "Entrar com link por e-mail" : "Entrar com senha"}
      </button>
    </form>
  );
}
