"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { criarClienteNavegador } from "@/lib/supabase/client";
import type { Categoria, GrupoOpcoes, Opcao, Perfil, Produto } from "@/lib/tipos";

export interface DadosCardapio {
  categorias: Categoria[];
  produtos: Produto[];
  grupos: GrupoOpcoes[];
  opcoes: Opcao[];
}

const VAZIO: DadosCardapio = { categorias: [], produtos: [], grupos: [], opcoes: [] };

/** Carrega o cardápio inteiro e mantém atualizado em tempo real. */
export function useCardapio() {
  const supabase = useMemo(() => criarClienteNavegador(), []);
  const [dados, setDados] = useState<DadosCardapio>(VAZIO);
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const recarregar = useCallback(async () => {
    const [c, p, g, o] = await Promise.all([
      supabase.from("categorias").select("*").order("ordem").order("nome"),
      supabase.from("produtos").select("*").order("ordem").order("nome"),
      supabase.from("grupos_opcoes").select("*").order("ordem"),
      supabase.from("opcoes").select("*").order("ordem"),
    ]);
    const falha = c.error || p.error || g.error || o.error;
    if (falha) {
      setErro(falha.message);
      return;
    }
    setErro(null);
    setDados({
      categorias: (c.data ?? []) as Categoria[],
      produtos: ((p.data ?? []) as Produto[]).map((x) => ({ ...x, preco: Number(x.preco) })),
      grupos: (g.data ?? []) as GrupoOpcoes[],
      opcoes: ((o.data ?? []) as Opcao[]).map((x) => ({ ...x, preco_extra: Number(x.preco_extra) })),
    });
  }, [supabase]);

  useEffect(() => {
    let ativo = true;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (auth.user) {
        const { data } = await supabase.from("perfis").select("*").eq("id", auth.user.id).maybeSingle();
        if (ativo) setPerfil((data as Perfil | null) ?? null);
      }
      await recarregar();
      if (ativo) setCarregando(false);
    })();

    // Qualquer alteração em qualquer aparelho recarrega (com pequena espera para agrupar).
    const canal = supabase
      .channel("cardapio")
      .on("postgres_changes", { event: "*", schema: "public", table: "categorias" }, agendar)
      .on("postgres_changes", { event: "*", schema: "public", table: "produtos" }, agendar)
      .on("postgres_changes", { event: "*", schema: "public", table: "grupos_opcoes" }, agendar)
      .on("postgres_changes", { event: "*", schema: "public", table: "opcoes" }, agendar)
      .subscribe();

    function agendar() {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(recarregar, 250);
    }

    return () => {
      ativo = false;
      if (timer.current) clearTimeout(timer.current);
      supabase.removeChannel(canal);
    };
  }, [supabase, recarregar]);

  const gestor = perfil?.papel === "admin" || perfil?.papel === "gerente";

  return { supabase, dados, perfil, gestor, carregando, erro, recarregar };
}
