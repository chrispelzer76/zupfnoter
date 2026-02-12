/**
 * Song model ported from harpnotes.rb (Harpnotes::Music::Song, Voice, BeatMap).
 */

import { MusicEntity, Playable, Note, SynchPoint } from './music-entity';

// ---------------------------------------------------------------------------
// Voice – an ordered sequence of MusicEntities
// ---------------------------------------------------------------------------

export class Voice {
  readonly entities: MusicEntity[] = [];
  index = 0;
  name = '';
  showVoice = true;
  showFlowline = true;
  showJumpline = true;

  get length(): number {
    return this.entities.length;
  }

  push(entity: MusicEntity): void {
    this.entities.push(entity);
  }

  /** Iterate over all entities */
  [Symbol.iterator](): Iterator<MusicEntity> {
    return this.entities[Symbol.iterator]();
  }

  /** Filter to only playable entities */
  get playables(): Playable[] {
    return this.entities.filter((e): e is Playable => e instanceof Playable);
  }

  select(predicate: (e: MusicEntity) => boolean): MusicEntity[] {
    return this.entities.filter(predicate);
  }
}

// ---------------------------------------------------------------------------
// BeatMap – maps beat numbers to Playables for a single voice
// ---------------------------------------------------------------------------

export class BeatMap {
  index: number;
  private map = new Map<number, Playable>();

  constructor(index: number) {
    this.index = index;
  }

  get(beat: number): Playable | undefined {
    return this.map.get(beat);
  }

  set(beat: number, playable: Playable): void {
    this.map.set(beat, playable);
  }

  has(beat: number): boolean {
    return this.map.has(beat);
  }

  keys(): number[] {
    return Array.from(this.map.keys());
  }

  maxBeat(): number {
    const keys = this.keys();
    return keys.length > 0 ? Math.max(...keys) : 0;
  }
}

// ---------------------------------------------------------------------------
// Song metadata
// ---------------------------------------------------------------------------

export interface SongMetaData {
  title: string;
  composer: string;
  tempo: any;
  key: string;
  meter: string;
  [key: string]: any;
}

// ---------------------------------------------------------------------------
// Song – the top-level music representation
// ---------------------------------------------------------------------------

export class Song {
  readonly voices: Voice[];
  beatMaps: BeatMap[] = [];
  metaData: SongMetaData;
  harpnoteOptions: any = {};
  checksum = '';

  constructor(
    voices: Voice[] = [],
    noteLengthInBeats = 8,
    metaData: Partial<SongMetaData> = {}
  ) {
    this.voices = voices;
    this.metaData = {
      title: '',
      composer: '',
      tempo: null,
      key: 'C',
      meter: '4/4',
      ...metaData,
    };
    this.updateBeats();
  }

  /** Add a voice to the song */
  addVoice(voice: Voice): void {
    this.voices.push(voice);
    this.updateBeats();
  }

  /**
   * Build synch-points between two voices.
   * Finds notes at the same beat and creates SynchPoints to connect them.
   */
  buildSynchPoints(selector: [number, number]): SynchPoint[] {
    const expanded = this.expandedBeatMaps();
    const synchPoints: SynchPoint[] = [];

    for (const beatEntry of expanded) {
      const first = beatEntry[selector[0]];
      const last = beatEntry[selector[1]];

      if (!first || !last || !first.isVisible || !last.isVisible) continue;

      const firstLeft = first.left;
      const firstRight = first.right;
      const lastLeft = last.left;
      const lastRight = last.right;

      // Find shortest distance between the two voices' notes
      const candidates: [Playable, Playable][] = [];
      for (const f of [firstLeft, firstRight]) {
        for (const l of [lastLeft, lastRight]) {
          candidates.push([f, l]);
        }
      }

      const best = candidates.reduce((min, c) => {
        const dist = Math.abs(c[1].pitch - c[0].pitch);
        const minDist = Math.abs(min[1].pitch - min[0].pitch);
        return dist < minDist ? c : min;
      });

      if (best[0] instanceof Note && best[1] instanceof Note) {
        const sp = new SynchPoint(
          [best[0] as Note, best[1] as Note],
          candidates
            .flat()
            .filter((p): p is Note => p instanceof Note)
        );
        synchPoints.push(sp);
      }
    }

    return synchPoints;
  }

  /** Compute the last beat in the song */
  lastBeat(): number {
    return Math.max(0, ...this.beatMaps.map(bm => bm.maxBeat()));
  }

  /**
   * Expand beat maps: for each beat 0..lastBeat, return an array of
   * Playable|undefined indexed by voice.
   */
  expandedBeatMaps(): (Playable | undefined)[][] {
    const max = this.lastBeat();
    const result: (Playable | undefined)[][] = [];
    for (let beat = 0; beat <= max; beat++) {
      result.push(this.beatMaps.map(bm => bm.get(beat)));
    }
    return result;
  }

  /**
   * Recompute beat maps from voice time-stamps.
   * Beat = time / 8 (matching Ruby BEAT_RESOLUTION logic).
   */
  updateBeats(): void {
    this.beatMaps = this.voices.map(voice => {
      const beatMap = new BeatMap(voice.index);
      for (const entity of voice.entities) {
        if (entity instanceof Playable) {
          let currentBeat = entity.time / 8;
          const currentBeatFloor = Math.floor(currentBeat);
          const beatError = currentBeat - currentBeatFloor;
          if (beatError > 0) {
            console.warn(`Unsupported tuplet ${(entity as any).tuplet} beat error ${beatError}`, entity.startPos);
            currentBeat = currentBeatFloor;
          }
          beatMap.set(currentBeat, entity);
          entity.beat = currentBeat;
        }
      }
      beatMap.index = voice.index;
      return beatMap;
    });
  }
}
