import { getTemplates, getAnuncios, type ItemProducao } from "@/lib/store";
import { type EditorState, type TextLayer } from "@/components/editor/editorTypes";

export function resolveEditorState(item: ItemProducao): { state: EditorState; warning?: string } {
  const todosTemplates = getTemplates();
  const todosAnuncios  = getAnuncios();

  let templateId = item.templateId;
  if (!templateId) {
    const anuncio = todosAnuncios.find(
      (a) => a.nomeProduto.toLowerCase().trim() === item.produto.toLowerCase().trim()
    );
    templateId = anuncio?.templateId ?? null;
  }

  const template = templateId ? todosTemplates.find((t) => t.id === templateId) ?? null : null;

  if (!template) {
    return {
      state: blankState(item),
      warning: `Template não encontrado para "${item.produto.slice(0, 40)}". Vincule o template em Anúncios.`,
    };
  }

  const nome = item.personalizacao.nome ?? "";
  const nomeComposto = nome.trim().includes(" ");
  const artesCategoria = template.artes.filter((a) => a.categoriaId === item.categoriaId);

  let arte: typeof template.artes[0] | null = null;

  if (item.categoriaId === "banderola" && artesCategoria.length > 1) {
    const artesComLetra = artesCategoria.map((a) => ({
      arte: a,
      qtdLetra: (a.editorState?.layers as TextLayer[] ?? []).filter((l) => l.tipo === "letra").length,
    }));
    if (nomeComposto) {
      arte = artesComLetra.find((x) => x.qtdLetra === 3)?.arte
          ?? artesComLetra.find((x) => x.qtdLetra > 2)?.arte
          ?? artesComLetra[0]?.arte ?? null;
    } else {
      arte = artesComLetra.find((x) => x.qtdLetra === 2)?.arte
          ?? artesComLetra.find((x) => x.qtdLetra > 0)?.arte
          ?? artesComLetra[0]?.arte ?? null;
    }
  } else {
    arte = template.artes.find((a) => a.nome === item.arteNome)
        ?? artesCategoria[0]
        ?? template.artes[0]
        ?? null;
  }

  if (!arte?.editorState?.bgImage) {
    return {
      state: blankState(item),
      warning: arte ? `Arte "${arte.nome}" sem PDF de fundo.` : "Arte não configurada no template.",
    };
  }

  const layersArte = arte.editorState.layers as TextLayer[];
  const temCamposLetra = layersArte.some((l) => l.tipo === "letra");

  const layers = layersArte.map((layer) => {
    if (temCamposLetra) return layer;
    const label = layer.label?.toLowerCase() ?? "";
    if (label === "nome" || label.includes("nome")) {
      return { ...layer, text: item.personalizacao.nome || layer.text };
    }
    if (label === "idade" || label.includes("idade")) {
      if (!item.personalizacao.idade) return layer;
      return { ...layer, text: `${item.personalizacao.idade.replace(/\D/g, "")} anos` };
    }
    return layer;
  });

  let state: EditorState = {
    orientation: arte.editorState.orientation as "portrait" | "landscape",
    bgImage: arte.editorState.bgImage,
    layers,
  };

  if (item.categoriaId === "poster" && item.variacao) {
    const v = item.variacao.toUpperCase();
    if (v.includes("A3")) state = { ...state, orientation: "landscape" };
    else if (v.includes("A4")) state = { ...state, orientation: "portrait" };
  }

  return { state };
}

function blankState(item: ItemProducao): EditorState {
  return {
    orientation: "portrait",
    bgImage: null,
    layers: [
      {
        id: crypto.randomUUID(), label: "Nome",
        text: item.personalizacao.nome || "Nome",
        x: 50, y: 30, rotation: 0, fontSize: 64,
        fontFamily: "Montserrat, sans-serif",
        color: "#1a1a1a", colors: [], bold: true, italic: false,
        borderWidth: 0, borderColor: "#000000",
        padding: 8, bgColor: "#ffffff", bgEnabled: false,
        effect: "none", effectColor: "#7c3aed", letterSpacing: 0,
      },
      {
        id: crypto.randomUUID(), label: "Idade",
        text: item.personalizacao.idade ? `${item.personalizacao.idade} anos` : "Idade",
        x: 50, y: 45, rotation: 0, fontSize: 48,
        fontFamily: "Montserrat, sans-serif",
        color: "#1a1a1a", colors: [], bold: false, italic: false,
        borderWidth: 0, borderColor: "#000000",
        padding: 8, bgColor: "#ffffff", bgEnabled: false,
        effect: "none", effectColor: "#7c3aed", letterSpacing: 0,
      },
    ],
  };
}
