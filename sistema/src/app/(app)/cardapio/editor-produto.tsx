"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { brl, DESTINOS, type Categoria, type Destino, type GrupoOpcoes, type Opcao, type Produto } from "@/lib/tipos";

interface Props {
  supabase: SupabaseClient;
  produto: Produto | null; // null = novo
  categorias: Categoria[];
  categoriaInicial?: string;
  grupos: GrupoOpcoes[];
  opcoes: Opcao[];
  aoFechar: () => void;
  aoMudar: () => void;
  avisar: (msg: string) => void;
}

export function EditorProduto({ supabase, produto, categorias, categoriaInicial, grupos, opcoes, aoFechar, aoMudar, avisar }: Props) {
  // id do produto em edição (depois de salvar um novo, passa a existir)
  const [id, setId] = useState<string | null>(produto?.id ?? null);
  const [nome, setNome] = useState(produto?.nome ?? "");
  const [descricao, setDescricao] = useState(produto?.descricao ?? "");
  const [preco, setPreco] = useState(produto ? String(produto.preco.toFixed(2)).replace(".", ",") : "");
  const [categoriaId, setCategoriaId] = useState(produto?.categoria_id ?? categoriaInicial ?? categorias.find((c) => c.ativo)?.id ?? "");
  const [destino, setDestino] = useState<Destino>(produto?.destino ?? "balcao");
  const [ativo, setAtivo] = useState(produto?.ativo ?? true);
  const [salvando, setSalvando] = useState(false);
  const [sujo, setSujo] = useState(false);

  const gruposDoProduto = grupos.filter((g) => g.produto_id === id);

  useEffect(() => {
    const fechar = (e: KeyboardEvent) => e.key === "Escape" && aoFechar();
    window.addEventListener("keydown", fechar);
    return () => window.removeEventListener("keydown", fechar);
  }, [aoFechar]);

  function marcar<T>(set: (v: T) => void) {
    return (v: T) => {
      set(v);
      setSujo(true);
    };
  }

  async function salvar() {
    const valor = Number(preco.replace(/\./g, "").replace(",", "."));
    if (!nome.trim()) return avisar("Dê um nome ao produto.");
    if (!categoriaId) return avisar("Escolha uma categoria.");
    if (Number.isNaN(valor) || valor < 0) return avisar("Preço inválido.");
    setSalvando(true);
    const dados = { nome: nome.trim(), descricao: descricao.trim(), preco: valor, categoria_id: categoriaId, destino, ativo };
    const r = id
      ? await supabase.from("produtos").update(dados).eq("id", id).select("id").single()
      : await supabase.from("produtos").insert(dados).select("id").single();
    setSalvando(false);
    if (r.error) return avisar(r.error.message);
    setId(r.data.id);
    setSujo(false);
    aoMudar();
    if (!produto) avisar("Produto criado. Agora você pode adicionar tamanhos e adicionais.");
  }

  async function excluir() {
    if (!id) return;
    if (!confirm(`Excluir "${nome}" definitivamente? Se preferir, use "inativo" para tirar do cardápio sem perder o histórico.`)) return;
    const { error } = await supabase.from("produtos").delete().eq("id", id);
    if (error) return avisar(error.message);
    aoMudar();
    aoFechar();
  }

  async function novoGrupo(modelo: "tamanho" | "adicionais" | "vazio") {
    if (!id) return;
    const base = {
      produto_id: id,
      ordem: (gruposDoProduto.at(-1)?.ordem ?? 0) + 1,
    };
    const dados: Omit<GrupoOpcoes, "id"> =
      modelo === "tamanho"
        ? { ...base, nome: "Tamanho", tipo: "unica", obrigatorio: true, minimo: 1, maximo: 1 }
        : modelo === "adicionais"
          ? { ...base, nome: "Adicionais", tipo: "multipla", obrigatorio: false, minimo: 0, maximo: null }
          : { ...base, nome: "Nova opção", tipo: "unica", obrigatorio: false, minimo: 0, maximo: 1 };
    const { error } = await supabase.from("grupos_opcoes").insert(dados);
    if (error) avisar(error.message);
    else aoMudar();
  }

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 sm:items-center" onClick={aoFechar}>
      <div
        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-card p-5 shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{produto ? "Editar produto" : "Novo produto"}</h2>
          <button className="botao-secundario !px-2 !py-1" onClick={aoFechar} aria-label="Fechar">✕</button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 sm:col-span-2">
            <span className="text-sm font-medium">Nome</span>
            <input className="campo" value={nome} onChange={(e) => marcar(setNome)(e.target.value)} autoFocus={!produto} />
          </label>
          <label className="space-y-1 sm:col-span-2">
            <span className="text-sm font-medium">Descrição <span className="text-muted">(opcional)</span></span>
            <textarea className="campo" rows={2} value={descricao} onChange={(e) => marcar(setDescricao)(e.target.value)} />
          </label>
          <label className="space-y-1">
            <span className="text-sm font-medium">Preço (R$)</span>
            <input className="campo" inputMode="decimal" placeholder="0,00" value={preco} onChange={(e) => marcar(setPreco)(e.target.value)} />
          </label>
          <label className="space-y-1">
            <span className="text-sm font-medium">Categoria</span>
            <select className="campo" value={categoriaId} onChange={(e) => marcar(setCategoriaId)(e.target.value)}>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>{c.nome}{c.ativo ? "" : " (inativa)"}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-sm font-medium">Vai para</span>
            <select className="campo" value={destino} onChange={(e) => marcar(setDestino)(e.target.value as Destino)}>
              {(Object.keys(DESTINOS) as Destino[]).map((d) => (
                <option key={d} value={d}>{DESTINOS[d]}</option>
              ))}
            </select>
            <span className="block text-xs text-muted">Define em qual tela o pedido aparece ao ser lançado na comanda.</span>
          </label>
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <input type="checkbox" checked={ativo} onChange={(e) => marcar(setAtivo)(e.target.checked)} />
            Ativo no cardápio
          </label>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <button className="botao-primario" onClick={salvar} disabled={salvando || (!!id && !sujo)}>
            {salvando ? "Salvando…" : id ? "Salvar alterações" : "Criar produto"}
          </button>
          {id && <button className="botao-perigo ml-auto" onClick={excluir}>Excluir</button>}
        </div>

        <hr className="my-5 border-border" />

        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h3 className="font-semibold mr-auto">Tamanhos, variações e adicionais</h3>
          {id ? (
            <>
              <button className="botao-secundario !py-1 text-xs" onClick={() => novoGrupo("tamanho")}>+ Tamanho</button>
              <button className="botao-secundario !py-1 text-xs" onClick={() => novoGrupo("adicionais")}>+ Adicionais</button>
              <button className="botao-secundario !py-1 text-xs" onClick={() => novoGrupo("vazio")}>+ Outro grupo</button>
            </>
          ) : (
            <span className="text-xs text-muted">Crie o produto primeiro para adicionar opções.</span>
          )}
        </div>

        {id && gruposDoProduto.length === 0 && (
          <p className="text-sm text-muted">Sem opções. Produto simples: é só lançar na comanda.</p>
        )}
        <div className="space-y-3">
          {gruposDoProduto.map((g) => (
            <EditorGrupo key={`${g.id}:${g.nome}`} supabase={supabase} grupo={g} opcoes={opcoes.filter((o) => o.grupo_id === g.id)} aoMudar={aoMudar} avisar={avisar} />
          ))}
        </div>
      </div>
    </div>
  );
}

function EditorGrupo({ supabase, grupo: g, opcoes, aoMudar, avisar }: { supabase: SupabaseClient; grupo: GrupoOpcoes; opcoes: Opcao[]; aoMudar: () => void; avisar: (m: string) => void }) {
  const [nome, setNome] = useState(g.nome);
  const [novaOpcao, setNovaOpcao] = useState("");
  const [novoPreco, setNovoPreco] = useState("");

  async function atualizar(campos: Partial<GrupoOpcoes>) {
    const { error } = await supabase.from("grupos_opcoes").update(campos).eq("id", g.id);
    if (error) avisar(error.message);
    else aoMudar();
  }
  async function excluirGrupo() {
    if (!confirm(`Remover o grupo "${g.nome}" e suas opções?`)) return;
    const { error } = await supabase.from("grupos_opcoes").delete().eq("id", g.id);
    if (error) avisar(error.message);
    else aoMudar();
  }
  async function adicionarOpcao() {
    const n = novaOpcao.trim();
    if (!n) return;
    const preco_extra = Number(novoPreco.replace(",", ".")) || 0;
    const { error } = await supabase.from("opcoes").insert({ grupo_id: g.id, nome: n, preco_extra, ordem: (opcoes.at(-1)?.ordem ?? 0) + 1 });
    if (error) return avisar(error.message);
    setNovaOpcao("");
    setNovoPreco("");
    aoMudar();
  }

  return (
    <div className="rounded-xl border border-border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          className="campo !w-40 !py-1 font-medium"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          onBlur={() => nome.trim() && nome !== g.nome && atualizar({ nome: nome.trim() })}
        />
        <select className="campo !w-auto !py-1 text-xs" value={g.tipo} onChange={(e) => atualizar({ tipo: e.target.value as GrupoOpcoes["tipo"], maximo: e.target.value === "unica" ? 1 : null })}>
          <option value="unica">escolhe 1</option>
          <option value="multipla">escolhe várias</option>
        </select>
        <label className="flex items-center gap-1 text-xs">
          <input type="checkbox" checked={g.obrigatorio} onChange={(e) => atualizar({ obrigatorio: e.target.checked, minimo: e.target.checked ? Math.max(1, g.minimo) : 0 })} />
          obrigatório
        </label>
        {g.tipo === "multipla" && (
          <label className="flex items-center gap-1 text-xs">
            máx.
            <input
              className="campo !w-14 !py-1 text-xs"
              inputMode="numeric"
              placeholder="∞"
              value={g.maximo ?? ""}
              onChange={(e) => atualizar({ maximo: e.target.value ? Math.max(1, parseInt(e.target.value, 10) || 1) : null })}
            />
          </label>
        )}
        <button className="botao-perigo ml-auto !py-1 text-xs" onClick={excluirGrupo}>remover grupo</button>
      </div>

      <ul className="mt-2 divide-y divide-border">
        {opcoes.map((o) => (
          <LinhaOpcao key={`${o.id}:${o.nome}:${o.preco_extra}`} supabase={supabase} opcao={o} aoMudar={aoMudar} avisar={avisar} />
        ))}
      </ul>

      <form
        className="mt-2 flex gap-1"
        onSubmit={(e) => {
          e.preventDefault();
          adicionarOpcao();
        }}
      >
        <input className="campo !py-1 text-sm" placeholder="Nova opção (ex.: Grande)" value={novaOpcao} onChange={(e) => setNovaOpcao(e.target.value)} />
        <input className="campo !w-24 !py-1 text-sm" placeholder="+ R$" inputMode="decimal" value={novoPreco} onChange={(e) => setNovoPreco(e.target.value)} />
        <button className="botao-secundario !py-1" disabled={!novaOpcao.trim()}>+</button>
      </form>
    </div>
  );
}

function LinhaOpcao({ supabase, opcao: o, aoMudar, avisar }: { supabase: SupabaseClient; opcao: Opcao; aoMudar: () => void; avisar: (m: string) => void }) {
  const [nome, setNome] = useState(o.nome);
  const [preco, setPreco] = useState(o.preco_extra ? o.preco_extra.toFixed(2).replace(".", ",") : "");

  async function atualizar(campos: Partial<Opcao>) {
    const { error } = await supabase.from("opcoes").update(campos).eq("id", o.id);
    if (error) avisar(error.message);
    else aoMudar();
  }
  async function excluir() {
    const { error } = await supabase.from("opcoes").delete().eq("id", o.id);
    if (error) avisar(error.message);
    else aoMudar();
  }

  return (
    <li className={`flex items-center gap-1 py-1 ${o.ativo ? "" : "opacity-50"}`}>
      <input className="campo !py-1 text-sm" value={nome} onChange={(e) => setNome(e.target.value)} onBlur={() => nome.trim() && nome !== o.nome && atualizar({ nome: nome.trim() })} />
      <input
        className="campo !w-24 !py-1 text-sm text-right"
        inputMode="decimal"
        placeholder="+ R$ 0,00"
        value={preco}
        onChange={(e) => setPreco(e.target.value)}
        onBlur={() => {
          const v = Number(preco.replace(",", ".")) || 0;
          if (v !== o.preco_extra) atualizar({ preco_extra: v });
        }}
      />
      <span className="w-20 text-right text-xs text-muted hidden sm:block">{o.preco_extra ? `+${brl(o.preco_extra)}` : "sem custo"}</span>
      <button className="px-1 text-xs hover:text-primary" title={o.ativo ? "Desativar" : "Ativar"} onClick={() => atualizar({ ativo: !o.ativo })}>{o.ativo ? "◉" : "○"}</button>
      <button className="px-1 text-xs text-danger" title="Excluir" onClick={excluir}>✕</button>
    </li>
  );
}
