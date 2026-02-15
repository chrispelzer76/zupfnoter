import { Component, signal, computed, OnInit, OnDestroy, ViewChild } from '@angular/core';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { Subscription } from 'rxjs';
import { EditorPaneComponent } from '../editor-pane/editor-pane';
import { HarpnotePreviewComponent } from '../harpnote-preview/harpnote-preview';
import { TunePreviewComponent } from '../tune-preview/tune-preview';
import { ToolbarComponent } from '../toolbar/toolbar';
import { ConfigEditorComponent } from '../config-editor/config-editor';
import { ConfstackService } from '../../services/confstack.service';
import { Abc2svgService, AbcParseResult } from '../../services/abc2svg.service';
import { AbcToHarpnotesService } from '../../services/abc-to-harpnotes.service';
import { LayoutService } from '../../services/layout.service';
import { PdfEngineService } from '../../services/pdf-engine.service';
import { PlayerService } from '../../services/player.service';
import { I18nService } from '../../services/i18n.service';
import { createDefaultConf, CONFIG_SEPARATOR } from '../../services/init-conf';
import { Song } from '../../models/song';
import { Sheet } from '../../models/drawing';

export type ViewPerspective = 'all' | 'editor' | 'harp';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [
    MatToolbarModule, MatButtonModule, MatIconModule, MatSidenavModule,
    MatButtonToggleModule, MatMenuModule, MatTooltipModule, MatSnackBarModule,
    EditorPaneComponent, HarpnotePreviewComponent, TunePreviewComponent,
    ToolbarComponent, ConfigEditorComponent,
  ],
  templateUrl: './app-shell.html',
  styleUrl: './app-shell.scss',
})
export class AppShellComponent implements OnInit, OnDestroy {
  @ViewChild(EditorPaneComponent) editorPane!: EditorPaneComponent;
  @ViewChild(TunePreviewComponent) tunePreview!: TunePreviewComponent;
  @ViewChild(HarpnotePreviewComponent) harpPreview!: HarpnotePreviewComponent;

  // --- State signals ---
  currentAbcText = signal('');
  currentSong = signal<Song | null>(null);
  currentSheet = signal<Sheet | null>(null);
  currentExtract = signal(0);
  tuneSvg = signal('');
  viewPerspective = signal<ViewPerspective>('all');
  configOpen = signal(false);
  statusMessage = signal('Ready');
  isPlaying = signal(false);

  // --- Last parse result for playback ---
  private lastParseResult: AbcParseResult | null = null;
  private subscriptions: Subscription[] = [];

  // --- Computed ---
  showEditor = computed(() => this.viewPerspective() !== 'harp');
  showHarp = computed(() => this.viewPerspective() !== 'editor');

  constructor(
    private conf: ConfstackService,
    private abc2svg: Abc2svgService,
    private abcToHarpnotes: AbcToHarpnotesService,
    private layoutService: LayoutService,
    private pdfEngine: PdfEngineService,
    private playerService: PlayerService,
    private i18n: I18nService,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    // Initialise configuration stack with defaults
    this.conf.init('zupfnoter');
    this.conf.push(createDefaultConf());

    // Load i18n
    this.i18n.loadLocale('de');

    // Subscribe to player song-end to reset UI
    this.subscriptions.push(
      this.playerService.songEnd$.subscribe(() => {
        this.isPlaying.set(false);
        this.statusMessage.set('Playback finished');
      })
    );

    // Subscribe to player note-on for live highlighting during playback
    this.subscriptions.push(
      this.playerService.noteOn$.subscribe(event => {
        this.onNoteHighlight(event.index);
      })
    );

    // Load a demo file as initial content
    this.loadDemoFile();
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(s => s.unsubscribe());
    this.playerService.stop();
  }

  /** Triggered when editor content changes */
  onAbcTextChange(text: string): void {
    this.currentAbcText.set(text);
  }

  /** Render the current ABC text through the full pipeline */
  onRender(): void {
    const text = this.currentAbcText();
    if (!text.trim()) {
      this.statusMessage.set('No ABC text to render');
      return;
    }

    try {
      // Step 1: Parse ABC → SVG for tune preview
      const parseResult = this.abc2svg.parse(text);
      this.tuneSvg.set(parseResult.svgOutput);

      // Step 2: ABC → Harpnotes Music Model
      // ToAudio now runs inside get_abcmodel callback (like Ruby original),
      // so playerEvents are already available in parseResult.
      const [song, checksum] = this.abcToHarpnotes.transform(text);
      this.currentSong.set(song);
      this.lastParseResult = parseResult;

      // Debug: log song details
      console.log('Song voices:', song.voices.length);
      for (let i = 0; i < song.voices.length; i++) {
        const v = song.voices[i];
        const playables = v.entities.filter((e: any) => e.beat !== undefined);
        console.log(`  Voice ${i}: ${v.entities.length} entities, ${playables.length} playables`);
        if (playables.length > 0) {
          const first = playables[0] as any;
          console.log(`    First: pitch=${first.pitch}, beat=${first.beat}, time=${first.time}, duration=${first.duration}`);
        }
      }
      console.log('Last beat:', song.lastBeat());
      console.log('Beat maps count:', song.beatMaps.length);
      if (parseResult.playerEvents) {
        console.log('Player events:', parseResult.playerEvents.length);
      }

      // Step 3: Layout Song → Drawing Sheet
      const extractIdx = this.currentExtract();
      const sheet = this.layoutService.layout(song, extractIdx);
      this.currentSheet.set(sheet);

      // Debug: log sheet details
      const types: Record<string, number> = {};
      const visTypes: Record<string, number> = {};
      let maxY = 0, minY = Infinity;
      let visMaxY = 0, visMinY = Infinity;
      for (const d of sheet.children) {
        types[d.type] = (types[d.type] ?? 0) + 1;
        if (d.visible) visTypes[d.type] = (visTypes[d.type] ?? 0) + 1;
        const c = (d as any).center;
        if (c) {
          if (c[1] > maxY) maxY = c[1];
          if (c[1] < minY) minY = c[1];
          if (d.visible) {
            if (c[1] > visMaxY) visMaxY = c[1];
            if (c[1] < visMinY) visMinY = c[1];
          }
        }
      }
      console.log('Sheet drawables (all):', types);
      console.log('Sheet drawables (visible):', visTypes);
      console.log('  Y range (all):', minY.toFixed(1), '→', maxY.toFixed(1));
      console.log('  Y range (visible):', visMinY.toFixed(1), '→', visMaxY.toFixed(1));
      const ellipses = sheet.children.filter(d => d.type === 'ellipse' && d.visible) as any[];
      if (ellipses.length > 0) {
        console.log('  First visible ellipse:', ellipses[0].center);
        console.log('  Last visible ellipse:', ellipses[ellipses.length - 1].center);
        // Log Y distribution to see where notes cluster
        const yValues = ellipses.map((e: any) => e.center[1]).sort((a: number, b: number) => a - b);
        const quartile = Math.floor(yValues.length / 4);
        console.log(`  Y quartiles: Q1=${yValues[quartile]?.toFixed(1)} Q2=${yValues[2*quartile]?.toFixed(1)} Q3=${yValues[3*quartile]?.toFixed(1)} max=${yValues[yValues.length-1]?.toFixed(1)}`);
      }

      if (parseResult.errors.length > 0) {
        this.statusMessage.set(`Rendered with ${parseResult.errors.length} warning(s)`);
      } else {
        this.statusMessage.set(`Rendered: ${song.voices.length} voice(s), ${sheet.children.length} drawable(s)`);
      }
    } catch (e: any) {
      console.error('Render error:', e);
      this.statusMessage.set(`Error: ${e.message}`);
      this.snackBar.open(`Render error: ${e.message}`, 'OK', { duration: 5000 });
    }
  }

  onExtractChange(extract: number): void {
    this.currentExtract.set(extract);
    if (this.currentSong()) {
      this.onRender();
    }
  }

  onViewChange(perspective: ViewPerspective): void {
    this.viewPerspective.set(perspective);
  }

  onToggleConfig(): void {
    this.configOpen.update(v => !v);
  }

  onPlay(): void {
    const events = this.lastParseResult?.playerEvents;
    if (!events || events.length === 0) {
      this.statusMessage.set('Render first before playing');
      return;
    }
    try {
      this.playerService.playEvents(events);
      this.isPlaying.set(true);
      this.statusMessage.set('Playing...');
    } catch (e: any) {
      console.error('Play error:', e);
      this.statusMessage.set(`Play error: ${e.message}`);
    }
  }

  onStop(): void {
    this.playerService.stop();
    this.isPlaying.set(false);
    this.statusMessage.set('Stopped');
    this.tunePreview?.clearHighlight();
    this.harpPreview?.clearHighlight();
  }

  onSpeedChange(speed: number): void {
    this.playerService.setSpeed(speed);
    this.statusMessage.set(`Speed: ${speed}x`);
  }

  /** Cross-highlight: a note was clicked in tune or harpnote panel */
  onNoteClicked(origin: { startChar: number; endChar: number }): void {
    // Highlight in editor
    this.editorPane?.highlightRange(origin.startChar, origin.endChar);
    // Highlight in tune preview
    this.tunePreview?.highlightRange(origin.startChar, origin.endChar);
    // Highlight in harpnote preview
    this.harpPreview?.highlightRange(origin.startChar, origin.endChar);
  }

  /** Cross-highlight: cursor/selection changed in the ABC editor */
  onEditorSelectionChange(sel: { start: number; end: number }): void {
    if (sel.start === sel.end) {
      // Single cursor position — find the note at that position
      this.tunePreview?.highlightRange(sel.start, sel.start + 1);
      this.harpPreview?.highlightRange(sel.start, sel.start + 1);
    } else {
      // Range selection — highlight all matching notes
      this.tunePreview?.highlightRange(sel.start, sel.end);
      this.harpPreview?.highlightRange(sel.start, sel.end);
    }
  }

  /** Highlight a note during playback (from onnote callback: index = startChar) */
  private onNoteHighlight(startChar: number): void {
    // Use a small range for single-note highlighting
    this.tunePreview?.highlightRange(startChar, startChar + 1);
    this.harpPreview?.highlightRange(startChar, startChar + 1);
  }

  onPrintA3(): void {
    const sheet = this.currentSheet();
    if (!sheet) {
      this.statusMessage.set('Render first before printing');
      return;
    }
    try {
      this.pdfEngine.drawA3(sheet);
      this.statusMessage.set('PDF A3 exported');
    } catch (e: any) {
      this.statusMessage.set(`PDF error: ${e.message}`);
    }
  }

  onPrintA4(): void {
    const sheet = this.currentSheet();
    if (!sheet) {
      this.statusMessage.set('Render first before printing');
      return;
    }
    try {
      this.pdfEngine.drawA4(sheet);
      this.statusMessage.set('PDF A4 exported');
    } catch (e: any) {
      this.statusMessage.set(`PDF error: ${e.message}`);
    }
  }

  private async loadDemoFile(): Promise<void> {
    try {
      const res = await fetch('assets/demos/zndemo_42_Ich_steh_an_deiner_krippen_hier.abc');
      if (res.ok) {
        let text = await res.text();
        // Strip the %%%%zupfnoter.config section — it's not ABC notation
        const sepIdx = text.indexOf(CONFIG_SEPARATOR);
        if (sepIdx >= 0) {
          text = text.substring(0, sepIdx).trimEnd();
        }
        this.currentAbcText.set(text);
      }
    } catch {
      // Demo not available; start with empty editor
    }
  }
}
