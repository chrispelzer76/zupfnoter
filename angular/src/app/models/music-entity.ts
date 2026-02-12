/**
 * Core music model ported from harpnotes.rb (Harpnotes::Music module).
 *
 * Transformation chain:
 *   ABC Text → ABC Model (abc2svg) → Music Model (this) → Drawing Model → SVG/PDF
 */

// ---------------------------------------------------------------------------
// Origin – back-reference into the ABC source text
// ---------------------------------------------------------------------------

export interface Origin {
  startChar: number;
  endChar: number;
  rawObject?: any;
}

// ---------------------------------------------------------------------------
// Shift info for note displacement
// ---------------------------------------------------------------------------

export interface ShiftInfo {
  dir: 'left' | 'right';
}

// ---------------------------------------------------------------------------
// MusicEntity – base class of every element in a Voice
// ---------------------------------------------------------------------------

export abstract class MusicEntity {
  protected _beat = 0;
  confKey: string | null = null;
  countNote: string | null = null;
  decorations: string[] = [];
  endPos: [number, number] | null = null;
  protected _nextPitch: number | null = null;
  nextFirstInPart = false;
  protected _nextPlayable: Playable | null = null;
  protected _prevPitch: number | null = null;
  protected _prevPlayable: Playable | null = null;
  startPos: [number, number] | null = null;
  time = 0;
  endTime = 0;
  protected _visible = true;
  protected _variant: number | null = null;
  znid = '';
  origin: Origin | null = null;
  protected _sheetDrawable: any = null;

  get beat(): number { return this._beat; }
  set beat(v: number) { this._beat = v; }

  get nextPitch(): number | null { return this._nextPitch; }
  set nextPitch(v: number | null) { this._nextPitch = v; }

  get nextPlayable(): Playable | null { return this._nextPlayable; }
  set nextPlayable(v: Playable | null) { this._nextPlayable = v; }

  get prevPitch(): number | null { return this._prevPitch; }
  set prevPitch(v: number | null) { this._prevPitch = v; }

  get prevPlayable(): Playable | null { return this._prevPlayable; }
  set prevPlayable(v: Playable | null) { this._prevPlayable = v; }

  get visible(): boolean { return this._visible; }
  set visible(v: boolean) { this._visible = v; }

  get variant(): number | null { return this._variant; }
  set variant(v: number | null) { this._variant = v; }

  get sheetDrawable(): any { return this._sheetDrawable; }
  set sheetDrawable(v: any) { this._sheetDrawable = v; }

  get isVisible(): boolean { return this._visible; }

  startPosToString(): string {
    if (!this.startPos) return '[?:?]';
    return `[${this.startPos[0]}:${this.startPos[1]}]`;
  }
}

// ---------------------------------------------------------------------------
// NonPlayable – not audible but part of the harp-note sheet
// ---------------------------------------------------------------------------

export abstract class NonPlayable extends MusicEntity {
  private _companion!: Playable;

  get companion(): Playable { return this._companion; }
  set companion(c: Playable) { this._companion = c; }

  get pitch(): number | null { return this._companion?.pitch ?? null; }

  override get beat(): number { return this._companion?.beat ?? 0; }
  override set beat(_v: number) { /* delegated to companion */ }

  get duration(): number { return this._companion?.duration ?? 0; }
}

// ---------------------------------------------------------------------------
// Playable – an audible entity (Note, SynchPoint, Pause)
// ---------------------------------------------------------------------------

export abstract class Playable extends MusicEntity {
  abstract get pitch(): number;
  abstract get duration(): number;

  firstInPart = false;
  jumpStarts: string[] = [];
  jumpEnds: string[] = [];
  slurStarts: number[] = [];
  slurEnds: number[] = [];
  tieStart = false;
  tieEnd = false;
  tuplet = 1;
  tupletStart = false;
  tupletEnd = false;
  shift: ShiftInfo | null = null;
  measureCount: number | null = null;
  protected _measureStart = false;

  get measureStart(): boolean { return this._measureStart; }
  set measureStart(v: boolean) { this._measureStart = v; }

  get proxyNote(): Playable { return this; }
  get left(): Playable { return this; }
  get right(): Playable { return this; }
}

// ---------------------------------------------------------------------------
// Note – a single audible note
// ---------------------------------------------------------------------------

export class Note extends Playable {
  private _pitch: number;
  private _duration: number;

  constructor(pitch: number, duration: number) {
    super();
    if (pitch == null) throw new Error('Trying to create a note with undefined pitch');
    this._pitch = pitch;
    this._duration = duration;
    this.nextPitch = pitch;
    this.prevPitch = pitch;
    this.nextPlayable = this;
    this.prevPlayable = this;
  }

  get pitch(): number { return this._pitch; }
  get duration(): number { return this._duration; }
}

// ---------------------------------------------------------------------------
// SynchPoint – multiple notes played simultaneously (chord / unison)
// ---------------------------------------------------------------------------

export class SynchPoint extends Playable {
  readonly notes: Note[];
  readonly synchedNotes: Note[];

  constructor(notes: Note[], synchedNotes: Note[] = []) {
    super();
    if (!Array.isArray(notes)) throw new Error('Notes must be an array');
    this.notes = notes;
    const all = [...notes, ...synchedNotes];
    this.synchedNotes = Array.from(new Set(all));
  }

  override get measureStart(): boolean { return this.proxyNote.measureStart; }
  override set measureStart(_v: boolean) { /* delegated */ }

  get duration(): number { return this.proxyNote.duration; }
  get pitch(): number { return this.proxyNote.pitch; }

  override get proxyNote(): Playable { return this.getProxyObject(this.notes); }
  override get variant(): number | null { return this.proxyNote.variant; }
  override get sheetDrawable(): any { return this.proxyNote.sheetDrawable; }
  override set sheetDrawable(v: any) { this.proxyNote.sheetDrawable = v; }

  override get prevPlayable(): Playable | null { return this.proxyNote.prevPlayable; }
  override set prevPlayable(p: Playable | null) { this.proxyNote.prevPlayable = p; }

  override get nextPlayable(): Playable | null { return this.proxyNote.nextPlayable; }
  override set nextPlayable(p: Playable | null) { this.proxyNote.nextPlayable = p; }

  override get beat(): number { return this._beat; }
  override set beat(value: number) {
    this._beat = value;
    this.notes.forEach(n => (n.beat = value));
  }

  override get left(): Playable { return this.notes[0]; }
  override get right(): Playable { return this.notes[this.notes.length - 1]; }

  private getProxyObject(objects: Note[]): Note {
    return objects[objects.length - 1];
  }
}

// ---------------------------------------------------------------------------
// Pause (Rest)
// ---------------------------------------------------------------------------

export class Pause extends Playable {
  private _pitch: number;
  private _duration: number;

  constructor(pitch: number, duration: number) {
    super();
    if (pitch == null) throw new Error('Trying to create a rest with undefined pitch');
    this._pitch = pitch;
    this._duration = duration;
    this.nextPlayable = this;
    this.prevPitch = pitch;
    this.prevPlayable = this;
  }

  get pitch(): number { return this._pitch; }
  set pitchValue(v: number) { this._pitch = v; }

  get duration(): number { return this._duration; }
  set durationValue(v: number) { this._duration = v; }
}

// ---------------------------------------------------------------------------
// MeasureStart – marks the beginning of a measure (bar)
// ---------------------------------------------------------------------------

export class MeasureStart extends NonPlayable {
  constructor(companion: Playable) {
    super();
    this.companion = companion;
    this.visible = companion.isVisible;
  }
}

// ---------------------------------------------------------------------------
// NewPart – beginning of a labelled section (P:A, P:B, …)
// ---------------------------------------------------------------------------

export class NewPart extends NonPlayable {
  readonly name: string;

  constructor(title: string, confKey: string | null = null) {
    super();
    this.confKey = confKey;
    this.name = title;
  }
}

// ---------------------------------------------------------------------------
// NoteBoundAnnotation – text annotation attached to a note
// ---------------------------------------------------------------------------

export interface AnnotationSpec {
  pos: [number, number];
  text: string;
  style?: string;
  policy?: any;
}

export class NoteBoundAnnotation extends NonPlayable {
  private annotations: AnnotationSpec;

  constructor(companion: Playable, annotation: AnnotationSpec, confKey: string | null = null) {
    super();
    this.companion = companion;
    this.confKey = confKey;
    this.annotations = annotation;
  }

  get style(): string { return this.annotations.style ?? 'regular'; }
  get text(): string { return this.annotations.text; }
  get position(): [number, number] { return this.annotations.pos; }
  get policy(): any { return this.annotations.policy; }
}

// ---------------------------------------------------------------------------
// Goto – jump / repeat in the music flow
// ---------------------------------------------------------------------------

export interface GotoPolicy {
  confKey?: string;
  level?: number;
  distance?: number;
  [key: string]: any;
}

export class Goto extends MusicEntity {
  readonly from: Playable;
  readonly to: Playable;
  readonly policy: GotoPolicy;

  constructor(from: Playable, to: Playable, policy: GotoPolicy) {
    super();
    this.from = from;
    this.to = to;
    this.policy = policy;
    this.confKey = policy.confKey ?? null;
  }
}
