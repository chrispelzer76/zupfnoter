import { Component, input, output, ElementRef, ViewChild, AfterViewChecked } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

/** Emitted when a note is dragged to a new pitch */
export interface NoteDragEvent {
  startChar: number;
  endChar: number;
  pitchDelta: number;
}

/** Internal drag state */
interface DragState {
  startSvgY: number;
  startChar: number;
  endChar: number;
  gElement: Element | null;
  svg: SVGSVGElement;
  /** Accumulated snapped delta in diatonic steps */
  lastSteps: number;
}

/** SVG units per diatonic step (half the staff line spacing in abc2svg default) */
const SVG_UNITS_PER_STEP = 3;

@Component({
  selector: 'app-tune-preview',
  standalone: true,
  template: `
    <div #container class="tune-preview" [innerHTML]="sanitizedSvg()"></div>
  `,
  styles: [`
    :host { display: block; height: 100%; overflow: auto; }
    .tune-preview {
      padding: 8px;
    }
    /* ::ng-deep required to style innerHTML SVG content (no _ngcontent attrs) */
    :host ::ng-deep svg {
      max-width: 100%;
      height: auto;
    }
    /* abcref rects: transparent by default, clickable */
    :host ::ng-deep rect.abcref {
      fill: #ff0000;
      fill-opacity: 0;
      cursor: pointer;
    }
    :host ::ng-deep rect.abcref[data-type="note"] {
      cursor: ns-resize;
    }
    :host ::ng-deep rect.abcref:hover {
      fill-opacity: 0.12;
    }
    /* Highlighted abcref rect — red background behind note */
    :host ::ng-deep rect.abcref.highlight {
      fill-opacity: 0.3 !important;
    }
    /* Highlighted note group — color the note heads red */
    :host ::ng-deep g.highlight {
      opacity: 1;
    }
    :host ::ng-deep g.highlight path {
      fill: #d50000 !important;
    }
    /* Dragging feedback */
    :host ::ng-deep g.dragging {
      opacity: 0.7;
    }
  `],
})
export class TunePreviewComponent implements AfterViewChecked {
  @ViewChild('container') container!: ElementRef<HTMLDivElement>;

  svgContent = input('');
  noteClicked = output<{ startChar: number; endChar: number }>();
  noteDragged = output<NoteDragEvent>();

  private lastSvg = '';
  private boundHandlers = false;
  private drag: DragState | null = null;

  constructor(private sanitizer: DomSanitizer) {}

  sanitizedSvg(): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(this.svgContent());
  }

  ngAfterViewChecked(): void {
    const svg = this.svgContent();
    if (svg !== this.lastSvg) {
      this.lastSvg = svg;
      this.boundHandlers = false;
      this.drag = null;
    }
    if (!this.boundHandlers && this.container?.nativeElement) {
      this.bindHandlers();
      this.boundHandlers = true;
    }
  }

  /** Highlight notes in the ABC SVG by startChar/endChar range */
  highlightRange(startChar: number, endChar: number): void {
    if (!this.container?.nativeElement) return;
    const el = this.container.nativeElement;
    // Remove old highlights
    el.querySelectorAll('.highlight').forEach(e => e.classList.remove('highlight'));
    let firstHighlighted: Element | null = null;
    el.querySelectorAll('rect.abcref').forEach(rect => {
      const id = rect.id || '';
      const m = id.match(/_\w+_(\d+)_(\d+)_/);
      if (m) {
        const s = Number(m[1]);
        const e = Number(m[2]);
        if (endChar > s && startChar < e) {
          rect.classList.add('highlight');
          const g = el.querySelector(`g.${CSS.escape(id)}`);
          g?.classList.add('highlight');
          if (!firstHighlighted) firstHighlighted = rect;
        }
      }
    });
    if (firstHighlighted) {
      (firstHighlighted as Element).scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  /** Remove all highlights */
  clearHighlight(): void {
    this.container?.nativeElement?.querySelectorAll('.highlight')
      .forEach(el => el.classList.remove('highlight'));
  }

  private bindHandlers(): void {
    const el = this.container.nativeElement;

    el.addEventListener('mousedown', (ev: MouseEvent) => {
      const target = ev.target as Element;
      if (!target?.classList?.contains('abcref')) return;

      // Parse startChar/endChar from rect id
      const id = target.id || '';
      const m = id.match(/_\w+_(\d+)_(\d+)_/);
      if (!m) return;

      const startChar = Number(m[1]);
      const endChar = Number(m[2]);
      const isNote = target.getAttribute('data-type') === 'note';

      if (!isNote) {
        // Non-note: just emit click
        this.noteClicked.emit({ startChar, endChar });
        return;
      }

      // Find the enclosing SVG element
      const svg = target.closest('svg') as SVGSVGElement | null;
      if (!svg) return;

      // Convert screen coords to SVG coords
      const svgY = this.screenToSvgY(svg, ev.clientY);

      // Find the companion <g> wrapper for visual feedback
      const gElement = el.querySelector(`g.${CSS.escape(id)}`);

      this.drag = {
        startSvgY: svgY,
        startChar,
        endChar,
        gElement,
        svg,
        lastSteps: 0,
      };

      gElement?.classList.add('dragging');
      ev.preventDefault();
    });

    el.addEventListener('mousemove', (ev: MouseEvent) => {
      if (!this.drag) return;
      const currentY = this.screenToSvgY(this.drag.svg, ev.clientY);
      const deltaY = currentY - this.drag.startSvgY;
      // abc2svg Y increases downward, but pitch increases upward,
      // so negative deltaY = pitch up = positive delta
      const steps = -Math.round(deltaY / SVG_UNITS_PER_STEP);

      if (steps !== this.drag.lastSteps && this.drag.gElement) {
        // Visual feedback: translate the group
        const translateY = -steps * SVG_UNITS_PER_STEP;
        (this.drag.gElement as SVGGElement).setAttribute(
          'transform', `translate(0,${translateY})`
        );
        this.drag.lastSteps = steps;
      }
      ev.preventDefault();
    });

    const endDrag = (ev: MouseEvent) => {
      if (!this.drag) return;
      const { startChar, endChar, lastSteps, gElement } = this.drag;

      // Clean up visual feedback
      if (gElement) {
        gElement.classList.remove('dragging');
        (gElement as SVGGElement).removeAttribute('transform');
      }

      if (lastSteps !== 0) {
        this.noteDragged.emit({ startChar, endChar, pitchDelta: lastSteps });
      } else {
        // No movement: treat as click
        this.noteClicked.emit({ startChar, endChar });
      }

      this.drag = null;
    };

    el.addEventListener('mouseup', endDrag);
    el.addEventListener('mouseleave', (ev: MouseEvent) => {
      if (this.drag) {
        // Cancel drag on leave — restore original position
        if (this.drag.gElement) {
          this.drag.gElement.classList.remove('dragging');
          (this.drag.gElement as SVGGElement).removeAttribute('transform');
        }
        this.drag = null;
      }
    });
  }

  /** Convert screen Y coordinate to SVG coordinate space */
  private screenToSvgY(svg: SVGSVGElement, clientY: number): number {
    const pt = svg.createSVGPoint();
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (ctm) {
      const svgPt = pt.matrixTransform(ctm.inverse());
      return svgPt.y;
    }
    return clientY;
  }
}
