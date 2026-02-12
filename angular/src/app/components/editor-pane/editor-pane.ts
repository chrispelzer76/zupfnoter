import {
  Component,
  ElementRef,
  AfterViewInit,
  OnDestroy,
  ViewChild,
  input,
  output,
  effect,
} from '@angular/core';
import * as ace from 'ace-builds';

@Component({
  selector: 'app-editor-pane',
  standalone: true,
  template: `<div #editorContainer class="editor-container"></div>`,
  styles: [`
    :host { display: block; height: 100%; }
    .editor-container { width: 100%; height: 100%; }
  `],
})
export class EditorPaneComponent implements AfterViewInit, OnDestroy {
  @ViewChild('editorContainer', { static: true }) editorContainer!: ElementRef;

  initialText = input('');
  textChanged = output<string>();
  selectionChanged = output<{ start: number; end: number }>();

  private editor!: ace.Ace.Editor;
  private suppressChange = false;

  constructor() {
    // React to external text changes
    effect(() => {
      const text = this.initialText();
      if (this.editor && text !== this.editor.getValue()) {
        this.suppressChange = true;
        this.editor.setValue(text, -1);
        this.suppressChange = false;
      }
    });
  }

  ngAfterViewInit(): void {
    // Configure ace base path to use npm package
    ace.config.set('basePath', 'https://cdn.jsdelivr.net/npm/ace-builds@1.36.5/src-noconflict');

    this.editor = ace.edit(this.editorContainer.nativeElement, {
      mode: 'ace/mode/text',
      theme: 'ace/theme/chrome',
      fontSize: 14,
      showPrintMargin: false,
      wrap: true,
      tabSize: 2,
      useSoftTabs: true,
    });

    // Try to load custom ABC mode
    try {
      this.editor.session.setMode('ace/mode/abc');
    } catch {
      // fallback to text mode
    }

    // Emit text changes (debounced)
    let debounceTimer: any;
    this.editor.on('change', () => {
      if (this.suppressChange) return;
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        this.textChanged.emit(this.editor.getValue());
      }, 300);
    });

    // Emit selection changes
    this.editor.selection.on('changeSelection', () => {
      const range = this.editor.selection.getRange();
      const doc = this.editor.session.getDocument();
      const start = doc.positionToIndex(range.start);
      const end = doc.positionToIndex(range.end);
      this.selectionChanged.emit({ start, end });
    });

    // Set initial text
    if (this.initialText()) {
      this.suppressChange = true;
      this.editor.setValue(this.initialText(), -1);
      this.suppressChange = false;
    }
  }

  ngOnDestroy(): void {
    this.editor?.destroy();
  }

  /** Get current editor content */
  getText(): string {
    return this.editor?.getValue() ?? '';
  }

  /** Set cursor to a specific character offset */
  setCursorAtOffset(offset: number): void {
    if (!this.editor) return;
    const pos = this.editor.session.getDocument().indexToPosition(offset, 0);
    this.editor.moveCursorToPosition(pos);
    this.editor.selection.clearSelection();
    this.editor.scrollToLine(pos.row, true, true, () => {});
  }

  /** Highlight a character range in the editor */
  highlightRange(startOffset: number, endOffset: number): void {
    if (!this.editor) return;
    const doc = this.editor.session.getDocument();
    const start = doc.indexToPosition(startOffset, 0);
    const end = doc.indexToPosition(endOffset, 0);
    const range = new ace.Range(start.row, start.column, end.row, end.column);
    this.editor.selection.setRange(range);
    this.editor.scrollToLine(start.row, true, true, () => {});
  }

  /** Set error/warning annotations in the gutter */
  setAnnotations(annotations: ace.Ace.Annotation[]): void {
    this.editor?.session.setAnnotations(annotations);
  }
}
