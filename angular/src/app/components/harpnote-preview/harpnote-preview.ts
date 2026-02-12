import { Component, input, output, signal, ElementRef, ViewChild } from '@angular/core';
import {
  Sheet, Drawable, EllipseDrawable, FlowLineDrawable,
  AnnotationDrawable, GlyphDrawable, PathDrawable,
} from '../../models/drawing';

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
  viewBox = signal('0 0 400 282');
  highlightedOrigin = signal<{ startChar: number; endChar: number } | null>(null);

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

  /** Build stroke-dasharray for dashed/dotted lines */
  dashArray(style: string): string {
    switch (style) {
      case 'dashed': return '4,2';
      case 'dotted': return '1,2';
      default: return '';
    }
  }

  /** Get font size for annotation style (converted from points to mm for SVG viewBox) */
  getFontSize(style: string): number {
    const MM_PER_POINT = 0.3;
    const sizes: Record<string, number> = {
      regular: 12, bold: 12, italic: 12, large: 20,
      small: 9, small_bold: 9, small_italic: 9, smaller: 6,
    };
    return (sizes[style] ?? 12) * MM_PER_POINT;
  }

  /** Get font weight for annotation style */
  getFontWeight(style: string): string {
    return ['bold', 'small_bold', 'large'].includes(style) ? 'bold' : 'normal';
  }

  /** Get font style for annotation style */
  getFontStyle(style: string): string {
    return ['italic', 'small_italic'].includes(style) ? 'italic' : 'normal';
  }
}
