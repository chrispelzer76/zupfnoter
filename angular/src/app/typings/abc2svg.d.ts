/**
 * TypeScript declarations for abc2svg library.
 * abc2svg is loaded as a global script asset.
 */

declare class Abc {
  constructor(user: Abc2svgUser);
  tosvg(frontend: string, content: string): void;
  get_tunes(): AbcTune[];
}

interface Abc2svgUser {
  /** Called when SVG output is generated */
  img_out?: (svg: string) => void;
  /** Called at the start of an annotation */
  anno_start?: (type: string, start: number, stop: number, x: number, y: number, w: number, h: number, s?: any) => void;
  /** Called at the end of an annotation */
  anno_stop?: (type: string, start: number, stop: number, x: number, y: number, w: number, h: number, s?: any) => void;
  /** Called to get the internal ABC model (voices, symbols) */
  get_abcmodel?: (tsfirst: any, voiceTb: any, annoType: any, info: any) => void;
  /** Called on parse errors */
  errmsg?: (message: string, line: number, col: number) => void;
  /** Optional: page formatting */
  page_format?: boolean;
}

/** Internal abc2svg tune representation */
interface AbcTune {
  voices: AbcVoice[];
  symbols: any[];
  info: AbcTuneInfo;
  cfmt: any;
}

interface AbcVoice {
  sym: AbcSymbol | null;
  id: string;
  nm?: string;
  snm?: string;
}

interface AbcTuneInfo {
  T?: string;   // Title
  C?: string;   // Composer
  M?: string;   // Meter
  L?: string;   // Default note length
  K?: string;   // Key
  Q?: string;   // Tempo
  [key: string]: any;
}

/** Internal abc2svg symbol representation */
interface AbcSymbol {
  type: number;
  next?: AbcSymbol;
  prev?: AbcSymbol;
  ts_next?: AbcSymbol;
  ts_prev?: AbcSymbol;
  v: number;          // voice index
  st: number;         // staff index
  dur: number;        // duration
  time: number;       // start time
  notes?: AbcNote[];  // for note symbols
  a_gch?: any[];      // guitar chords / annotations
  a_dd?: any[];       // decorations
  bar_type?: string;  // for bar symbols
  text?: string;
  istart: number;     // start position in source
  iend: number;       // end position in source
  p_v?: any;          // voice properties
  nhd?: number;       // number of note heads - 1
  grace?: boolean;
  sappo?: boolean;
  [key: string]: any;
}

interface AbcNote {
  pit: number;   // pitch (abc2svg internal, not MIDI)
  acc?: number;  // accidental
  dur: number;   // duration
  ti1?: number;  // tie start
  ti2?: number;  // tie end
  midi: number;  // MIDI pitch
  [key: string]: any;
}

// abc2svg symbol types
declare const C: {
  BAR: number;
  CLEF: number;
  CUSTOS: number;
  FORMAT: number;
  GRACE: number;
  KEY: number;
  METER: number;
  MREST: number;
  NOTE: number;
  PART: number;
  REST: number;
  SPACE: number;
  STAVES: number;
  STBRK: number;
  TEMPO: number;
  BLOCK: number;
  REMARK: number;
};

// abc2svg play module
declare class AbcPlay {
  constructor(options: {
    ac?: AudioContext;
    onend?: () => void;
    onnote?: (on: boolean, midi: number, volume: number, time: number) => void;
    errmsg?: (msg: string) => void;
  });
  clear(): void;
  add(start: number, stop: number, tune: AbcTune): void;
  play(start: number, stop: number): void;
  stop(): void;
  set_speed(speed: number): void;
  set_vol(volume: number): void;
}
