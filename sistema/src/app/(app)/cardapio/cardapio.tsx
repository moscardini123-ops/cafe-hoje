"use client";

import { useMemo, useState } from "react";
import { brl, DESTINOS, type Categoria, type Produto } from "@/lib/tipos";
import { useCardapio } from "./use-cardapio";
import { EditorProduto } from "./editor-produto";
import { PainelCategorias } from "./painel-categorias";

export function Cardapio() {
  const { supabase, dados, gestor, carregando, erro, recarregar } = useCardapio();
  const [categoriaSel, setCategoriaSel] = useState<string | "todas">("todas");
  const [busca, setBusca] = useState("");
  const [mostrarInativos, setMostrarInativos] = useState(false);
  const [editando, setEditando] = useState<Produto | "novo" | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const produtos = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return dados.produtos.filter(
      (p) =>
        (categoriaSel === "todas" || p.categoria_id === categoriaSel) &&
        (mostrarInativos || p.ativo) &&
        (!termo || p.nome.toLowerCase().includes(termo) || p.descricao.toLowerCase().includes(termo)),
    );
  }, [dados.produtos, categoriaSel, busca, mostrarInativos]);

  const porCategoria = useMemo(() => {
    const mapa = new Map<string, Produto[]>();
    for (const p of produtos) mapa.set(p.categoria_id, [...(mapa.get(p.categoria_id) ?? []), p]);
    return mapa;
  }, [produtos]);

  const categoriasVisiveis = dados.categorias.filter(
    (c) => (categoriaSel === "todas" ? porCategoria.has(c.id) : c.id === categoriaSel),
  );

  function avisar(msg: string) {
    setAviso(msg);
    setTimeout(() => setAviso(null), 4000);
  }

  async function alternarAtivo(p: Produto) {
    const { error } = await supabase.from("produtos").update({ ativo: !p.ativo }).eq("id", p.id);
    if (error) avisar(error.message);
    else recarregar();
  }

  if (carregando) return <p className="text-muted">Carregando cardápio…</p>;

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
      <PainelCategorias
        supabase={supabase}
        categorias={dados.categorias}
        produtos={dados.produtos}
        selecionada={categoriaSel}
        aoSelecionar={setCategoriaSel}
        gestor={gestor}
        aoMudar={recarregar}
        avisar={avisar}
      />

      <section className="flex-1 min-w-0">
        <header className="mb-3 flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold mr-auto">Cardápio</h1>
          <input
            className="campo !w-48 sm:!w-64"
            placeholder="Buscar produto…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
          <label className="flex items-center gap-1 text-sm text-muted">
            <input type="checkbox" checked={mostrarInativos} onChange={(e) => setMostrarInativos(e.target.checked)} />
            mostrar inativos
          </label>
          {gestor && (
            <button className="botao-primario" onClick={() => setEditando("novo")} disabled={dados.categorias.length === 0}>
              + Produto
            </button>
          )}
        </header>

        {erro && <p className="mb-3 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{erro}</p>}
        {aviso && <p className="mb-3 rounded-lg bg-primary/10 px-3 py-2 text-sm">{aviso}</p>}
        {!gestor && (
          <p className="mb-3 rounded-lg bg-border/50 px-3 py-2 text-xs text-muted">
            Você está vendo o cardápio em modo leitura. Só administradores e gerentes alteram produtos.
          </p>
        )}

        {dados.categorias.length === 0 && (
          <p className="text-muted">Nenhuma categoria ainda. Crie a primeira no painel ao lado.</p>
        )}
        {produtos.length === 0 && dados.categorias.length > 0 && (
          <p className="text-muted">Nenhum produto encontrado.</p>
        )}

        {categoriasVisiveis.map((c) => (
          <div key={c.id} className="mb-6">
            <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted">
              {c.nome}
              {!c.ativo && <span className="etiqueta bg-border text-muted">categoria inativa</span>}
            </h2>
            <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {(porCategoria.get(c.id) ?? []).map((p) => (
                <CartaoProduto
                  key={p.id}
                  produto={p}
                  temOpcoes={dados.grupos.some((g) => g.produto_id === p.id)}
                  gestor={gestor}
                  aoEditar={() => setEditando(p)}
                  aoAlternar={() => alternarAtivo(p)}
                />
              ))}
            </ul>
          </div>
        ))}
      </section>

      {editando && (
        <EditorProduto
          supabase={supabase}
          produto={editando === "novo" ? null : editando}
          categorias={dados.categorias}
          categoriaInicial={categoriaSel === "todas" ? undefined : categoriaSel}
          grupos={dados.grupos}
          opcoes={dados.opcoes}
          aoFechar={() => setEditando(null)}
          aoMudar={recarregar}
          avisar={avisar}
        />
      )}
    </div>
  );
}

function CartaoProduto({
  produto: p,
  temOpcoes,
  gestor,
  aoEditar,
  aoAlternar,
}: {
  produto: Produto;
  temOpcoes: boolean;
  gestor: boolean;
  aoEditar: () => void;
  aoAlternar: () => void;
}) {
  return (
    <li className={`rounded-xl border border-border bg-card p-3 ${p.ativo ? "" : "opacity-60"}`}>
      <div className="flex items-start gap-2">
        <button className="flex-1 min-w-0 text-left" onClick={aoEditar} disabled={!gestor}>
          <p className="font-medium leading-tight">{p.nome}</p>
          {p.descricao && <p className="mt-0.5 line-clamp-2 text-xs text-muted">{p.descricao}</p>}
        </button>
        <p className="font-semibold whitespace-nowrap">{brl(p.preco)}</p>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="etiqueta bg-primary/10 text-primary">{DESTINOS[p.destino]}</span>
        {temOpcoes && <span className="etiqueta bg-accent/30">com opções</span>}
        {!p.ativo && <span className="etiqueta bg-border text-muted">inativo</span>}
        {gestor && (
          <button className="ml-auto text-xs text-muted hover:underline" onClick={aoAlternar}>
            {p.ativo ? "desativar" : "ativar"}
          </button>
        )}
      </div>
    </li>
  );
}

export type { Categoria };
