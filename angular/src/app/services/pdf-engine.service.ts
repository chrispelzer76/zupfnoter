/**
 * PDF rendering engine ported from pdf_engine.rb.
 * Converts Drawing Model (Sheet) → PDF using jsPDF.
 */
import { Injectable } from '@angular/core';
import { ConfstackService } from './confstack.service';
import {
  Sheet, Drawable, EllipseDrawable, FlowLineDrawable,
  AnnotationDrawable, GlyphDrawable, PathDrawable, ImageDrawable,
  PathCommand,
} from '../models/drawing';
import jsPDF from 'jspdf';

const DOTTED_SIZE = 0.5;

const COLORS: Record<string, [number, number, number]> = {
  black: [0, 0, 0],
  white: [255, 255, 255],
  grey: [128, 128, 128],
  lightgrey: [211, 211, 211],
  darkgrey: [169, 169, 169],
  dimgrey: [105, 105, 105],
};

@Injectable({ providedIn: 'root' })
export class PdfEngineService {

  constructor(private conf: ConfstackService) {}

  /** Render sheet to a single-page A3 landscape PDF and trigger download */
  drawA3(sheet: Sheet, filename = 'harpnotes.pdf'): void {
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3' });
    const offsets = sheet.printerConfig?.a3_offset ?? [0, 0];
    this.drawSheet(pdf, sheet, offsets[0], offsets[1]);

    if (sheet.printerConfig?.show_border) {
      pdf.rect(1, 1, 418, 295);
      pdf.rect(0, 0, 420, 297);
    }

    pdf.save(filename);
  }

  /** Render sheet as multi-page A4 portrait PDF (segmented) and trigger download */
  drawA4(sheet: Sheet, filename = 'harpnotes_a4.pdf'): void {
    const xSpacing = this.conf.get('layout.X_SPACING') ?? 11.5;
    const delta = -12.0 * xSpacing;
    const a4Offset = sheet.printerConfig?.a4_offset ?? [-5, 0];
    const pages: number[] = sheet.printerConfig?.a4_pages ?? [0, 1, 2];

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const yOffset = a4Offset[1];

    for (let i = 0; i < pages.length; i++) {
      if (i > 0) pdf.addPage();
      const xOffset = 30 + a4Offset[0] + pages[i] * delta;
      this.drawSheet(pdf, sheet, xOffset, yOffset);
    }

    pdf.save(filename);
  }

  /** Get PDF as blob (for preview or programmatic use) */
  toBlob(sheet: Sheet, format: 'a3' | 'a4' = 'a3'): Blob {
    const pdf = format === 'a3'
      ? this.createA3Pdf(sheet)
      : this.createA4Pdf(sheet);
    return pdf.output('blob') as unknown as Blob;
  }

  // =========================================================================
  // Internal
  // =========================================================================

  private createA3Pdf(sheet: Sheet): jsPDF {
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3' });
    const offsets = sheet.printerConfig?.a3_offset ?? [0, 0];
    this.drawSheet(pdf, sheet, offsets[0], offsets[1]);
    return pdf;
  }

  private createA4Pdf(sheet: Sheet): jsPDF {
    const xSpacing = this.conf.get('layout.X_SPACING') ?? 11.5;
    const delta = -12.0 * xSpacing;
    const a4Offset = sheet.printerConfig?.a4_offset ?? [-5, 0];
    const pages: number[] = sheet.printerConfig?.a4_pages ?? [0, 1, 2];

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const yOffset = a4Offset[1];

    for (let i = 0; i < pages.length; i++) {
      if (i > 0) pdf.addPage();
      const xOffset = 30 + a4Offset[0] + pages[i] * delta;
      this.drawSheet(pdf, sheet, xOffset, yOffset);
    }
    return pdf;
  }

  private drawSheet(pdf: jsPDF, sheet: Sheet, xOffset: number, yOffset: number): void {
    for (const child of sheet.children) {
      if (!child.visible) continue;
      pdf.setLineWidth(child.lineWidth);

      switch (child.type) {
        case 'ellipse':
          this.drawEllipse(pdf, child as EllipseDrawable, xOffset, yOffset);
          break;
        case 'flowline':
          this.drawFlowline(pdf, child as FlowLineDrawable, xOffset, yOffset);
          break;
        case 'glyph':
          this.drawGlyph(pdf, child as GlyphDrawable, xOffset, yOffset);
          break;
        case 'path':
          this.drawPath(pdf, child as PathDrawable, xOffset, yOffset);
          break;
        case 'annotation':
          this.drawAnnotation(pdf, child as AnnotationDrawable, xOffset, yOffset);
          break;
        case 'image':
          this.drawImage(pdf, child as ImageDrawable, xOffset, yOffset);
          break;
      }
    }
  }

  private drawEllipse(pdf: jsPDF, e: EllipseDrawable, xOff: number, yOff: number): void {
    const cx = e.center[0] + xOff;
    const cy = e.center[1] + yOff;
    const [rx, ry] = e.size;
    const color = this.getColor(e.color);
    const style = e.fill === 'filled' ? 'F' : 'FD';

    pdf.setLineWidth(0);
    this.setStroke(pdf, color);
    this.setFill(pdf, e.fill === 'filled' ? color : COLORS['white']);

    if (e.rect) {
      pdf.rect(cx - rx, cy - ry, rx * 2, ry * 2, style);
    } else {
      pdf.ellipse(cx, cy, rx, ry, style);
    }

    // For empty (unfilled) notes, draw border with line width
    if (e.fill !== 'filled') {
      pdf.setLineWidth(e.lineWidth);
      const rx2 = rx - e.lineWidth / 2;
      const ry2 = ry - e.lineWidth / 2;
      if (e.rect) {
        pdf.rect(cx - rx2, cy - ry2, rx2 * 2, ry2 * 2, style);
      } else {
        pdf.ellipse(cx, cy, rx2, ry2, style);
      }
    }

    if (e.dotted) {
      this.drawDot(pdf, cx, cy, rx, e.lineWidth, color);
    }

    // Reset
    this.setStroke(pdf, COLORS['black']);
    this.setFill(pdf, COLORS['black']);
  }

  private drawFlowline(pdf: jsPDF, fl: FlowLineDrawable, xOff: number, yOff: number): void {
    const color = this.getColor(fl.color);
    this.setStroke(pdf, color);

    if (fl.style === 'dashed') {
      pdf.setLineDashPattern([3 / 2.84, 3 / 2.84], 0);
    } else if (fl.style === 'dotted') {
      pdf.setLineDashPattern([1.5 / 2.84, 1.5 / 2.84], 0);
    }

    const x1 = fl.from[0] + xOff;
    const y1 = fl.from[1] + yOff;
    const x2 = fl.to[0] + xOff;
    const y2 = fl.to[1] + yOff;

    pdf.line(x1, y1, x2, y2);

    // Reset dash
    pdf.setLineDashPattern([], 0);
  }

  private drawAnnotation(pdf: jsPDF, ann: AnnotationDrawable, xOff: number, yOff: number): void {
    const styleDef = this.conf.get(`layout.FONT_STYLE_DEF.${ann.style}`)
      ?? this.conf.get('layout.FONT_STYLE_DEF.regular')
      ?? { text_color: [0, 0, 0], font_size: 12, font_style: 'normal' };

    const mmPerPoint = this.conf.get('layout.MM_PER_POINT') ?? 0.3;

    const textColor = styleDef.text_color ?? [0, 0, 0];
    pdf.setTextColor(textColor[0], textColor[1], textColor[2]);
    pdf.setFontSize(styleDef.font_size * 0.983);

    const fontStyle = styleDef.font_style ?? 'normal';
    pdf.setFont('helvetica', fontStyle);

    const x = ann.center[0] + xOff;
    const y = ann.center[1] + yOff + styleDef.font_size * mmPerPoint;
    const align = ann.align || 'left';

    // Handle line breaks and tilde-to-space conversion
    let text = ann.text.replace(/(?<!\\)~/g, ' ');
    const lines = text.split('\n');

    pdf.text(lines.length === 1 ? lines[0] : lines, x, y, { align });
  }

  private drawGlyph(pdf: jsPDF, g: GlyphDrawable, xOff: number, yOff: number): void {
    const cx = g.center[0] + xOff;
    const cy = g.center[1] + yOff;
    const [sx, sy] = g.size;
    const scaleFactor = (sy * 2) / g.glyphHeight;

    // White background
    this.setFill(pdf, COLORS['white']);
    this.setStroke(pdf, COLORS['white']);
    pdf.rect(cx - sx, cy - sy, sx * 2, sy * 2, 'FD');

    // Draw glyph path
    const color = this.getColor(g.color);
    this.setFill(pdf, color);
    this.setStroke(pdf, color);
    pdf.setLineWidth(0.0001);

    const scale: [number, number] = [scaleFactor, scaleFactor];
    let lines: number[][] = [];
    let start: [number, number] = [0, 0];

    for (const cmd of g.glyphPath) {
      switch (cmd[0]) {
        case 'M':
          if (lines.length > 0) {
            pdf.lines(lines, start[0], start[1], scale, 'FD', false);
          }
          lines = [];
          start = [cx + (cmd[1] as number) * scaleFactor, cy + (cmd[2] as number) * scaleFactor];
          break;
        case 'l':
        case 'm':
        case 'c':
          lines.push((cmd as any[]).slice(1));
          break;
        case 'z':
          if (lines.length > 0) {
            pdf.lines(lines, start[0], start[1], scale, 'FD', true);
          }
          lines = [];
          break;
      }
    }

    this.setStroke(pdf, COLORS['black']);

    if (g.dotted) {
      this.drawDot(pdf, cx, cy, sx, g.lineWidth, color);
    }
  }

  private drawPath(pdf: jsPDF, p: PathDrawable, xOff: number, yOff: number): void {
    const style = p.fill === 'filled' ? 'FD' : 'S';
    const color = this.getColor(p.color);
    this.setFill(pdf, p.fill === 'filled' ? color : COLORS['white']);
    this.setStroke(pdf, color);
    pdf.setLineCap(1); // round

    let lines: number[][] = [];
    const scale: [number, number] = [1, 1];
    let start: [number, number] = [0, 0];

    for (const cmd of p.path) {
      switch (cmd[0]) {
        case 'M':
          if (lines.length > 0) {
            pdf.lines(lines, start[0], start[1], scale, style, false);
          }
          lines = [];
          start = [(cmd[1] as number) + xOff, (cmd[2] as number) + yOff];
          break;
        case 'L': {
          // Convert absolute to relative
          const absX = (cmd[1] as number) + xOff;
          const absY = (cmd[2] as number) + yOff;
          // Compute current position from start + accumulated lines
          const cur = this.currentPos(start, lines);
          lines.push([absX - cur[0], absY - cur[1]]);
          break;
        }
        case 'l':
        case 'c':
          lines.push((cmd as any[]).slice(1));
          break;
        case 'z':
          if (lines.length > 0) {
            pdf.lines(lines, start[0], start[1], scale, 'FD', true);
          }
          lines = [];
          break;
      }
    }

    if (lines.length > 0) {
      pdf.lines(lines, start[0], start[1], scale, style, false);
    }
  }

  private drawImage(pdf: jsPDF, img: ImageDrawable, xOff: number, yOff: number): void {
    const x = img.position[0] + xOff;
    const y = img.position[1] + yOff + img.height;

    if (img.url.startsWith('data:image/jpeg')) {
      pdf.addImage(img.url, 'JPEG', x, y, 0, img.height);
    } else if (img.url.startsWith('data:image/png')) {
      pdf.addImage(img.url, 'PNG', x, y, 0, img.height);
    }
  }

  // =========================================================================
  // Helpers
  // =========================================================================

  private drawDot(
    pdf: jsPDF, cx: number, cy: number, rx: number,
    lineWidth: number, color: [number, number, number]
  ): void {
    const ds = DOTTED_SIZE + lineWidth;
    const x = cx + rx + ds;

    // White background for dot
    pdf.setLineWidth(0);
    this.setFill(pdf, COLORS['white']);
    this.setStroke(pdf, COLORS['white']);
    pdf.ellipse(x, cy, ds, ds, 'FD');

    // Dot
    this.setFill(pdf, color);
    this.setStroke(pdf, color);
    pdf.ellipse(x, cy, DOTTED_SIZE, DOTTED_SIZE, 'FD');
  }

  private getColor(name: string): [number, number, number] {
    return COLORS[name] ?? COLORS['black'];
  }

  private setFill(pdf: jsPDF, rgb: [number, number, number]): void {
    pdf.setFillColor(rgb[0], rgb[1], rgb[2]);
  }

  private setStroke(pdf: jsPDF, rgb: [number, number, number]): void {
    pdf.setDrawColor(rgb[0], rgb[1], rgb[2]);
  }

  /** Compute current absolute position from start + relative line segments */
  private currentPos(start: [number, number], lines: number[][]): [number, number] {
    let x = start[0];
    let y = start[1];
    for (const seg of lines) {
      // For 'l' segments: [dx, dy]
      // For 'c' segments: [cx1, cy1, cx2, cy2, dx, dy]
      if (seg.length === 2) {
        x += seg[0];
        y += seg[1];
      } else if (seg.length === 6) {
        x += seg[4];
        y += seg[5];
      }
    }
    return [x, y];
  }
}
