import { Component, input, output, signal, computed, ElementRef, ViewChild } from '@angular/core';
import {
  Sheet, Drawable, EllipseDrawable, FlowLineDrawable,
  AnnotationDrawable, GlyphDrawable, PathDrawable,
} from '../../models/drawing';

/** Ruby FONT_STYLE_DEF font_size values (used for annotation rendering) */
const FONT_SIZES: Record<string, number> = {
  regular: 12, bold: 12, italic: 12, large: 20,
  small: 9, small_bold: 9, small_italic: 9, smaller: 6,
};

@Component({
  selector: 'app-harpnote-preview',
  standalone: true,
  templateUrl: './harpnote-preview.html',
  styleUrl: './harpnote-preview.scss',
})
export class HarpnotePreviewComponent {
  @ViewChild('svgElement') svgElement!: ElementRef<SVGSVGElement>;

  sheet = input<Sheet | null>(null);
  noteClicked = output<{ startChar: number; endChar: number }>();

  zoom = signal(1);
  highlightedOrigin = signal<{ startChar: number; endChar: number } | null>(null);

  /** Compute viewBox from sheet content — uses A3 landscape (420x297) as minimum,
   *  but expands if drawables extend beyond that. */
  viewBox = computed(() => {
    const s = this.sheet();
    if (!s || s.children.length === 0) return '0 0 420 297';
    let maxY = 297; // A3 landscape height in mm
    let maxX = 420; // A3 landscape width in mm
    for (const item of s.children) {
      if (!item.visible) continue;
      if (item.type === 'ellipse') {
        const e = item as EllipseDrawable;
        const y = e.center[1] + e.size[1] + 5;
        const x = e.center[0] + e.size[0] + 5;
        if (y > maxY) maxY = y;
        if (x > maxX) maxX = x;
      } else if (item.type === 'glyph') {
        const g = item as GlyphDrawable;
        const y = g.center[1] + g.size[1] * 2 + 5;
        if (y > maxY) maxY = y;
      } else if (item.type === 'annotation') {
        const a = item as AnnotationDrawable;
        const y = a.center[1] + 10;
        if (y > maxY) maxY = y;
      } else if (item.type === 'flowline') {
        const fl = item as FlowLineDrawable;
        const y = Math.max(fl.from[1], fl.to[1]) + 2;
        if (y > maxY) maxY = y;
      } else if (item.type === 'path') {
        // Paths (jumplines etc.) — scan path commands for absolute Y values
        const p = item as PathDrawable;
        for (const cmd of p.path) {
          if (cmd.length >= 3 && typeof cmd[2] === 'number') {
            const cmdType = cmd[0] as string;
            // Only track absolute Y positions (not relative offsets like 'l')
            if (cmdType === 'M' || cmdType === 'L' || cmdType === 'C') {
              const y = cmd[2] + 5;
              if (y > maxY) maxY = y;
            }
          }
        }
      }
    }
    const vb = `0 0 ${Math.ceil(maxX)} ${Math.ceil(maxY)}`;
    console.log('viewBox computed:', vb, `(${s.children.length} children, ${s.children.filter(c => c.visible).length} visible)`);
    return vb;
  });

  /** Handle click on a drawable item with an origin */
  onItemClick(item: Drawable): void {
    if (item.origin?.origin) {
      const origin = {
        startChar: item.origin.origin.startChar,
        endChar: item.origin.origin.endChar,
      };
      this.noteClicked.emit(origin);
    }
  }

  /** Highlight drawables matching the given ABC source range */
  highlightRange(startChar: number, endChar: number): void {
    this.highlightedOrigin.set({ startChar, endChar });
    // Auto-scroll to the first highlighted element
    this.scrollToHighlighted();
  }

  /** Remove all highlights */
  clearHighlight(): void {
    this.highlightedOrigin.set(null);
  }

  /** Check if a drawable should be highlighted */
  isHighlighted(item: Drawable): boolean {
    const hl = this.highlightedOrigin();
    if (!hl || !item.origin?.origin) return false;
    const o = item.origin.origin;
    return hl.endChar > o.startChar && hl.startChar < o.endChar;
  }

  /** Zoom controls */
  zoomIn(): void {
    this.zoom.update(z => Math.min(z * 1.2, 5));
  }

  zoomOut(): void {
    this.zoom.update(z => Math.max(z / 1.2, 0.2));
  }

  zoomFit(): void {
    this.zoom.set(1);
  }

  // Type guard helpers for the template
  isEllipse(item: Drawable): item is EllipseDrawable { return item.type === 'ellipse'; }
  isFlowLine(item: Drawable): item is FlowLineDrawable { return item.type === 'flowline'; }
  isAnnotation(item: Drawable): item is AnnotationDrawable { return item.type === 'annotation'; }
  isGlyph(item: Drawable): item is GlyphDrawable { return item.type === 'glyph'; }
  isPath(item: Drawable): item is PathDrawable { return item.type === 'path'; }

  /** Convert a path command array to SVG path data string */
  pathToString(commands: any[]): string {
    return commands.map((cmd: any[]) => cmd.join(' ')).join(' ');
  }

  /** Build stroke-dasharray for dashed/dotted lines (matching Ruby: 3/2.84 and 1.5/2.84) */
  dashArray(style: string): string {
    switch (style) {
      case 'dashed': return '1.056,1.056';
      case 'dotted': return '0.528,0.528';
      default: return '';
    }
  }

  /**
   * Get font size for annotation style (matching Ruby: font_size / 3)
   * Ruby uses: style[:font_size] / 3 — "literal by try and error"
   */
  getAnnotationFontSize(style: string): number {
    return (FONT_SIZES[style] ?? 12) / 3;
  }

  /**
   * Get Y-offset for annotation transform (matching Ruby: -font_size / 8)
   */
  getAnnotationYOffset(style: string): number {
    return -(FONT_SIZES[style] ?? 12) / 8;
  }

  /** Get font weight for annotation style */
  getFontWeight(style: string): string {
    return ['bold', 'small_bold', 'large'].includes(style) ? 'bold' : 'normal';
  }

  /** Get font style for annotation style */
  getFontStyle(style: string): string {
    return ['italic', 'small_italic'].includes(style) ? 'italic' : 'normal';
  }

  /** Check if text contains newlines */
  hasMultipleLines(text: string): boolean {
    return text.includes('\n');
  }

  /** Split text by newlines for tspan rendering */
  splitTextLines(text: string): string[] {
    // Match Ruby: gsub(/\ +\n/, "\n").gsub("\n\n", "\n \n")
    return text
      .replace(/ +\n/g, '\n')
      .replace(/\n\n/g, '\n \n')
      .split('\n');
  }

  /**
   * Compute glyph scale factor (matching Ruby: size * 2 / glyph.h).
   * Ruby doubles the size ("size to be treated as radius"), then
   * computes scalefactor = size.last / glyph.h (where size is already doubled).
   */
  glyphScale(item: GlyphDrawable): string {
    const scaleX = item.glyphHeight > 0 ? (item.size[0] * 2) / item.glyphHeight : item.size[0];
    const scaleY = item.glyphHeight > 0 ? (item.size[1] * 2) / item.glyphHeight : item.size[1];
    return `${scaleX},${scaleY}`;
  }

  /** Auto-scroll the preview container to the first highlighted element */
  private scrollToHighlighted(): void {
    requestAnimationFrame(() => {
      const host = (this.svgElement?.nativeElement as Element)?.closest('.svg-wrapper')?.parentElement;
      if (!host) return;
      const highlighted = host.querySelector('.highlighted');
      if (highlighted) {
        highlighted.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    });
  }
}
