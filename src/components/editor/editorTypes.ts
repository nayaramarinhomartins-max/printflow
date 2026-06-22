export type Orientation = "portrait" | "landscape";
export type EffectType = "none" | "shadow" | "glow" | "outline" | "neon";

/**
 * Tipo do layer:
 * - "texto": campo de texto normal (nome, idade, texto fixo)
 * - "letra": campo que recebe UMA letra por vez (banderola)
 *   O sistema itera sobre cada letra do nome e gera 1 página por grupo de letras
 */
export type LayerTipo = "texto" | "letra";

export interface TextLayer {
  id: string;
  label: string;
  text: string;
  /** "texto" = normal | "letra" = 1 letra por banderola */
  tipo?: LayerTipo;
  x: number;
  y: number;
  rotation: number;
  fontSize: number;
  fontFamily: string;
  color: string;
  colors: string[];
  bold: boolean;
  italic: boolean;
  borderWidth: number;
  borderColor: string;
  padding: number;
  bgColor: string;
  bgEnabled: boolean;
  effect: EffectType;
  effectColor: string;
  letterSpacing: number;
}

export interface EditorState {
  orientation: Orientation;
  bgImage: string | null;
  layers: TextLayer[];
}

export const defaultLayer = (label: string, text: string, y: number): TextLayer => ({
  id: crypto.randomUUID(),
  label,
  text,
  tipo: "texto",
  x: 50,
  y,
  rotation: 0,
  fontSize: 48,
  fontFamily: "Montserrat, sans-serif",
  color: "#1a1a1a",
  colors: [],
  bold: false,
  italic: false,
  borderWidth: 0,
  borderColor: "#000000",
  padding: 8,
  bgColor: "#ffffff",
  bgEnabled: false,
  effect: "none",
  effectColor: "#7c3aed",
  letterSpacing: 0,
});

export const DEFAULT_EDITOR_STATE: EditorState = {
  orientation: "portrait",
  bgImage: null,
  layers: [],
};
