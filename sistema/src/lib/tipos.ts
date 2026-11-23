export type Papel = "admin" | "gerente" | "garcom" | "cozinha" | "caixa";
export type Destino = "cozinha" | "bar" | "balcao" | "nenhum";

export interface Perfil {
  id: string;
  nome: string;
  papel: Papel;
  ativo: boolean;
}

export interface Categoria {
  id: string;
  nome: string;
  ordem: number;
  ativo: boolean;
}

export interface Produto {
  id: string;
  categoria_id: string;
  nome: string;
  descricao: string;
  preco: number;
  destino: Destino;
  ativo: boolean;
  ordem: number;
  imagem_url: string | null;
}

export interface GrupoOpcoes {
  id: string;
  produto_id: string;
  nome: string;
  tipo: "unica" | "multipla";
  obrigatorio: boolean;
  minimo: number;
  maximo: number | null;
  ordem: number;
}

export interface Opcao {
  id: string;
  grupo_id: string;
  nome: string;
  preco_extra: number;
  ativo: boolean;
  ordem: number;
}

export const PAPEIS: Record<Papel, string> = {
  admin: "Administrador",
  gerente: "Gerente",
  garcom: "Garçom",
  cozinha: "Cozinha",
  caixa: "Caixa",
};

export const DESTINOS: Record<Destino, string> = {
  cozinha: "Cozinha",
  bar: "Bar / bebidas",
  balcao: "Balcão / barista",
  nenhum: "Sem preparo",
};

export const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
