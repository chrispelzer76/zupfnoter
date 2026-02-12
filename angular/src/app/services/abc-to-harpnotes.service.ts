/**
 * ABC → Harpnotes transformation service.
 * Ported from abc2svg_to_harpnotes.rb (41 KB).
 *
 * Transforms the internal abc2svg model into Harpnotes Music model (Song).
 */
import { Injectable } from '@angular/core';
import { ConfstackService } from './confstack.service';
import { Abc2svgService, AbcParseResult } from './abc2svg.service';
import {
  MusicEntity, Playable, Note, SynchPoint, Pause,
  MeasureStart, NewPart, NoteBoundAnnotation, Goto,
  Origin, GotoPolicy,
} from '../models/music-entity';
import { Song, Voice, BeatMap } from '../models/song';

/** abc2svg uses 1536 time units per whole note */
const ABC2SVG_DURATION_FACTOR = 1536;

// ---------------------------------------------------------------------------
// State held per voice transformation
// ---------------------------------------------------------------------------
interface NextNoteMarks {
  measure: boolean;
  repeatStart: boolean;
  firstInPart: boolean;
  variantEnding: { text: string } | null;
  variantFollowup: boolean;
}

interface VariantEndingEntry {
  rbstart?: Playable;
  rbstop?: Playable;
  distance?: number[];
  repeatEnd?: boolean;
  isFollowup?: boolean;
}

@Injectable({ providedIn: 'root' })
export class AbcToHarpnotesService {

  // ---- per-transform state ----
  private abcCode = '';
  private abcModel: any = null;
  private annotations: Record<string, any> = {};
  private metaData: Record<string, any> = {};
  private infoFields: Record<string, string> = {};

  // ---- per-voice state ----
  private countNames: (number | string)[] = [];
  private jumpTargets: Record<string, Playable> = {};
  private isFirstMeasure = true;
  private measureStartTime = 0;
  private measureCount = 0;
  private nextNoteMarks!: NextNoteMarks;
  private previousNote: Playable | null = null;
  private repetitionStack: Playable[] = [];
  private variantEndings: VariantEndingEntry[][] = [];
  private variantNo = 0;
  private tieStarted = false;
  private slurStack = 0;
  private tupletP = 1;
  private countBy: number | null = null;
  private wMeasure = 0;
  private pitchProviders: any[] = [];
  private shortestNote = 64;
  private partTable: Record<number, string> = {};
  private remarkTable: Record<number, string> = {};

  constructor(
    private conf: ConfstackService,
    private abc2svgService: Abc2svgService
  ) {}

  // =========================================================================
  // PUBLIC API
  // =========================================================================

  /**
   * Main entry point: transforms ABC text to a Song.
   * @returns [Song, playerModelAbc] tuple
   */
  transform(abcText: string): [Song, string] {
    this.abcCode = abcText;
    this.annotations = this.conf.get('annotations') ?? {};
    this.shortestNote = this.conf.get('layout.SHORTEST_NOTE') ?? 64;

    // Parse via abc2svg
    const parseResult = this.abc2svgService.parse(abcText);
    if (!parseResult.abcModel) {
      throw new Error('No suitable ABC found');
    }
    this.abcModel = parseResult.abcModel;

    // Extract metadata
    this.infoFields = this.getMetadata(abcText);
    this.makeMetadata();

    // Build part table from abc model
    this.buildPartTable();

    // Transform all voices
    const song = this.transformVoices();
    song.metaData = this.metaData as any;

    return [song, ''];
  }

  // =========================================================================
  // VOICE TRANSFORMATION
  // =========================================================================

  private transformVoices(): Song {
    const voiceTb = this.abcModel.voiceTb ?? [];
    const tsfirst = this.abcModel.tsfirst;

    // Group symbols by voice
    const voiceSymbols = this.groupSymbolsByVoice(tsfirst, voiceTb.length);

    const hnVoices: Voice[] = voiceSymbols.map((symbols, voiceIndex) => {
      const voiceId = `v_${voiceIndex + 1}`;
      const voice = new Voice();
      voice.index = voiceIndex + 1;
      voice.name = voiceTb[voiceIndex]?.nm ?? voiceId;

      const entities = this.transformVoice(symbols, voiceId, voiceTb[voiceIndex]);
      for (const e of entities) {
        voice.push(e);
      }

      // Add variant ending jumps
      const jumps = this.makeVariantEndingJumps(voiceId);
      for (const j of jumps) {
        voice.push(j);
      }

      return voice;
    });

    // Duplicate first voice at index 0 (voice indexing starts at 1)
    if (hnVoices.length > 0) {
      const v0 = new Voice();
      v0.index = 0;
      v0.name = hnVoices[0].name;
      for (const e of hnVoices[0].entities) v0.push(e);
      hnVoices.unshift(v0);
    }

    return new Song(hnVoices);
  }

  /** Group the linked-list of symbols into per-voice arrays */
  private groupSymbolsByVoice(tsfirst: any, voiceCount: number): any[][] {
    const groups: any[][] = Array.from({ length: voiceCount }, () => []);
    let sym = tsfirst;
    while (sym) {
      const v = sym.v ?? 0;
      if (v < voiceCount) {
        groups[v].push(sym);
      }
      sym = sym.ts_next;
    }
    return groups;
  }

  private transformVoice(symbols: any[], voiceId: string, voiceProps: any): MusicEntity[] {
    this.resetState();

    // Extract meter info
    const meter = voiceProps?.meter;
    if (meter) {
      this.wMeasure = meter.wmeasure ?? 1536;
      try {
        this.countBy = meter.a_meter?.[0]?.bot ?? null;
        if (typeof this.countBy === 'string') this.countBy = parseInt(this.countBy, 10);
      } catch {
        this.countBy = null;
      }
    }

    // Cache pitch providers (note symbols) for rest positioning
    this.pitchProviders = symbols.filter(s => this.isNoteSymbol(s));

    // Add source position info
    symbols.forEach(s => {
      s.start_pos = this.charPosToLineColumn(s.istart ?? 0);
      s.end_pos = this.charPosToLineColumn(s.iend ?? 0);
    });

    // Investigate first bar for measure numbering
    this.investigateFirstBar(symbols);

    // Transform each symbol
    let result: MusicEntity[] = [];
    for (let index = 0; index < symbols.length; index++) {
      const sym = symbols[index];
      const entities = this.transformSymbol(sym, index, voiceId);
      if (entities) {
        result.push(...entities);
      }
    }

    // Post-processing: jumplines and notebound annotations
    const jumplines: MusicEntity[] = [];
    const annotations: MusicEntity[] = [];
    for (const entity of result) {
      jumplines.push(...this.makeJumplines(entity, voiceId));
      annotations.push(...this.makeNoteboundAnnotations(entity, voiceId));
    }

    result = [...result, ...jumplines, ...annotations];
    return result;
  }

  // =========================================================================
  // SYMBOL DISPATCH
  // =========================================================================

  private transformSymbol(sym: any, index: number, voiceId: string): MusicEntity[] | null {
    const type = sym.type;
    // abc2svg symbol types (from the C constants)
    // NOTE=8, REST=9, BAR=0, METER=6, KEY=5, TEMPO=14, PART=10, etc.
    try {
      switch (type) {
        case 8: // NOTE
          return this.transformNote(sym, index, voiceId);
        case 9: // REST
          return this.transformRest(sym, index, voiceId);
        case 0: // BAR
          return this.transformBar(sym, index, voiceId);
        case 6: // METER
        case 5: // KEY
        case 14: // TEMPO
        case 10: // PART
        case 11: // STAVES
        case 13: // STBRK
        case 15: // BLOCK
        case 16: // REMARK
          return null; // Handled implicitly or not needed
        default:
          return null;
      }
    } catch (e: any) {
      console.error(`Transform error for symbol type ${type}:`, e.message, sym.start_pos);
      return null;
    }
  }

  // =========================================================================
  // NOTE TRANSFORMATION
  // =========================================================================

  private transformNote(sym: any, index: number, voiceId: string): MusicEntity[] {
    const origin = this.parseOrigin(sym);
    const { tuplet, tupletStart, tupletEnd } = this.parseTupletInfo(sym);
    const decorations = this.parseDecorations(sym);

    this.transformMeasureStart(sym);

    const notesData = sym.notes ?? [];
    if (notesData.length === 0) return [];

    const duration = this.convertDuration(notesData[0].dur ?? sym.dur ?? 0);

    const notes: Note[] = notesData.map((nd: any) => {
      const note = new Note(nd.midi ?? 60, duration);
      note.decorations = decorations;
      note.measureCount = this.measureCount;
      note.countNote = this.transformCountNote(sym);
      note.time = sym.time ?? 0;
      note.znid = this.mkZnid(sym);
      note.origin = origin;
      note.startPos = this.charPosToLineColumn(sym.istart ?? 0);
      note.endPos = this.charPosToLineColumn(sym.iend ?? 0);
      note.tuplet = tuplet;
      note.tupletStart = tupletStart;
      note.tupletEnd = tupletEnd;
      note.variant = this.variantNo > 0 ? this.variantNo : null;
      return note;
    });

    let result: MusicEntity[];
    let playable: Playable;

    if (notes.length === 1) {
      playable = notes[0];
      result = [notes[0]];
    } else {
      const sp = new SynchPoint(notes);
      sp.znid = this.mkZnid(sym);
      sp.time = sym.time ?? 0;
      sp.origin = origin;
      sp.startPos = notes[0].startPos;
      sp.endPos = notes[0].endPos;
      sp.tuplet = tuplet;
      sp.tupletStart = tupletStart;
      sp.tupletEnd = tupletEnd;
      sp.decorations = decorations;
      sp.measureCount = this.measureCount;
      sp.countNote = this.transformCountNote(sym);
      playable = sp;
      result = [sp];
    }

    // Init repetition stack
    if (this.repetitionStack.length === 0) {
      this.repetitionStack.push(playable);
    }

    // Ties
    playable.tieEnd = this.tieStarted;
    this.tieStarted = this.hasTie(sym);
    playable.tieStart = this.tieStarted;

    // Slurs
    playable.slurStarts = this.parseSlur(sym.slur_start).map(() => this.pushSlur());
    const slurEndCount = sym.slur_end ?? 0;
    playable.slurEnds = Array.from({ length: slurEndCount }, () => this.popSlur());

    // Measure start mark
    if (this.nextNoteMarks.measure) {
      notes.forEach(n => (n.measureStart = true));
      if (playable instanceof SynchPoint) playable.measureStart = true;
      this.nextNoteMarks.measure = false;
    }

    // Repeats, jumps, annotations
    this.makeRepeatsJumpsAnnotations(result, sym, voiceId);

    return result;
  }

  // =========================================================================
  // REST TRANSFORMATION
  // =========================================================================

  private transformRest(sym: any, index: number, voiceId: string): MusicEntity[] {
    const origin = this.parseOrigin(sym);
    const { tuplet, tupletStart, tupletEnd } = this.parseTupletInfo(sym);
    const decorations = this.parseDecorations(sym);

    // Determine rest pitch from surrounding notes
    const pitch = this.determineRestPitch(index);

    this.transformMeasureStart(sym);
    const notesData = sym.notes ?? [{ dur: sym.dur ?? 0 }];
    const duration = this.convertDuration(notesData[0]?.dur ?? sym.dur ?? 0);

    const rest = new Pause(pitch, duration);
    rest.measureCount = this.measureCount;
    rest.decorations = decorations;
    rest.countNote = this.transformCountNote(sym);
    rest.znid = this.mkZnid(sym);
    rest.time = sym.time ?? 0;
    rest.origin = origin;
    rest.startPos = this.charPosToLineColumn(sym.istart ?? 0);
    rest.endPos = this.charPosToLineColumn(sym.iend ?? 0);
    rest.variant = this.variantNo > 0 ? this.variantNo : null;
    rest.tuplet = tuplet;
    rest.tupletStart = tupletStart;
    rest.tupletEnd = tupletEnd;

    if (sym.invis) rest.visible = false;

    if (this.repetitionStack.length === 0) {
      this.repetitionStack.push(rest);
    }

    const result: MusicEntity[] = [rest];

    if (this.nextNoteMarks.measure) {
      rest.measureStart = true;
      this.nextNoteMarks.measure = false;
    }

    this.makeRepeatsJumpsAnnotations(result, sym, voiceId);
    return result;
  }

  /** Determine rest pitch from surrounding notes */
  private determineRestPitch(index: number): number {
    const before = this.pitchProviders.slice(0, index + 1).filter(Boolean);
    const after = this.pitchProviders.slice(index).filter(Boolean);

    const prevNote = before.length > 0 ? before[before.length - 1] : null;
    const nextNote = after.length > 0 ? after[0] : null;

    const restPos = this.conf.get('restposition.default') ?? 'center';
    let candidates: any[] = [];

    if (restPos === 'previous') {
      candidates = [prevNote ?? nextNote].filter(Boolean);
    } else if (restPos === 'next') {
      candidates = [nextNote ?? prevNote].filter(Boolean);
    } else {
      candidates = [prevNote, nextNote].filter(Boolean);
    }

    if (candidates.length === 0) return 60; // Middle C fallback

    const pitches = candidates.map(c => {
      const notes = c.notes ?? [];
      if (notes.length > 0) return notes[notes.length - 1].midi ?? 60;
      return 60;
    });

    return Math.floor(pitches.reduce((a: number, b: number) => a + b, 0) / pitches.length);
  }

  // =========================================================================
  // BAR TRANSFORMATION
  // =========================================================================

  private transformBar(sym: any, index: number, voiceId: string): MusicEntity[] {
    const result: MusicEntity[] = [];
    const barType: string = sym.bar_type ?? '';

    // Visible measure mark (not for volta brackets)
    if (!sym.invisible && !/^\:?[\[\]]+$/.test(barType)) {
      this.nextNoteMarks.measure = true;
    }

    // Repeat start
    if (/^.*:$/.test(barType)) {
      this.nextNoteMarks.repeatStart = true;
    }

    // Variant bracket start (rbstart=2)
    if (sym.rbstart === 2) {
      this.variantNo += 1;
      const text = sym.text ?? `${this.variantNo}`;
      this.nextNoteMarks.variantEnding = { text };
    }

    // Variant bracket end processing
    if (sym.rbstart === 2 && this.variantEndings.length > 0 &&
        this.variantEndings[this.variantEndings.length - 1].length === 0) {
      const distance = this.extractGotoDistance(sym);
      this.variantEndings[this.variantEndings.length - 1].push({
        rbstop: this.previousNote ?? undefined,
        distance,
      });
    }

    if (sym.rbstop === 2 && this.variantEndings.length > 0) {
      const lastGroup = this.variantEndings[this.variantEndings.length - 1];
      if (lastGroup.length > 0 && lastGroup[lastGroup.length - 1]?.rbstart) {
        lastGroup[lastGroup.length - 1].rbstop = this.previousNote ?? undefined;
        if (this.barIsRepetitionEnd(barType)) {
          lastGroup[lastGroup.length - 1].repeatEnd = true;
          this.repetitionStack.push(this.repetitionStack[this.repetitionStack.length - 1]);
        }

        // Not starting a new variant? Close the group
        if (sym.rbstart !== 2) {
          this.nextNoteMarks.variantFollowup = true;
          this.variantEndings.push([]);
          this.variantNo = 0;
        }
      }
    }

    // Repeat end → create Goto
    if (this.barIsRepetitionEnd(barType)) {
      result.push(...this.transformBarRepeatEnd(sym, voiceId));
    }

    this.isFirstMeasure = false;
    return result;
  }

  private barIsRepetitionEnd(barType: string): boolean {
    return /^:.*$/.test(barType);
  }

  private transformBarRepeatEnd(sym: any, voiceId: string): MusicEntity[] {
    if (!this.previousNote) return [];

    const level = this.repetitionStack.length;
    let start: Playable;
    if (level <= 1) {
      start = this.repetitionStack[this.repetitionStack.length - 1];
    } else {
      start = this.repetitionStack.pop()!;
    }

    const distance = this.extractGotoDistance(sym);
    const dist = distance.length > 0 ? distance[0] : 2;

    // Adjust rest pitch at repeat end
    const restPosEnd = this.conf.get('restposition.repeatend');
    if (this.previousNote instanceof Pause && restPosEnd === 'previous' && this.previousNote.prevPitch != null) {
      (this.previousNote as any)._pitch = this.previousNote.prevPitch;
    }

    this.nextNoteMarks.firstInPart = true;
    const confKey = `notebound.c_jumplines.${voiceId}.${this.previousNote.znid}.p_repeat`;

    return [new Goto(this.previousNote, start, {
      distance: dist,
      isRepeat: true,
      level,
      confKey,
    })];
  }

  // =========================================================================
  // REPEATS, JUMPS, ANNOTATIONS POST-PROCESSING
  // =========================================================================

  private makeRepeatsJumpsAnnotations(entities: MusicEntity[], sym: any, voiceId: string): void {
    const theNote = entities[0] as Playable;
    if (!(theNote instanceof Playable)) return;

    const partLabel = this.partTable[sym.time];

    // Maintain prev/next pitch chain
    if (this.previousNote) {
      this.previousNote.nextPitch = theNote.pitch;
      this.previousNote.nextPlayable = theNote;
      if (partLabel) this.previousNote.nextFirstInPart = true;
      theNote.prevPitch = this.previousNote.pitch;
      theNote.prevPlayable = this.previousNote;
    }
    this.previousNote = theNote;

    // Part label annotation
    if (partLabel) {
      theNote.firstInPart = true;
      const confKey = `notebound.partname.${voiceId}.${theNote.znid}`;
      const pos = this.conf.get('defaults.notebound.partname.pos') ?? [-4, -7];
      entities.push(new NoteBoundAnnotation(theNote, {
        pos, text: partLabel, style: 'regular',
      }, confKey));
    }

    // Repeat start
    if (this.nextNoteMarks.repeatStart) {
      theNote.firstInPart = true;
      this.repetitionStack.push(theNote);
      this.nextNoteMarks.repeatStart = false;
    }

    // First in part
    if (this.nextNoteMarks.firstInPart) {
      theNote.firstInPart = true;
      this.nextNoteMarks.firstInPart = false;
    }

    // Variant ending
    if (this.nextNoteMarks.variantEnding) {
      const text = this.nextNoteMarks.variantEnding.text;
      const confKey = `notebound.variantend.${voiceId}.${theNote.znid}`;
      const pos = this.conf.get('defaults.notebound.variantend.pos') ?? [-4, -7];
      theNote.firstInPart = true;
      entities.push(new NoteBoundAnnotation(theNote, {
        pos, text, style: 'regular', policy: 'Goto',
      }, confKey));
      this.nextNoteMarks.variantEnding = null;
      const lastGroup = this.variantEndings[this.variantEndings.length - 1];
      lastGroup.push({});
      lastGroup[lastGroup.length - 1].rbstart = theNote;
    }

    // Variant followup
    if (this.nextNoteMarks.variantFollowup) {
      theNote.firstInPart = true;
      if (this.variantEndings.length >= 2) {
        this.variantEndings[this.variantEndings.length - 2].push({
          rbstart: theNote,
          isFollowup: true,
        });
      }
      this.nextNoteMarks.variantFollowup = false;
    }

    // Register jump targets from chord annotations
    const chords = this.extractChordLines(sym);
    for (const chord of chords) {
      if (chord.startsWith(':')) {
        this.jumpTargets[chord.substring(1)] = theNote;
      }
    }
  }

  /** Create jump lines for entities that define jump targets */
  private makeJumplines(_entity: MusicEntity, _voiceId: string): MusicEntity[] {
    // Jump lines from explicit @target@ annotations are created during bar processing
    // Additional named jumps (Da Capo, etc.) could be added here
    return [];
  }

  /** Create variant ending jump Gotos */
  private makeVariantEndingJumps(voiceId: string): MusicEntity[] {
    const result: MusicEntity[] = [];

    const lastGroupIdx = this.variantEndings.length > 0 &&
      this.variantEndings[this.variantEndings.length - 1].length === 0
      ? this.variantEndings.length - 2
      : this.variantEndings.length - 1;

    for (let gi = 0; gi <= lastGroupIdx; gi++) {
      const group = this.variantEndings[gi];
      if (!group || group.length < 2) continue;

      const distance = group[0].distance ?? [-10, 10, 15];
      const entity = group[0].rbstop;
      if (!entity) continue;

      const confBase = `notebound.c_jumplines.${voiceId}.${entity.znid}`;
      const hasFollowup = group[group.length - 1]?.isFollowup;
      const lastVariantIdx = hasFollowup ? group.length - 2 : group.length - 1;

      // Startlines
      for (let i = 1; i <= lastVariantIdx; i++) {
        const ve = group[i];
        if (!ve.rbstart || !group[0].rbstop) continue;
        const confKey = `${confBase}.${i - 1}.p_begin`;
        result.push(new Goto(group[0].rbstop, ve.rbstart, {
          confKey,
          distance: distance[0] ?? -10,
          fromAnchor: 'after',
          toAnchor: 'before',
        }));
      }

      // Endlines (skip last variant and followup)
      for (let i = 1; i < lastVariantIdx; i++) {
        const ve = group[i];
        if (ve.repeatEnd || !ve.rbstop) continue;
        const lastVE = group[lastVariantIdx];
        if (!lastVE?.rbstart) continue;
        const confKey = `${confBase}.p_end`;
        result.push(new Goto(ve.rbstop, lastVE.rbstart, {
          confKey,
          distance: distance[1] ?? 10,
          fromAnchor: 'after',
          toAnchor: 'before',
          verticalAnchor: 'to',
        }));
      }

      // Followup line
      if (hasFollowup && group.length >= 3) {
        const beforeFollowup = group[group.length - 2];
        const followup = group[group.length - 1];
        if (beforeFollowup?.rbstop && followup?.rbstart) {
          const confKey = `${confBase}.p_follow`;
          result.push(new Goto(beforeFollowup.rbstop, followup.rbstart, {
            confKey,
            distance: distance[2] ?? 15,
            fromAnchor: 'after',
            toAnchor: 'before',
            verticalAnchor: 'to',
          }));
        }
      }
    }

    return result;
  }

  // =========================================================================
  // NOTEBOUND ANNOTATIONS
  // =========================================================================

  private makeNoteboundAnnotations(entity: MusicEntity, voiceId: string): MusicEntity[] {
    if (!(entity instanceof Playable)) return [];
    const result: MusicEntity[] = [];

    const rawSym = entity.origin?.rawObject;
    if (!rawSym) return result;

    const chords = this.extractChordLines(rawSym);
    chords.forEach((name, index) => {
      const match = name.match(/^([!#<>])([^@]*)(@(-?[\d.]+),(-?[\d.]+))?$/);
      if (!match) return;

      const semantic = match[1];
      const text = match[2] ?? '';
      const posX = match[4] ? parseFloat(match[4]) : null;
      const posY = match[5] ? parseFloat(match[5]) : null;

      let annotation: { text: string; style?: string; pos?: [number, number] } | null = null;

      switch (semantic) {
        case '#':
          annotation = this.annotations[text] ?? null;
          if (!annotation) console.error(`Could not find annotation: ${text}`);
          break;
        case '!':
          annotation = { text, style: 'regular' };
          break;
        case '<':
          (entity as Playable).shift = { dir: 'left' };
          if (entity instanceof SynchPoint) {
            entity.notes.forEach(n => (n.shift = { dir: 'left' }));
          }
          break;
        case '>':
          (entity as Playable).shift = { dir: 'right' };
          if (entity instanceof SynchPoint) {
            entity.notes.forEach(n => (n.shift = { dir: 'right' }));
          }
          break;
      }

      if (annotation) {
        const pos: [number, number] = posX != null && posY != null
          ? [posX, posY]
          : (annotation.pos ?? this.conf.get('defaults.notebound.annotation.pos') ?? [5, -7]);

        let confKey = entity.znid
          ? `notebound.annotation.${voiceId}.${entity.znid}`
          : null;
        if (confKey && index > 0) confKey += `.${index}`;

        result.push(new NoteBoundAnnotation(
          entity as Playable,
          { pos, text: annotation.text, style: annotation.style },
          confKey
        ));
      }
    });

    return result;
  }

  // =========================================================================
  // HELPERS
  // =========================================================================

  private resetState(): void {
    this.countNames = [];
    for (let i = 1; i <= 32; i++) {
      this.countNames.push(i, 'e', 'u', 'e');
    }
    this.jumpTargets = {};
    this.isFirstMeasure = true;
    this.measureStartTime = 0;
    this.measureCount = 0;
    this.nextNoteMarks = {
      measure: false,
      repeatStart: false,
      firstInPart: false,
      variantEnding: null,
      variantFollowup: false,
    };
    this.previousNote = null;
    this.repetitionStack = [];
    this.variantEndings = [[]];
    this.variantNo = 0;
    this.tieStarted = false;
    this.slurStack = 0;
    this.tupletP = 1;
    this.partTable = {};
    this.remarkTable = {};
  }

  private parseOrigin(sym: any): Origin {
    return {
      startChar: sym.istart ?? 0,
      endChar: sym.iend ?? 0,
      rawObject: sym,
    };
  }

  private parseTupletInfo(sym: any): { tuplet: number; tupletStart: boolean; tupletEnd: boolean } {
    if (sym.in_tuplet) {
      if (sym.tp0) this.tupletP = sym.tp0;
      return {
        tuplet: this.tupletP,
        tupletStart: !!sym.tp0,
        tupletEnd: !!sym.te0,
      };
    }
    return { tuplet: 1, tupletStart: false, tupletEnd: false };
  }

  private parseDecorations(sym: any): string[] {
    return (sym.a_dd ?? []).map((d: any) => d.name ?? String(d)).filter(Boolean);
  }

  private convertDuration(rawDuration: number): number {
    const dur = Math.min(128, Math.round((rawDuration / ABC2SVG_DURATION_FACTOR) * this.shortestNote));
    return Math.max(1, dur);
  }

  private mkZnid(sym: any): string {
    return `${sym.istart ?? 0}_${sym.time ?? 0}`;
  }

  private hasTie(sym: any): boolean {
    if (!sym.notes) return false;
    return sym.notes.some((n: any) => n.ti1 != null && n.ti1 !== 0);
  }

  private parseSlur(slurStart: any): number[] {
    let val = slurStart ?? 0;
    if (typeof val !== 'number') val = 0;
    const result: number[] = [];
    while (val > 0) {
      result.push(val & 0xf);
      val >>= 4;
    }
    return result;
  }

  private pushSlur(): number {
    this.slurStack += 1;
    return this.slurStack;
  }

  private popSlur(): number {
    const result = this.slurStack;
    this.slurStack = Math.max(0, this.slurStack - 1);
    return result;
  }

  private transformMeasureStart(sym: any): void {
    if (this.nextNoteMarks.measure) {
      this.measureCount += 1;
      this.measureStartTime = sym.time ?? 0;
    }
  }

  private transformCountNote(sym: any): string | null {
    if (!this.countBy) return null;

    const countBase = ABC2SVG_DURATION_FACTOR / this.countBy;
    const time = sym.time ?? 0;
    const dur = sym.dur ?? (sym.notes?.[0]?.dur ?? 0);
    const countStart = 4 * (time - this.measureStartTime) / countBase;
    const countEnd = countStart + 4 * dur / countBase;

    if (countStart % 1 !== 0 && countEnd % 1 !== 0) return '';

    const start = Math.floor(countStart);
    const end = Math.ceil(countEnd);
    const range: string[] = [];
    for (let i = start; i < end && i < this.countNames.length; i++) {
      range.push(String(this.countNames[i]));
    }

    return range.join('-').replace(/eue/g, 'e-u-e').replace(/ue/g, 'u') || null;
  }

  private investigateFirstBar(symbols: any[]): void {
    const bars = symbols.filter(s => s.type === 0 && !s.invisible);
    this.measureStartTime = 0;
    if (bars.length > 0) {
      this.measureStartTime = (bars[0].time ?? 0) - this.wMeasure;
      if (this.measureStartTime === 0) {
        this.nextNoteMarks.measure = true;
      }
    }
  }

  private extractChordLines(sym: any): string[] {
    const chords = sym.a_gch;
    if (!chords) return [];
    return chords
      .filter((e: any) => e.type === '^' || e.type === 'above')
      .map((e: any) => e.text ?? '')
      .filter((t: string) => t.length > 0);
  }

  private extractGotoDistance(sym: any): number[] {
    const chords = this.extractChordLines(sym);
    for (const line of chords) {
      if (line.startsWith('@')) {
        const match = line.match(/^@([^@]*)@(-?\d+)(,(-?\d+),(-?\d+))?$/);
        if (match) {
          const vals = [match[2], match[4], match[5]].filter(Boolean).map(Number);
          return vals;
        }
      }
    }
    return [2];
  }

  private isNoteSymbol(sym: any): boolean {
    return sym.type === 8; // NOTE type
  }

  private charPosToLineColumn(charPos: number): [number, number] {
    let line = 0;
    let col = charPos;
    for (let i = 0; i < charPos && i < this.abcCode.length; i++) {
      if (this.abcCode[i] === '\n') {
        line++;
        col = charPos - i - 1;
      }
    }
    return [line, col];
  }

  private getMetadata(abcText: string): Record<string, string> {
    const fields: Record<string, string> = {};
    const lines = abcText.split('\n');
    for (const line of lines) {
      const match = line.match(/^([A-Z]):\s*(.+)$/);
      if (match) {
        fields[match[1]] = match[2].trim();
      }
    }
    return fields;
  }

  private makeMetadata(): void {
    this.metaData = {
      title: this.infoFields['T'] ?? '',
      composer: this.infoFields['C'] ?? '',
      tempo: this.infoFields['Q'] ?? '',
      key: this.infoFields['K'] ?? 'C',
      meter: this.infoFields['M'] ?? '4/4',
    };
  }

  private buildPartTable(): void {
    this.partTable = {};
    // Extract part markers from the time-sorted symbol list
    let sym = this.abcModel.tsfirst;
    while (sym) {
      if (sym.type === 10 && sym.text) { // PART type
        this.partTable[sym.time] = sym.text;
      }
      sym = sym.ts_next;
    }
  }
}
