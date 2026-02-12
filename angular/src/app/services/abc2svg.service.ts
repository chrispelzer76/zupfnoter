/**
 * Angular service wrapping the abc2svg library.
 * Ported from opal-abc2svg.rb.
 *
 * abc2svg is loaded as a global script and accessed via window['Abc'].
 */
import { Injectable, signal } from '@angular/core';

export interface ParseError {
  message: string;
  line: number;
  col: number;
}

export interface AbcParseResult {
  /** The parsed tune object (internal abc2svg representation) */
  tune: any | null;
  /** SVG output of the music notation */
  svgOutput: string;
  /** The internal abc model (voices, symbols) for transformation */
  abcModel: {
    tsfirst: any;
    voiceTb: any;
    info: any;
  } | null;
  /** Pre-built player events from ToAudio (generated during parsing, like Ruby original) */
  playerEvents: any[] | null;
  /** Parse errors encountered */
  errors: ParseError[];
}

@Injectable({ providedIn: 'root' })
export class Abc2svgService {
  private abcClass: any = null;
  readonly loaded = signal(false);
  readonly errors = signal<ParseError[]>([]);

  constructor() {
    this.initAbc2svg();
  }

  /** Check if abc2svg is available as a global */
  private initAbc2svg(): void {
    if (typeof (window as any)['Abc'] !== 'undefined') {
      this.abcClass = (window as any)['Abc'];
      this.loaded.set(true);
    }
  }

  /** Ensure the library is loaded (call after dynamic script load) */
  ensureLoaded(): boolean {
    if (!this.abcClass) {
      this.initAbc2svg();
    }
    return this.loaded();
  }

  /**
   * Parse ABC text and return the internal model + SVG.
   *
   * @param abcText  The raw ABC notation string
   * @returns ParseResult with tune, SVG, model, and errors
   */
  parse(abcText: string): AbcParseResult {
    if (!this.ensureLoaded()) {
      return {
        tune: null,
        svgOutput: '',
        abcModel: null,
        playerEvents: null,
        errors: [{ message: 'abc2svg not loaded', line: 0, col: 0 }],
      };
    }

    const errors: ParseError[] = [];
    let svgParts: string[] = [];
    let abcModel: AbcParseResult['abcModel'] = null;
    let playerEvents: any[] | null = null;

    const user: any = {
      img_out: (svg: string) => {
        svgParts.push(svg);
      },
      errmsg: (message: string, line: number, col: number) => {
        errors.push({ message, line, col });
      },
      get_abcmodel: (tsfirst: any, voiceTb: any, _annoType: any, info: any) => {
        // Compute MIDI pitches on note objects (required before transformation)
        const AbcMIDI = (window as any)['AbcMIDI'];
        if (AbcMIDI) {
          const midi = new AbcMIDI();
          midi.add(tsfirst, voiceTb);
        }

        // Build player events NOW, during parsing (like Ruby's _callback_get_abcmodel).
        // ToAudio.add() destructively modifies repeat bars, so it must run exactly once.
        const ToAudioClass = (window as any)['ToAudio'];
        if (ToAudioClass) {
          const toAudio = new ToAudioClass();
          toAudio.add(tsfirst, voiceTb);
          playerEvents = toAudio.clear();
        }

        abcModel = { tsfirst, voiceTb, info };
      },
    };

    try {
      const abc = new this.abcClass(user);
      abc.tosvg('zupfnoter', abcText);
      const tunes = abc.get_tunes?.() ?? [];

      this.errors.set(errors);

      return {
        tune: tunes.length > 0 ? tunes[0] : null,
        svgOutput: svgParts.join(''),
        abcModel,
        playerEvents,
        errors,
      };
    } catch (e: any) {
      errors.push({ message: e.message ?? String(e), line: 0, col: 0 });
      this.errors.set(errors);
      return { tune: null, svgOutput: '', abcModel: null, playerEvents: null, errors };
    }
  }

  /**
   * Render ABC text directly to SVG (for tune preview).
   *
   * @param abcText  The raw ABC notation string
   * @returns SVG markup string
   */
  renderToSvg(abcText: string): string {
    const result = this.parse(abcText);
    return result.svgOutput;
  }
}
