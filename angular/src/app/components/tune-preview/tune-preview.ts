import { Component, input, output, ElementRef, ViewChild, AfterViewChecked } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

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
      :deep(svg) {
        max-width: 100%;
        height: auto;
      }
      /* abcref rects: transparent by default, clickable */
      :deep(rect.abcref) {
        fill: #ffd54f;
        fill-opacity: 0;
        cursor: pointer;
      }
      :deep(rect.abcref:hover) {
        fill-opacity: 0.15;
      }
      /* Highlighted abcref rect */
      :deep(rect.abcref.highlight) {
        fill-opacity: 0.5 !important;
      }
      /* Highlighted note group — color the note heads */
      :deep(g.highlight) {
        opacity: 1;
      }
      :deep(g.highlight path) {
        fill: #e65100 !important;
      }
    }
  `],
})
export class TunePreviewComponent implements AfterViewChecked {
  @ViewChild('container') container!: ElementRef<HTMLDivElement>;

  svgContent = input('');
  noteClicked = output<{ startChar: number; endChar: number }>();

  private lastSvg = '';
  private boundClick = false;

  constructor(private sanitizer: DomSanitizer) {}

  sanitizedSvg(): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(this.svgContent());
  }

  ngAfterViewChecked(): void {
    const svg = this.svgContent();
    if (svg !== this.lastSvg) {
      this.lastSvg = svg;
      this.boundClick = false;
    }
    if (!this.boundClick && this.container?.nativeElement) {
      this.bindClickHandlers();
      this.boundClick = true;
    }
  }

  /** Highlight notes in the ABC SVG by startChar/endChar range */
  highlightRange(startChar: number, endChar: number): void {
    if (!this.container?.nativeElement) return;
    const el = this.container.nativeElement;
    // Remove old highlights
    el.querySelectorAll('.highlight').forEach(e => e.classList.remove('highlight'));
    let firstHighlighted: Element | null = null;
    // abcref rects have id="_type_startChar_endChar_" and the corresponding
    // <g> wrapper has the same string as a class. Highlight both.
    el.querySelectorAll('rect.abcref').forEach(rect => {
      const id = rect.id || '';
      const m = id.match(/_\w+_(\d+)_(\d+)_/);
      if (m) {
        const s = Number(m[1]);
        const e = Number(m[2]);
        if (endChar > s && startChar < e) {
          // Highlight the rect itself
          rect.classList.add('highlight');
          // Also highlight the companion <g> that has the same class as the rect's ID
          const g = el.querySelector(`g.${CSS.escape(id)}`);
          g?.classList.add('highlight');
          if (!firstHighlighted) firstHighlighted = rect;
        }
      }
    });
    // Auto-scroll to the first highlighted element
    if (firstHighlighted) {
      (firstHighlighted as Element).scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  /** Remove all highlights */
  clearHighlight(): void {
    this.container?.nativeElement?.querySelectorAll('.highlight')
      .forEach(el => el.classList.remove('highlight'));
  }

  private bindClickHandlers(): void {
    const el = this.container.nativeElement;
    // Delegate click on abcref rects
    el.addEventListener('click', (ev: MouseEvent) => {
      const target = ev.target as Element;
      if (!target?.classList?.contains('abcref')) return;
      const id = target.id || '';
      const m = id.match(/_\w+_(\d+)_(\d+)_/);
      if (m) {
        this.noteClicked.emit({
          startChar: Number(m[1]),
          endChar: Number(m[2]),
        });
      }
    });
  }
}
