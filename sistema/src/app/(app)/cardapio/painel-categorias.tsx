"use client";

import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Categoria, Produto } from "@/lib/tipos";

interface Props {
  supabase: SupabaseClient;
  categorias: Categoria[];
  produtos: Produto[];
  selecionada: string | "todas";
  aoSelecionar: (id: string | "todas") => void;
  gestor: boolean;
  aoMudar: () => void;
  avisar: (msg: string) => void;
}

export function PainelCategorias({ supabase, categorias, produtos, selecionada, aoSelecionar, gestor, aoMudar, avisar }: Props) {
  const [nova, setNova] = useState("");
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [nomeEdicao, setNomeEdicao] = useState("");
  const [gerenciar, setGerenciar] = useState(false);

  const contagem = (id: string) => produtos.filter((p) => p.categoria_id === id && p.ativo).length;

  async function criar() {
    const nome = nova.trim();
    if (!nome) return;
    const ordem = (categorias.at(-1)?.ordem ?? 0) + 1;
    const { error } = await supabase.from("categorias").insert({ nome, ordem });
    if (error) return avisar(error.message);
    setNova("");
    aoMudar();
  }

  async function renomear(id: string) {
    const nome = nomeEdicao.trim();
    setEditandoId(null);
    if (!nome) return;
    const { error } = await supabase.from("categorias").update({ nome }).eq("id", id);
    if (error) avisar(error.message);
    else aoMudar();
  }

  async function alternar(c: Categoria) {
    const { error } = await supabase.from("categorias").update({ ativo: !c.ativo }).eq("id", c.id);
    if (error) avisar(error.message);
    else aoMudar();
  }

  async function mover(c: Categoria, direcao: -1 | 1) {
    const i = categorias.findIndex((x) => x.id === c.id);
    const j = i + direcao;
    if (j < 0 || j >= categorias.length) return;
    const outra = categorias[j];
    // troca as posições; usa índices garantidos como ordem para desempatar
    const r1 = await supabase.from("categorias").update({ ordem: j }).eq("id", c.id);
    const r2 = await supabase.from("categorias").update({ ordem: i }).eq("id", outra.id);
    if (r1.error || r2.error) avisar((r1.error || r2.error)!.message);
    else aoMudar();
  }

  async function excluir(c: Categoria) {
    const total = produtos.filter((p) => p.categoria_id === c.id).length;
    if (total > 0) return avisar(`"${c.nome}" tem ${total} produto(s). Mova ou exclua os produtos antes.`);
    if (!confirm(`Excluir a categoria "${c.nome}"?`)) return;
    const { error } = await supabase.from("categorias").delete().eq("id", c.id);
    if (error) avisar(error.message);
    else {
      if (selecionada === c.id) aoSelecionar("todas");
      aoMudar();
    }
  }

  return (
    <aside className="lg:w-64 shrink-0 rounded-2xl border border-border bg-card p-3">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Categorias</h2>
        {gestor && (
          <button className="text-xs text-primary hover:underline" onClick={() => setGerenciar(!gerenciar)}>
            {gerenciar ? "concluir" : "gerenciar"}
          </button>
        )}
      </div>

      <ul className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
        <li>
          <button
            className={`w-full whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm ${selecionada === "todas" ? "bg-primary text-primary-foreground" : "hover:bg-background"}`}
            onClick={() => aoSelecionar("todas")}
          >
            Todas
          </button>
        </li>
        {categorias.map((c, i) => (
          <li key={c.id} className="flex items-center gap-1">
            {editandoId === c.id ? (
              <form
                className="flex flex-1 gap-1"
                onSubmit={(e) => {
                  e.preventDefault();
                  renomear(c.id);
                }}
              >
                <input className="campo !py-1" autoFocus value={nomeEdicao} onChange={(e) => setNomeEdicao(e.target.value)} onBlur={() => renomear(c.id)} />
              </form>
            ) : (
              <button
                className={`flex flex-1 items-center justify-between gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm ${
                  selecionada === c.id ? "bg-primary text-primary-foreground" : "hover:bg-background"
                } ${c.ativo ? "" : "line-through opacity-60"}`}
                onClick={() => aoSelecionar(c.id)}
                onDoubleClick={() => {
                  if (!gestor) return;
                  setEditandoId(c.id);
                  setNomeEdicao(c.nome);
                }}
              >
                <span>{c.nome}</span>
                <span className="text-xs opacity-70">{contagem(c.id)}</span>
              </button>
            )}
            {gerenciar && gestor && editandoId !== c.id && (
              <div className="flex shrink-0 items-center text-xs">
                <button className="px-1 hover:text-primary" title="Subir" onClick={() => mover(c, -1)} disabled={i === 0}>↑</button>
                <button className="px-1 hover:text-primary" title="Descer" onClick={() => mover(c, 1)} disabled={i === categorias.length - 1}>↓</button>
                <button className="px-1 hover:text-primary" title="Renomear" onClick={() => { setEditandoId(c.id); setNomeEdicao(c.nome); }}>✎</button>
                <button className="px-1 hover:text-primary" title={c.ativo ? "Desativar" : "Ativar"} onClick={() => alternar(c)}>{c.ativo ? "◉" : "○"}</button>
                <button className="px-1 text-danger" title="Excluir" onClick={() => excluir(c)}>✕</button>
              </div>
            )}
          </li>
        ))}
      </ul>

      {gestor && (
        <form
          className="mt-3 flex gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            criar();
          }}
        >
          <input className="campo !py-1.5" placeholder="Nova categoria" value={nova} onChange={(e) => setNova(e.target.value)} />
          <button className="botao-secundario !py-1.5" disabled={!nova.trim()}>+</button>
        </form>
      )}
    </aside>
  );
}
