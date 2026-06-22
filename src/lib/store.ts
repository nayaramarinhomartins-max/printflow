/**
 * store.ts — Estado global via localStorage
 */

// ─── Tipos base ────────────────────────────────────────────────────────────────

export type OrderType = "imp_pers" | "imp_nao_pers" | "pers_nao_imp" | "nem_pers_nem_imp";

export interface Personalizacao {
  nome: string;
  idade: string;
  tema: string;
}

export interface ParsedOrder {
  id: string;
  produto: string;
  variacao: string;
  quantidade: number;
  observacao: string;
  destinatario: string;
  prazoEnvio: string;
  tipo: OrderType;
  personalizacao: Personalizacao;
  personalizacaoOk: boolean;
}

// ─── Fontes customizadas ───────────────────────────────────────────────────────

export interface FonteCustom {
  name: string;
  /** CSS font-family value, ex: "'MinhaFonte', sans-serif" */
  value: string;
  /** data URL base64 para recarregar a fonte */
  dataUrl: string;
}

// ─── Templates ─────────────────────────────────────────────────────────────────

export interface ArteTemplate {
  id: string;
  categoriaId: string;
  nome: string;
  observacao: string;
  /**
   * Variação/tamanho que esta arte atende.
   * Ex: "A3", "A4", "20x30", etc.
   * Usado para posters — o sistema escolhe a arte pela variação do pedido.
   * Se vazio, atende qualquer variação.
   */
  variacao?: string;
  /**
   * Como esta arte se comporta na produção:
   * - "personalizado": gera 1 linha por pedido (tem nome/idade)
   * - "agrupado": agrupa por variação e soma quantidades (poster, peça sem personalização)
   * - "banderola": gera PDF com N páginas, 1 letra por campo marcado como "letra"
   * Se não definido, herda do comportamento padrão da categoria.
   */
  comportamento?: "personalizado" | "agrupado" | "banderola";
  editorState?: {
    orientation: "portrait" | "landscape";
    bgImage: string | null;
    layers: unknown[];
  };
}

export interface Template {
  id: string;
  nome: string;
  descricao: string;
  artes: ArteTemplate[];
  criadoEm: string;
}

// ─── Anúncios ──────────────────────────────────────────────────────────────────

export interface Anuncio {
  nomeProduto: string;
  categoriaId: string | null;
  templateId: string | null;
  artesIds: string[] | null;
  tipoPersonalizacao: "personalizado" | "tamanho";
}

// ─── Categorias ────────────────────────────────────────────────────────────────

export interface Categoria {
  id: string;
  nome: string;
  keywords: string[];
  ordem: number;
}

export const DEFAULT_CATEGORIAS: Categoria[] = [
  { id: "sacolinha",        nome: "Sacolinha",          keywords: ["sacolinha"],                ordem: 0 },
  { id: "caixinha",         nome: "Caixinha",            keywords: ["caixinha", "caixa"],        ordem: 1 },
  { id: "topos",            nome: "Topos",               keywords: ["topo"],                     ordem: 2 },
  { id: "banderola",        nome: "Banderola",           keywords: ["bandeirola", "banderola"],  ordem: 3 },
  { id: "poster",           nome: "Poster",              keywords: ["poster", "painel"],         ordem: 4 },
  { id: "nao_personalizado",nome: "Não Personalizados",  keywords: [],                           ordem: 5 },
];

// ─── Item de produção ─────────────────────────────────────────────────────────

export interface ItemProducao {
  itemId: string;
  pedidoId: string;
  produto: string;
  variacao: string;
  quantidade: number;
  categoriaId: string;
  observacao: string;
  personalizacao: Personalizacao;
  personalizacaoOk: boolean;
  templateId: string | null;
  templateNome: string | null;
  arteNome: string | null;
  arteId: string | null;
  /** Comportamento herdado da arte do template */
  comportamento: "personalizado" | "agrupado" | "banderola";
  status: "pendente" | "gerado" | "baixado";
  prazoEnvio: string;
  destinatario: string;
  tipoPersonalizacao: "personalizado" | "tamanho";
}

// ─── Agentes de impressão ─────────────────────────────────────────────────────

export interface AgenteConfig {
  id: string;
  nome: string;
  url: string;
}

export const MAX_AGENTES = 2;

export const AGENTE_PADRAO: AgenteConfig = {
  id: "agente-1",
  nome: "PC Principal",
  url: "http://localhost:8765",
};

// ─── Chaves localStorage ──────────────────────────────────────────────────────

const KEYS = {
  orders: "printflow.orders",
  anuncios: "printflow.anuncios",
  categorias: "printflow.categorias",
  producao: "printflow.producao",
  templates: "printflow.templates",
  fontes: "printflow.fontes",
  agentes: "printflow.agentes",
} as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function save<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error(`[PrintFlow] Erro ao salvar "${key}" no localStorage:`, e);
    throw e; // re-lança para o chamador tratar
  }
}

// ─── API pública ──────────────────────────────────────────────────────────────

// Pedidos
export function getOrders(): ParsedOrder[] {
  const raw = load<{ orders?: ParsedOrder[] }>(KEYS.orders, {});
  return raw.orders ?? [];
}
export function saveOrders(orders: ParsedOrder[], fileName: string): void {
  save(KEYS.orders, { orders, fileName });
}

// Anúncios
export function getAnuncios(): Anuncio[] {
  return load<Anuncio[]>(KEYS.anuncios, []);
}
export function saveAnuncios(list: Anuncio[]): void {
  save(KEYS.anuncios, list);
}
export function mergeAnuncios(novosProdutos: string[]): Anuncio[] {
  const existentes = getAnuncios();
  const existMap = new Map(existentes.map((a) => [a.nomeProduto.toLowerCase().trim(), a]));
  const merged: Anuncio[] = novosProdutos.map((nome) => {
    const key = nome.toLowerCase().trim();
    return existMap.get(key) ?? {
      nomeProduto: nome,
      categoriaId: null,
      templateId: null,
      artesIds: null,
      tipoPersonalizacao: "personalizado" as const,
    };
  });
  saveAnuncios(merged);
  return merged;
}

// Templates
export function getTemplates(): Template[] {
  return load<Template[]>(KEYS.templates, []);
}
export function saveTemplates(list: Template[]): void {
  save(KEYS.templates, list);
}
export function getTemplateById(id: string): Template | null {
  return getTemplates().find((t) => t.id === id) ?? null;
}

// Categorias
export function getCategorias(): Categoria[] {
  const stored = load<Categoria[] | null>(KEYS.categorias, null);
  if (!stored) return DEFAULT_CATEGORIAS;
  return stored;
}
export function saveCategorias(list: Categoria[]): void {
  save(KEYS.categorias, list);
}

// Itens de produção
export function getItensProducao(): ItemProducao[] {
  return load<ItemProducao[]>(KEYS.producao, []);
}
export function saveItensProducao(list: ItemProducao[]): void {
  save(KEYS.producao, list);
}

// Fontes customizadas
export function getFontesCustom(): FonteCustom[] {
  return load<FonteCustom[]>(KEYS.fontes, []);
}
export function saveFontesCustom(list: FonteCustom[]): void {
  save(KEYS.fontes, list);
}

// Agentes de impressão
export function getAgentes(): AgenteConfig[] {
  const stored = load<AgenteConfig[] | null>(KEYS.agentes, null);
  if (!stored || stored.length === 0) return [{ ...AGENTE_PADRAO }];
  return stored;
}
export function saveAgentes(list: AgenteConfig[]): void {
  save(KEYS.agentes, list.slice(0, MAX_AGENTES));
}

// ─── Lógica de match ──────────────────────────────────────────────────────────

export function matchCategoria(produto: string, categorias: Categoria[]): string {
  const p = produto.toLowerCase();
  const sorted = [...categorias].sort((a, b) => a.ordem - b.ordem);
  for (const cat of sorted) {
    if (cat.keywords.some((kw) => p.includes(kw.toLowerCase()))) {
      return cat.id;
    }
  }
  return "outros";
}

/**
 * Para itens do tipo "tamanho" (poster, não personalizado):
 * agrupa por produto + variação e soma quantidades.
 * Retorna 1 linha por combinação produto+variação com quantidade total.
 */
export interface ItemAgrupado {
  chave: string;          // produto + variação
  produto: string;
  variacao: string;
  quantidadeTotal: number;
  templateNome: string | null;
  arteNome: string | null;
  categoriaId: string;
  pedidoIds: string[];
  status: ItemProducao["status"];
  itemIds: string[];
}

export function agruparItensTamanho(itens: ItemProducao[]): ItemAgrupado[] {
  const map = new Map<string, ItemAgrupado>();
  for (const item of itens) {
    const chave = `${item.produto}||${item.variacao}||${item.arteNome ?? ""}`;
    if (map.has(chave)) {
      const g = map.get(chave)!;
      g.quantidadeTotal += item.quantidade;
      g.pedidoIds.push(item.pedidoId);
      g.itemIds.push(item.itemId);
      // status: se qualquer um for pendente, o grupo é pendente
      if (item.status === "pendente") g.status = "pendente";
    } else {
      map.set(chave, {
        chave,
        produto: item.produto,
        variacao: item.variacao,
        quantidadeTotal: item.quantidade,
        templateNome: item.templateNome,
        arteNome: item.arteNome,
        categoriaId: item.categoriaId,
        pedidoIds: [item.pedidoId],
        status: item.status,
        itemIds: [item.itemId],
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => a.produto.localeCompare(b.produto));
}

// Categorias que por padrão agrupam (sem configuração de template)
const CATS_AGRUPADAS_DEFAULT = new Set(["poster", "nao_personalizado"]);

export function desmembrarPedidos(
  orders: ParsedOrder[],
  anuncios: Anuncio[],
  categorias: Categoria[],
  templates: Template[],
): ItemProducao[] {
  const anuncioMap  = new Map(anuncios.map((a) => [a.nomeProduto.toLowerCase().trim(), a]));
  const templateMap = new Map(templates.map((t) => [t.id, t]));
  const result: ItemProducao[] = [];

  for (const order of orders) {
    const key      = order.produto.toLowerCase().trim();
    const anuncio  = anuncioMap.get(key) ?? null;
    const template = anuncio?.templateId ? templateMap.get(anuncio.templateId) ?? null : null;

    const categoriaId = anuncio?.categoriaId ?? matchCategoria(order.produto, categorias);

    // tipoPersonalizacao vem do anúncio ou da classificação automática
    const tipoPersonalizacao: "personalizado" | "tamanho" =
      anuncio?.tipoPersonalizacao ?? (order.tipo === "imp_nao_pers" ? "tamanho" : "personalizado");

    // Comportamento padrão baseado na categoria
    const comportamentoPadrao: "personalizado" | "agrupado" =
      CATS_AGRUPADAS_DEFAULT.has(categoriaId) || tipoPersonalizacao === "tamanho"
        ? "agrupado"
        : "personalizado";

    // Artes vinculadas do template
    // Se artesIds está definido → usa só essas artes
    // Se artesIds é null → usa TODAS as artes do template (kit completo)
    // Se não tem template → sem artes
    const artesVinculadas = template && anuncio?.artesIds?.length
      ? template.artes.filter((a) => anuncio.artesIds!.includes(a.id))
      : template
        ? template.artes  // todas as artes do template
        : [];

    if (artesVinculadas.length > 0) {
      for (const arte of artesVinculadas) {
        // Comportamento: arte define > categoria define > padrão
        const comportamento: "personalizado" | "agrupado" | "banderola" =
          arte.comportamento ?? comportamentoPadrao;

        result.push({
          itemId: `${order.id}-${arte.id}-${crypto.randomUUID().slice(0, 6)}`,
          pedidoId: order.id,
          produto: order.produto,
          variacao: order.variacao,
          quantidade: order.quantidade,
          categoriaId: arte.categoriaId,
          observacao: order.observacao,
          personalizacao: { ...order.personalizacao },
          personalizacaoOk: order.personalizacaoOk,
          templateId: template?.id ?? null,
          templateNome: template?.nome ?? null,
          arteNome: arte.nome,
          arteId: arte.id,
          comportamento,
          status: "pendente",
          prazoEnvio: order.prazoEnvio,
          destinatario: order.destinatario,
          tipoPersonalizacao,
        });
      }
    } else {
      result.push({
        itemId: `${order.id}-${crypto.randomUUID().slice(0, 8)}`,
        pedidoId: order.id,
        produto: order.produto,
        variacao: order.variacao,
        quantidade: order.quantidade,
        categoriaId,
        observacao: order.observacao,
        personalizacao: { ...order.personalizacao },
        personalizacaoOk: order.personalizacaoOk,
        templateId: template?.id ?? null,
        templateNome: template?.nome ?? null,
        arteNome: null,
        arteId: null,
        comportamento: comportamentoPadrao,
        status: "pendente",
        prazoEnvio: order.prazoEnvio,
        destinatario: order.destinatario,
        tipoPersonalizacao,
      });
    }
  }

  return result;
}
