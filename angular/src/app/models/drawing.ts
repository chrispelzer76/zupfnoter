/**
 * Drawing model ported from harpnotes.rb (Harpnotes::Drawing module).
 *
 * Format-independent representation of the harp-note sheet.
 * Rendered by SvgEngine or PdfEngine.
 */

import { MusicEntity } from './music-entity';

// ---------------------------------------------------------------------------
// DragInfo – metadata for interactive dragging
// ---------------------------------------------------------------------------

export interface DragInfo {
  handler: 'drag' | 'jumpline' | 'bezier';
  jumpline?: { p1: [number, number]; pv: number; p2: [number, number] };
  bezier?: { cp1: [number, number]; cp2: [number, number] };
}

// ---------------------------------------------------------------------------
// MoreConfKey – additional config keys for context menus
// ---------------------------------------------------------------------------

export interface MoreConfKey {
  confKey: string;
  confValue?: any;
}

// ---------------------------------------------------------------------------
// Drawable – base for all visual elements
// ---------------------------------------------------------------------------

export interface DrawableBase {
  type: string;
  visible: boolean;
  confKey: string | null;
  confValue: any;
  moreConfKeys: MoreConfKey[];
  dragInfo: DragInfo | null;
  color: string;
  size: [number, number];
  lineWidth: number;
  origin: MusicEntity | null;
  znid: string;
}

// ---------------------------------------------------------------------------
// Concrete Drawable types
// ---------------------------------------------------------------------------

export interface EllipseDrawable extends DrawableBase {
  type: 'ellipse';
  center: [number, number];
  fill: 'filled' | 'empty';
  dotted: boolean;
  rect: boolean;
  hasBarOver: boolean;
}

export interface FlowLineDrawable extends DrawableBase {
  type: 'flowline';
  from: [number, number];
  to: [number, number];
  style: 'solid' | 'dashed' | 'dotted';
}

export interface PathDrawable extends DrawableBase {
  type: 'path';
  path: PathCommand[];
  fill: 'filled' | null;
}

export interface AnnotationDrawable extends DrawableBase {
  type: 'annotation';
  center: [number, number];
  text: string;
  style: string;
  align: 'left' | 'center' | 'right';
  baseline: 'alphabetic' | 'middle' | 'top';
}

export interface GlyphDrawable extends DrawableBase {
  type: 'glyph';
  center: [number, number];
  glyphName: string;
  glyphPath: PathCommand[];
  glyphWidth: number;
  glyphHeight: number;
  dotted: boolean;
  filled: boolean;
}

export interface ImageDrawable extends DrawableBase {
  type: 'image';
  url: string;
  position: [number, number];
  height: number;
}

// ---------------------------------------------------------------------------
// Path commands (SVG-like)
// ---------------------------------------------------------------------------

export type PathCommand =
  | ['M', number, number]
  | ['m', number, number]
  | ['l', number, number]
  | ['L', number, number]
  | ['c', number, number, number, number, number, number]
  | ['C', number, number, number, number, number, number]
  | ['z'];

// ---------------------------------------------------------------------------
// Union type of all drawables
// ---------------------------------------------------------------------------

export type Drawable =
  | EllipseDrawable
  | FlowLineDrawable
  | PathDrawable
  | AnnotationDrawable
  | GlyphDrawable
  | ImageDrawable;

// ---------------------------------------------------------------------------
// CompoundDrawable – a group of shapes with a proxy
// ---------------------------------------------------------------------------

export class CompoundDrawable {
  shapes: Drawable[] = [];
  proxy: Drawable | null;

  constructor(shapes: Drawable[], proxy: Drawable | null = null) {
    this.shapes = shapes;
    this.proxy = proxy;
  }

  push(drawable: Drawable): void {
    this.shapes.push(drawable);
  }

  merge(other: CompoundDrawable): void {
    this.shapes.push(...other.shapes);
  }
}

// ---------------------------------------------------------------------------
// Sheet – the top-level drawing container
// ---------------------------------------------------------------------------

export class Sheet {
  readonly children: Drawable[];
  readonly activeVoices: any[];
  printerConfig: any;

  constructor(children: Drawable[], activeVoices: any[], printerConfig: any = {}) {
    this.children = children;
    this.activeVoices = activeVoices;
    this.printerConfig = printerConfig;
  }
}

// ---------------------------------------------------------------------------
// CollisionDetector – checks for overlapping annotations
// ---------------------------------------------------------------------------

export class CollisionDetector {
  private collStack: [number, number, number, number][] = [];

  reset(): void {
    this.collStack = [];
  }

  checkAnnotations(drawables: Drawable[]): void {
    for (const d of drawables) {
      if (d.type === 'annotation') {
        const ann = d as AnnotationDrawable;
        this.check1(ann.center, ann.size, ann.confKey, ann.origin);
      }
    }
  }

  private check1(
    point: [number, number],
    size: [number, number],
    confKey: string | null,
    origin: MusicEntity | null
  ): [number, number] {
    const [x, y] = point;
    const [xSize, ySize] = size;
    const rect: [number, number, number, number] = [x, y, x + xSize, y + ySize];

    const collisions = this.collStack.filter(r => this.rectOverlap(r, rect));
    if (collisions.length > 0) {
      console.warn(`Annotations too close [${collisions.length}] ${confKey}`);
    }

    this.collStack.push(rect);
    return point;
  }

  private rectOverlap(
    r1: [number, number, number, number],
    r2: [number, number, number, number]
  ): boolean {
    const [l1, t1, r1r, b1] = r1;
    const [l2, t2, r2r, b2] = r2;
    return r1r > l2 && r2r > l1 && b1 > t2 && b2 > t1;
  }
}

// ---------------------------------------------------------------------------
// Glyph definitions (rest symbols, fermata, emphasis, etc.)
// ---------------------------------------------------------------------------

export interface GlyphDef {
  d: PathCommand[];
  w: number;
  h: number;
}

export const GLYPHS: Record<string, GlyphDef> = {
  rest_1: {
    d: [['M', -10, -5], ['l', 20, 0], ['l', 0, 10], ['l', -20, 0], ['l', 0, -10], ['z']],
    w: 20,
    h: 10,
  },
  rest_4: {
    d: [
      ['M', -1, -10], ['c', 0.12, -0.06, 0.24, -0.06, 0.36, -0.03],
      ['c', 0.09, 0.06, 4.74, 5.58, 4.86, 5.82], ['c', 0.21, 0.39, 0.15, 0.78, -0.15, 1.26],
      ['c', -0.24, 0.33, -0.72, 0.81, -1.62, 1.56], ['c', -0.45, 0.36, -0.87, 0.75, -0.96, 0.84],
      ['c', -0.93, 0.99, -1.14, 2.49, -0.6, 3.63], ['c', 0.18, 0.39, 0.27, 0.48, 1.32, 1.68],
      ['c', 1.92, 2.25, 1.83, 2.16, 1.83, 2.34], ['c', -0, 0.18, -0.18, 0.36, -0.36, 0.39],
      ['c', -0.15, -0, -0.27, -0.06, -0.48, -0.27], ['c', -0.75, -0.75, -2.46, -1.29, -3.39, -1.08],
      ['c', -0.45, 0.09, -0.69, 0.27, -0.9, 0.69], ['c', -0.12, 0.3, -0.21, 0.66, -0.24, 1.14],
      ['c', -0.03, 0.66, 0.09, 1.35, 0.3, 2.01], ['c', 0.15, 0.42, 0.24, 0.66, 0.45, 0.96],
      ['c', 0.18, 0.24, 0.18, 0.33, 0.03, 0.42], ['c', -0.12, 0.06, -0.18, 0.03, -0.45, -0.3],
      ['c', -1.08, -1.38, -2.07, -3.36, -2.4, -4.83], ['c', -0.27, -1.05, -0.15, -1.77, 0.27, -2.07],
      ['c', 0.21, -0.12, 0.42, -0.15, 0.87, -0.15], ['c', 0.87, 0.06, 2.1, 0.39, 3.3, 0.9],
      ['l', 0.39, 0.18], ['l', -1.65, -1.95], ['c', -2.52, -2.97, -2.61, -3.09, -2.7, -3.27],
      ['c', -0.09, -0.24, -0.12, -0.48, -0.03, -0.75], ['c', 0.15, -0.48, 0.57, -0.96, 1.83, -2.01],
      ['c', 0.45, -0.36, 0.84, -0.72, 0.93, -0.78], ['c', 0.69, -0.75, 1.02, -1.8, 0.9, -2.79],
      ['c', -0.06, -0.33, -0.21, -0.84, -0.39, -1.11], ['c', -0.09, -0.15, -0.45, -0.6, -0.81, -1.05],
      ['c', -0.36, -0.42, -0.69, -0.81, -0.72, -0.87], ['c', -0.09, -0.18, -0, -0.42, 0.21, -0.51],
      ['z'],
    ],
    w: 7.888,
    h: 21.435,
  },
  rest_8: {
    d: [
      ['M', -2, -6.7], ['c', 0.66, -0.09, 1.23, 0.09, 1.68, 0.51],
      ['c', 0.27, 0.3, 0.39, 0.54, 0.57, 1.26], ['c', 0.09, 0.33, 0.18, 0.66, 0.21, 0.72],
      ['c', 0.12, 0.27, 0.33, 0.45, 0.6, 0.48], ['c', 0.12, 0, 0.18, 0, 0.33, -0.09],
      ['c', 0.39, -0.18, 1.32, -1.29, 1.68, -1.98], ['c', 0.09, -0.21, 0.24, -0.3, 0.39, -0.3],
      ['c', 0.12, 0, 0.27, 0.09, 0.33, 0.18], ['c', 0.03, 0.06, -0.27, 1.11, -1.86, 6.42],
      ['c', -1.02, 3.48, -1.89, 6.39, -1.92, 6.42], ['c', 0, 0.03, -0.12, 0.12, -0.24, 0.15],
      ['c', -0.18, 0.09, -0.21, 0.09, -0.45, 0.09], ['c', -0.24, 0, -0.3, 0, -0.48, -0.06],
      ['c', -0.09, -0.06, -0.21, -0.12, -0.21, -0.15], ['c', -0.06, -0.03, 0.15, -0.57, 1.68, -4.92],
      ['c', 0.96, -2.67, 1.74, -4.89, 1.71, -4.89], ['l', -0.51, 0.15],
      ['c', -1.08, 0.36, -1.74, 0.48, -2.55, 0.48], ['c', -0.66, 0, -0.84, -0.03, -1.32, -0.27],
      ['c', -1.32, -0.63, -1.77, -2.16, -1.02, -3.3], ['c', 0.33, -0.45, 0.84, -0.81, 1.38, -0.9],
      ['z'],
    ],
    w: 7.534,
    h: 13.883,
  },
  rest_16: {
    d: [
      ['M', -1.33, -11.12], ['c', 0.66, -0.09, 1.23, 0.09, 1.68, 0.51],
      ['c', 0.27, 0.3, 0.39, 0.54, 0.57, 1.26], ['c', 0.09, 0.33, 0.18, 0.66, 0.21, 0.72],
      ['c', 0.15, 0.39, 0.57, 0.57, 0.87, 0.42], ['c', 0.39, -0.18, 1.2, -1.23, 1.62, -2.07],
      ['c', 0.06, -0.15, 0.24, -0.24, 0.36, -0.24], ['c', 0.12, 0, 0.27, 0.09, 0.33, 0.18],
      ['c', 0.03, 0.06, -0.45, 1.86, -2.67, 10.17], ['c', -1.5, 5.55, -2.73, 10.14, -2.76, 10.17],
      ['c', -0.03, 0.03, -0.12, 0.12, -0.24, 0.15], ['c', -0.18, 0.09, -0.21, 0.09, -0.45, 0.09],
      ['c', -0.24, 0, -0.3, 0, -0.48, -0.06], ['c', -0.09, -0.06, -0.21, -0.12, -0.21, -0.15],
      ['c', -0.06, -0.03, 0.12, -0.57, 1.44, -4.92], ['c', 0.81, -2.67, 1.47, -4.86, 1.47, -4.89],
      ['c', -0.03, 0, -0.27, 0.06, -0.54, 0.15], ['c', -1.08, 0.36, -1.77, 0.48, -2.58, 0.48],
      ['c', -0.66, 0, -0.84, -0.03, -1.32, -0.27], ['c', -1.32, -0.63, -1.77, -2.16, -1.02, -3.3],
      ['c', 0.72, -1.05, 2.22, -1.23, 3.06, -0.42], ['c', 0.3, 0.33, 0.42, 0.6, 0.6, 1.38],
      ['c', 0.09, 0.45, 0.21, 0.78, 0.33, 0.9], ['c', 0.09, 0.09, 0.27, 0.18, 0.45, 0.21],
      ['c', 0.12, 0, 0.18, 0, 0.33, -0.09], ['c', 0.33, -0.15, 1.02, -0.93, 1.41, -1.59],
      ['c', 0.12, -0.21, 0.18, -0.39, 0.39, -1.08], ['c', 0.66, -2.1, 1.17, -3.84, 1.17, -3.87],
      ['c', 0, 0, -0.21, 0.06, -0.42, 0.15], ['c', -0.51, 0.15, -1.2, 0.33, -1.68, 0.42],
      ['c', -0.33, 0.06, -0.51, 0.06, -0.96, 0.06], ['c', -0.66, 0, -0.84, -0.03, -1.32, -0.27],
      ['c', -1.32, -0.63, -1.77, -2.16, -1.02, -3.3], ['c', 0.33, -0.45, 0.84, -0.81, 1.38, -0.9],
      ['z'],
    ],
    w: 9.724,
    h: 21.383,
  },
  fermata: {
    d: [
      ['M', -0.75, -5.34], ['c', 0.12, 0, 0.45, -0.03, 0.69, -0.03],
      ['c', 2.91, -0.03, 5.55, 1.53, 7.41, 4.35], ['c', 1.17, 1.71, 1.95, 3.72, 2.43, 6.03],
      ['c', 0.12, 0.51, 0.12, 0.57, 0.03, 0.69], ['c', -0.12, 0.21, -0.48, 0.27, -0.69, 0.12],
      ['c', -0.12, -0.09, -0.18, -0.24, -0.27, -0.69],
      ['c', -0.78, -3.63, -3.42, -6.54, -6.78, -7.38],
      ['c', -0.78, -0.21, -1.2, -0.24, -2.07, -0.24], ['c', -0.63, -0, -0.84, -0, -1.2, 0.06],
      ['c', -1.83, 0.27, -3.42, 1.08, -4.8, 2.37], ['c', -1.41, 1.35, -2.4, 3.21, -2.85, 5.19],
      ['c', -0.09, 0.45, -0.15, 0.6, -0.27, 0.69], ['c', -0.21, 0.15, -0.57, 0.09, -0.69, -0.12],
      ['c', -0.09, -0.12, -0.09, -0.18, 0.03, -0.69],
      ['c', 0.33, -1.62, 0.78, -3, 1.47, -4.38],
      ['c', 1.77, -3.54, 4.44, -5.67, 7.56, -5.97], ['z'],
      ['M', -0.5, 1.5],
      ['c', 1.38, -0.3, 2.58, 0.9, 2.31, 2.25], ['c', -0.15, 0.72, -0.78, 1.35, -1.47, 1.5],
      ['c', -1.38, 0.27, -2.58, -0.93, -2.31, -2.31], ['c', 0.15, -0.69, 0.78, -1.29, 1.47, -1.44],
      ['z'],
    ],
    w: 19.748,
    h: 11.289,
  },
  emphasis: {
    d: [
      ['M', -6.45, -3.69], ['c', 0.06, -0.03, 0.15, -0.06, 0.18, -0.06],
      ['c', 0.06, 0, 2.85, 0.72, 6.24, 1.59], ['l', 6.33, 1.65],
      ['c', 0.33, 0.06, 0.45, 0.21, 0.45, 0.51], ['c', 0, 0.3, -0.12, 0.45, -0.45, 0.51],
      ['l', -6.33, 1.65], ['c', -3.39, 0.87, -6.18, 1.59, -6.21, 1.59],
      ['c', -0.21, -0, -0.48, -0.24, -0.51, -0.45],
      ['c', 0, -0.15, 0.06, -0.36, 0.18, -0.45],
      ['c', 0.09, -0.06, 0.87, -0.27, 3.84, -1.05],
      ['c', 2.04, -0.54, 3.84, -0.99, 4.02, -1.02],
      ['c', 0.15, -0.06, 1.14, -0.24, 2.22, -0.42], ['c', 1.05, -0.18, 1.92, -0.36, 1.92, -0.36],
      ['c', 0, -0, -0.87, -0.18, -1.92, -0.36], ['c', -1.08, -0.18, -2.07, -0.36, -2.22, -0.42],
      ['c', -0.18, -0.03, -1.98, -0.48, -4.02, -1.02],
      ['c', -2.97, -0.78, -3.75, -0.99, -3.84, -1.05],
      ['c', -0.12, -0.09, -0.18, -0.3, -0.18, -0.45],
      ['c', 0.03, -0.15, 0.15, -0.3, 0.3, -0.39], ['z'],
    ],
    w: 13.5,
    h: 7.5,
  },
  error: {
    d: [['M', -10, -5], ['l', 0, 10], ['l', 20, -10], ['l', 0, 10], ['z']],
    w: 20,
    h: 10,
  },
};

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------

function defaultDrawableBase(type: string): DrawableBase {
  return {
    type,
    visible: true,
    confKey: null,
    confValue: null,
    moreConfKeys: [],
    dragInfo: null,
    color: 'black',
    size: [1, 1],
    lineWidth: 0.1,
    origin: null,
    znid: '',
  };
}

export function createEllipse(
  center: [number, number],
  size: [number, number],
  fill: 'filled' | 'empty' = 'filled',
  dotted = false,
  origin: MusicEntity | null = null,
  rect = false
): EllipseDrawable {
  return {
    ...defaultDrawableBase('ellipse'),
    center,
    size,
    fill,
    dotted,
    rect,
    hasBarOver: false,
    origin,
  } as EllipseDrawable;
}

export function createFlowLine(
  from: [number, number],
  to: [number, number],
  style: 'solid' | 'dashed' | 'dotted' = 'solid'
): FlowLineDrawable {
  return {
    ...defaultDrawableBase('flowline'),
    from,
    to,
    style,
  } as FlowLineDrawable;
}

export function createAnnotation(
  center: [number, number],
  text: string,
  style: string = 'regular',
  origin: MusicEntity | null = null,
  confKey: string | null = null,
  confValue: any = {}
): AnnotationDrawable {
  // Replace smart quotes like the Ruby original
  const cleanText = text.replace(/[„"‚'—–]/g, (ch: string) => {
    const map: Record<string, string> = { '„': '"', '\u201c': '"', '‚': "'", '\u2018': "'", '—': '-', '–': '-' };
    return map[ch] ?? ch;
  });
  return {
    ...defaultDrawableBase('annotation'),
    center,
    text: cleanText,
    style,
    align: 'left',
    baseline: 'alphabetic',
    origin,
    confKey,
    confValue,
  } as AnnotationDrawable;
}

export function createGlyph(
  center: [number, number],
  size: [number, number],
  glyphName: string,
  dotted = false,
  origin: MusicEntity | null = null,
  confKey: string | null = null,
  confValue: any = {}
): GlyphDrawable {
  const glyph = GLYPHS[glyphName] ?? GLYPHS['error'];
  if (!GLYPHS[glyphName]) {
    console.error(`Unsupported glyph: ${glyphName}`);
  }
  return {
    ...defaultDrawableBase('glyph'),
    center,
    size,
    glyphName,
    glyphPath: glyph.d,
    glyphWidth: glyph.w,
    glyphHeight: glyph.h,
    dotted,
    filled: true,
    origin,
    confKey,
    confValue,
  } as GlyphDrawable;
}

export function createPath(
  path: PathCommand[],
  fill: 'filled' | null = null,
  origin: MusicEntity | null = null
): PathDrawable {
  return {
    ...defaultDrawableBase('path'),
    path,
    fill,
    origin,
  } as PathDrawable;
}
