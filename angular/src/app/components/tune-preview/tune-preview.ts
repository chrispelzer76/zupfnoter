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
      :deep(.highlight rect.abcref) {
        fill: #ffd54f !important;
        fill-opacity: 0.5 !important;
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
    // Remove old highlights
    this.container.nativeElement.querySelectorAll('.highlight')
      .forEach(el => el.classList.remove('highlight'));
    // The abcref IDs encode startChar: _type_startChar_endChar_
    this.container.nativeElement.querySelectorAll('rect.abcref').forEach(rect => {
      const id = rect.id || rect.parentElement?.id || '';
      const m = id.match(/_\w+_(\d+)_(\d+)_/);
      if (m) {
        const s = Number(m[1]);
        const e = Number(m[2]);
        if (endChar > s && startChar < e) {
          rect.parentElement?.classList.add('highlight');
        }
      }
    });
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
