/**
 * Configuration type definitions for Zupfnoter.
 * Matches the structure from init_conf.rb.
 */

// ---------------------------------------------------------------------------
// Font style
// ---------------------------------------------------------------------------

export interface FontStyleDef {
  text_color: [number, number, number];
  font_size: number;
  font_style: 'normal' | 'bold' | 'italic';
}

// ---------------------------------------------------------------------------
// Duration to style mapping
// ---------------------------------------------------------------------------

export type FillStyle = 'filled' | 'empty';

/** [scaleFactor, fillStyle, dotted] */
export type DurationStyle = [number, FillStyle, boolean];

/** [size, glyphName, dotted] */
export type RestGlyphStyle = [[number, number], string, boolean];

/** [scaleFactor, fillStyle, dotted, beamCount?] */
export type DurationBeamStyle = [number, string, boolean, number?];

// ---------------------------------------------------------------------------
// Layout configuration
// ---------------------------------------------------------------------------

export interface LayoutColor {
  color_default: string;
  color_variant1: string;
  color_variant2: string;
}

export interface PackerConfig {
  pack_method: number;
  pack_max_spreadfactor: number;
  pack_min_increment: number;
}

export interface LayoutConfig {
  grid: boolean;
  limit_a3: boolean;
  SHOW_SLUR: boolean;
  bottomup: boolean;
  beams: boolean;
  jumpline_anchor: [number, number];
  color: LayoutColor;
  LINE_THIN: number;
  LINE_MEDIUM: number;
  LINE_THICK: number;
  PITCH_OFFSET: number;
  X_SPACING: number;
  X_OFFSET: number;
  Y_SCALE: number;
  ELLIPSE_SIZE: [number, number];
  REST_SIZE: [number, number];
  DRAWING_AREA_SIZE: [number, number];
  BEAT_RESOLUTION: number;
  SHORTEST_NOTE: number;
  BEAT_PER_DURATION: number;
  MM_PER_POINT: number;
  instrument: string;
  packer: PackerConfig;
  FONT_STYLE_DEF: Record<string, FontStyleDef>;
  DURATION_TO_STYLE: Record<string, DurationStyle>;
  DURATION_TO_BEAMS: Record<string, DurationBeamStyle>;
  REST_TO_GLYPH: Record<string, RestGlyphStyle>;
}

// ---------------------------------------------------------------------------
// Extract configuration
// ---------------------------------------------------------------------------

export interface RepeatSignConfig {
  pos: [number, number];
  text: string;
  style: string;
}

export interface RepeatSignsConfig {
  voices: number[];
  left: RepeatSignConfig;
  right: RepeatSignConfig;
}

export interface SortMarkConfig {
  size: [number, number];
  fill: boolean;
  show: boolean;
}

export interface BarnumberConfig {
  voices: number[];
  pos: [number, number];
  autopos: boolean;
  apanchor: string;
  apbase: [number, number];
  style: string;
  prefix: string;
}

export interface CountnoteConfig {
  voices: number[];
  pos: [number, number];
  autopos: boolean;
  apbase: [number, number];
  apanchor: string;
  style: string;
}

export interface StringNamesConfig {
  text: string;
  vpos: number[];
  style: string;
  marks: {
    vpos: number[];
    hpos: number[];
  };
}

export interface PrinterConfig {
  a3_offset: [number, number];
  a4_offset: [number, number];
  a4_pages: number[];
  show_border: boolean;
}

export interface LegendConfig {
  spos: [number, number];
  pos: [number, number];
}

export interface ExtractConfig {
  title: string;
  startpos: number;
  voices: number[];
  synchlines: [number, number][];
  flowlines: number[];
  subflowlines: number[];
  jumplines: number[];
  layoutlines: number[];
  repeatsigns: RepeatSignsConfig;
  legend: LegendConfig;
  lyrics: Record<string, any>;
  images: Record<string, any>;
  notes: Record<string, any>;
  layout: Partial<LayoutConfig>;
  sortmark: SortMarkConfig;
  nonflowrest: boolean;
  tuplets: { text: string };
  barnumbers: BarnumberConfig;
  countnotes: CountnoteConfig;
  stringnames: StringNamesConfig;
  printer: PrinterConfig;
}

// ---------------------------------------------------------------------------
// Top-level application configuration
// ---------------------------------------------------------------------------

export interface ZupfnoterConfig {
  produce: number[];
  abc_parser: string;
  restposition: {
    default: string;
    repeatstart: string;
    repeatend: string;
  };
  wrap: number;
  defaults: any;
  templates: any;
  presets: any;
  annotations: Record<string, any>;
  extract: Record<number, ExtractConfig>;
  layout: LayoutConfig;
  neatjson: any;
}
