/**
 * Layout service: transforms Song (Music Model) → Sheet (Drawing Model).
 * Ported from layout logic scattered through harpnotes.rb.
 *
 * Responsibilities:
 *   - Beat → Y position mapping (with beat-layout compression)
 *   - Pitch → X position mapping
 *   - Flowline generation between consecutive notes
 *   - Jumpline generation for repeats/gotos
 *   - Synchline generation between voices
 *   - Annotation, bar-number and count-note positioning
 */
import { Injectable } from '@angular/core';
import { ConfstackService } from './confstack.service';
import { Song, Voice } from '../models/song';
import {
  MusicEntity, Playable, Note, SynchPoint, Pause,
  Goto, NonPlayable, NoteBoundAnnotation, MeasureStart, NewPart,
} from '../models/music-entity';
import {
  Sheet, Drawable, CompoundDrawable, CollisionDetector,
  createEllipse, createFlowLine, createAnnotation, createGlyph, createPath,
  EllipseDrawable, FlowLineDrawable, AnnotationDrawable, GlyphDrawable,
  PathDrawable, PathCommand,
} from '../models/drawing';

@Injectable({ providedIn: 'root' })
export class LayoutService {

  constructor(private conf: ConfstackService) {}

  /**
   * Layout a song into a drawable sheet for a given extract configuration.
   */
  layout(song: Song, extractIndex: number): Sheet {
    const extract = this.conf.get(`extract.${extractIndex}`) ?? {};
    const layoutConf = { ...this.conf.get('layout'), ...(extract.layout ?? {}) };

    const voices = extract.voices ?? [1];
    const flowlineVoices = extract.flowlines ?? [];
    const subflowlineVoices = extract.subflowlines ?? [];
    const jumplineVoices = extract.jumplines ?? [];
    const synchlineVoicePairs: [number, number][] = extract.synchlines ?? [];
    const layoutlineVoices = extract.layoutlines ?? voices;
    const startPos = extract.startpos ?? 15;

    // Core layout parameters
    const pitchOffset = layoutConf.PITCH_OFFSET ?? -43;
    const xSpacing = layoutConf.X_SPACING ?? 11.5;
    const xOffset = layoutConf.X_OFFSET ?? 2.8;
    const yScale = layoutConf.Y_SCALE ?? 4;
    const ellipseSize: [number, number] = layoutConf.ELLIPSE_SIZE ?? [3.5, 1.7];
    const restSize: [number, number] = layoutConf.REST_SIZE ?? [4, 2];
    const durationToStyle = layoutConf.DURATION_TO_STYLE ?? {};
    const durationToBeams = layoutConf.DURATION_TO_BEAMS ?? {};
    const restToGlyph = layoutConf.REST_TO_GLYPH ?? {};
    const drawingAreaSize: [number, number] = layoutConf.DRAWING_AREA_SIZE ?? [400, 282];
    const lineThin = layoutConf.LINE_THIN ?? 0.1;
    const lineMedium = layoutConf.LINE_MEDIUM ?? 0.3;
    const lineThick = layoutConf.LINE_THICK ?? 0.5;
    const colorDefault = layoutConf.color?.color_default ?? 'black';
    const colorVariant1 = layoutConf.color?.color_variant1 ?? 'grey';
    const colorVariant2 = layoutConf.color?.color_variant2 ?? 'dimgrey';
    const bottomUp = layoutConf.bottomup ?? false;
    const limitA3 = layoutConf.limit_a3 ?? false;
    const beatResolution = layoutConf.BEAT_RESOLUTION ?? 192;
    const packer = layoutConf.packer ?? {};
    const packMaxSpread = packer.pack_max_spreadfactor ?? 2;

    // Build beat compression map (original beat → compressed layout beat)
    const beatCompressionMap = this.buildBeatCompressionMap(song, layoutConf, layoutlineVoices);

    // Compute beat spacing (mm per beat) like Ruby: Y_SCALE / BEAT_RESOLUTION
    let beatSpacing = yScale / beatResolution;

    // Dynamic adjustment: fit content into drawing area
    const maxCompressedBeat = Math.max(0, ...Array.from(beatCompressionMap.values()));
    if (maxCompressedBeat > 0) {
      const fullBeatSpacing = (drawingAreaSize[1] - startPos) / maxCompressedBeat;
      beatSpacing = Math.min(fullBeatSpacing, packMaxSpread * beatSpacing);
    }

    // Collect all drawables
    const children: Drawable[] = [];

    // Layout each voice
    for (const voiceIdx of layoutlineVoices) {
      if (voiceIdx >= song.voices.length) continue;
      const voice = song.voices[voiceIdx];
      const showVoice = voices.includes(voiceIdx);
      const showFlow = flowlineVoices.includes(voiceIdx) || subflowlineVoices.includes(voiceIdx);
      const showJump = jumplineVoices.includes(voiceIdx);
      const isSubflow = subflowlineVoices.includes(voiceIdx);

      let prevDrawable: EllipseDrawable | GlyphDrawable | null = null;
      let prevPlayable: Playable | null = null;

      for (const entity of voice.entities) {
        if (!(entity instanceof Playable)) continue;

        // Determine position
        const x = this.pitchToX(entity.pitch, pitchOffset, xSpacing, xOffset);
        const y = this.beatToY(entity.beat, beatCompressionMap, startPos, beatSpacing, bottomUp, drawingAreaSize[1]);

        // Determine visual style from duration
        const durationKey = this.durationToKey(entity.duration, durationToStyle);
        const variantColor = entity.variant
          ? (entity.variant === 1 ? colorVariant1 : colorVariant2)
          : colorDefault;

        let noteDrawable: EllipseDrawable | GlyphDrawable;

        if (entity instanceof Pause) {
          // Rest: use glyph
          const glyphInfo = restToGlyph[durationKey] ?? restToGlyph['err'] ?? [[1, 1], 'rest_1', false];
          const size: [number, number] = [
            restSize[0] * (glyphInfo[0][0] ?? 1),
            restSize[1] * (glyphInfo[0][1] ?? 1),
          ];
          const shift = this.computeNoteShift(x, size, entity, limitA3);
          noteDrawable = createGlyph(
            [x + shift, y], size, glyphInfo[1], glyphInfo[2], entity
          ) as GlyphDrawable;
          noteDrawable.color = variantColor;
          noteDrawable.lineWidth = lineThin;
          noteDrawable.visible = entity.isVisible && showVoice;
          noteDrawable.znid = entity.znid;
          noteDrawable.confKey = entity.confKey;
          children.push(noteDrawable);

          // Measure bar over rest
          if (entity.measureStart) {
            const barOver = this.createBarOver(x + shift, y, size, variantColor, lineThick, bottomUp);
            if (barOver) children.push(barOver);
          }
        } else {
          // Note / SynchPoint: use ellipse(s)
          const styleInfo = durationToStyle[durationKey] ?? durationToStyle['err'] ?? [1, 'filled', false];
          const beamInfo = durationToBeams[durationKey];
          const flagCount = beamInfo?.[3] ?? 0;
          const notesToRender = entity instanceof SynchPoint ? entity.notes : [entity as Note];

          for (const note of notesToRender) {
            const nx = this.pitchToX(note.pitch, pitchOffset, xSpacing, xOffset);
            const size: [number, number] = [
              ellipseSize[0] * styleInfo[0],
              ellipseSize[1] * styleInfo[0],
            ];
            const fill = styleInfo[1] as 'filled' | 'empty';
            const dotted = styleInfo[2] as boolean;
            const shift = this.computeNoteShift(nx, size, note, limitA3);

            const ellipse = createEllipse([nx + shift, y], size, fill, dotted, note);
            ellipse.color = variantColor;
            ellipse.lineWidth = fill === 'filled' ? lineThin : lineMedium;
            ellipse.visible = entity.isVisible && showVoice;
            ellipse.znid = note.znid || entity.znid;
            ellipse.confKey = entity.confKey;
            children.push(ellipse);

            // Note flags (beams)
            if (flagCount > 0 && entity.isVisible && showVoice) {
              const flagPath = this.createNoteFlags(nx + shift, y, size, flagCount, lineMedium, variantColor);
              if (flagPath) children.push(flagPath);
            }

            // Measure bar over note
            if (entity.measureStart) {
              const barOver = this.createBarOver(nx + shift, y, size, variantColor, lineThick, bottomUp);
              if (barOver) children.push(barOver);
            }

            noteDrawable = ellipse;
          }
          noteDrawable = noteDrawable!;

          // Synchline within chord (connecting notes of a SynchPoint)
          if (entity instanceof SynchPoint && entity.notes.length > 1) {
            const firstNote = entity.notes[0];
            const lastNote = entity.notes[entity.notes.length - 1];
            if (firstNote.sheetDrawable && lastNote.sheetDrawable) {
              const from = this.getDrawableCenter(firstNote.sheetDrawable);
              const to = this.getDrawableCenter(lastNote.sheetDrawable);
              const chordLine = createFlowLine(from, to, 'dashed');
              chordLine.color = variantColor;
              chordLine.lineWidth = lineThin;
              chordLine.visible = entity.isVisible && showVoice;
              children.push(chordLine);
            }
          }
        }

        // Flowline from previous note to this one
        // Ruby: interrupt flowline at part boundaries (first_in_part)
        if (showFlow && prevDrawable && prevPlayable
            && entity.isVisible && prevPlayable.isVisible
            && !entity.firstInPart) {
          const fromPos = this.getDrawableCenter(prevDrawable);
          const toPos = this.getDrawableCenter(noteDrawable);
          const flowStyle = isSubflow ? 'dashed' as const :
            (prevPlayable.tieStart ? 'dotted' as const : 'solid' as const);
          const flow = createFlowLine(fromPos, toPos, flowStyle);
          flow.color = variantColor;
          flow.lineWidth = lineThin;
          flow.visible = true;
          children.push(flow);
        }

        // Track for next flowline
        if (entity.isVisible) {
          prevDrawable = noteDrawable;
          prevPlayable = entity;
        }

        // Link entity to drawable
        entity.sheetDrawable = noteDrawable;
      }

      // Jumplines (Goto entities) — rendered as L-shaped paths with arrowheads
      if (showJump) {
        const jumplineAnchor: [number, number] = layoutConf.jumpline_anchor ?? [3, 1];
        for (const entity of voice.entities) {
          if (!(entity instanceof Goto)) continue;
          const from = entity.from;
          const to = entity.to;
          if (!from.sheetDrawable || !to.sheetDrawable) continue;

          const distance = (entity.policy?.distance ?? 2) - 1; // make symmetric: -1, 0, 1
          const vertical = (distance + 0.5) * xSpacing;

          const fromAnchor = entity.policy?.['from_anchor'] ?? 'after';
          const toAnchor = entity.policy?.['to_anchor'] ?? 'before';

          const jumpPaths = this.makeJumplinePath(
            from.sheetDrawable, to.sheetDrawable,
            vertical, jumplineAnchor, bottomUp,
            fromAnchor, toAnchor
          );

          // Line path (L-shape)
          const linePath = createPath(jumpPaths.line, null, from);
          linePath.color = colorDefault;
          linePath.lineWidth = lineThick;
          linePath.visible = true;
          linePath.confKey = entity.confKey;
          children.push(linePath);

          // Arrow path (filled triangle)
          const arrowPath = createPath(jumpPaths.arrow, 'filled', from);
          arrowPath.color = colorDefault;
          arrowPath.visible = true;
          children.push(arrowPath);
        }
      }
    }

    // Synchlines between voice pairs
    for (const [v1, v2] of synchlineVoicePairs) {
      if (v1 >= song.voices.length || v2 >= song.voices.length) continue;
      const synchPoints = song.buildSynchPoints([v1, v2]);
      for (const sp of synchPoints) {
        if (sp.notes.length < 2) continue;
        const n1 = sp.notes[0];
        const n2 = sp.notes[sp.notes.length - 1];
        if (!n1.sheetDrawable || !n2.sheetDrawable) continue;

        const from = this.getDrawableCenter(n1.sheetDrawable);
        const to = this.getDrawableCenter(n2.sheetDrawable);
        const synch = createFlowLine(from, to, 'dashed');
        synch.color = colorDefault;
        synch.lineWidth = lineThin;
        synch.visible = true;
        children.push(synch);
      }
    }

    // Annotations (notebound)
    for (const voiceIdx of layoutlineVoices) {
      if (voiceIdx >= song.voices.length) continue;
      const voice = song.voices[voiceIdx];
      for (const entity of voice.entities) {
        if (!(entity instanceof NoteBoundAnnotation)) continue;
        const companion = entity.companion;
        if (!companion?.sheetDrawable) continue;

        const basePos = this.getDrawableCenter(companion.sheetDrawable);
        const offset = entity.position ?? [0, 0];
        const pos: [number, number] = [basePos[0] + offset[0], basePos[1] + offset[1]];

        const ann = createAnnotation(pos, entity.text, entity.style, entity, entity.confKey);
        ann.visible = companion.isVisible;
        children.push(ann);
      }
    }

    // Bar numbers
    const barnumberConf = extract.barnumbers ?? {};
    const bnVoices = barnumberConf.voices ?? [];
    for (const voiceIdx of bnVoices) {
      if (voiceIdx >= song.voices.length) continue;
      const voice = song.voices[voiceIdx];
      for (const entity of voice.entities) {
        if (!(entity instanceof Playable) || !entity.measureStart || !entity.measureCount) continue;
        if (!entity.sheetDrawable) continue;
        const basePos = this.getDrawableCenter(entity.sheetDrawable);
        const bnPos = barnumberConf.pos ?? [6, -4];
        const pos: [number, number] = [basePos[0] + bnPos[0], basePos[1] + bnPos[1]];
        const prefix = barnumberConf.prefix ?? '';
        const text = `${prefix}${entity.measureCount}`;
        const ann = createAnnotation(pos, text, barnumberConf.style ?? 'small_bold');
        ann.visible = entity.isVisible;
        children.push(ann);
      }
    }

    // Count notes (Zählhilfen)
    const cnConf = extract.countnotes ?? {};
    const cnVoices = cnConf.voices ?? [];
    for (const voiceIdx of cnVoices) {
      if (voiceIdx >= song.voices.length) continue;
      const voice = song.voices[voiceIdx];
      for (const entity of voice.entities) {
        if (!(entity instanceof Playable) || !entity.countNote || !entity.sheetDrawable) continue;
        const basePos = this.getDrawableCenter(entity.sheetDrawable);
        const cnPos = cnConf.pos ?? [3, -2];
        const pos: [number, number] = [basePos[0] + cnPos[0], basePos[1] + cnPos[1]];
        const ann = createAnnotation(pos, entity.countNote, cnConf.style ?? 'smaller');
        ann.visible = entity.isVisible;
        children.push(ann);
      }
    }

    // String names header
    const stringnames = extract.stringnames;
    if (stringnames?.text) {
      const names = stringnames.text.split(/\s+/);
      // Base MIDI pitch for string 0 = absolute pitch offset (43 for G2)
      const basePitch = Math.abs(pitchOffset);
      names.forEach((name: string, i: number) => {
        const x = this.pitchToX(basePitch + i, pitchOffset, xSpacing, xOffset);
        const ann = createAnnotation([x, 5], name, stringnames.style ?? 'small');
        ann.align = 'center';
        children.push(ann);
      });
    }

    // Notes (text annotations from extract config)
    const extractNotes = extract.notes ?? {};
    for (const [key, noteConf] of Object.entries(extractNotes)) {
      const nc = noteConf as any;
      if (nc.pos && nc.text) {
        const ann = createAnnotation(nc.pos, nc.text, nc.style ?? 'regular');
        children.push(ann);
      }
    }

    const printerConf = extract.printer ?? this.conf.get('printer') ?? {};
    return new Sheet(children, voices, printerConf);
  }

  // =========================================================================
  // Position calculations
  // =========================================================================

  /** Convert MIDI pitch to X coordinate */
  pitchToX(pitch: number, pitchOffset: number, xSpacing: number, xOffset: number): number {
    return (pitchOffset + pitch) * xSpacing + xOffset;
  }

  /** Convert beat number to Y coordinate using compression map and beat spacing */
  beatToY(
    beat: number,
    beatCompressionMap: Map<number, number>,
    startPos: number,
    beatSpacing: number,
    bottomUp: boolean,
    drawingHeight: number
  ): number {
    let compressedBeat = beatCompressionMap.get(beat);
    if (compressedBeat === undefined) {
      // Beat not in map — interpolate from nearest known beats
      const knownBeats = Array.from(beatCompressionMap.keys()).sort((a, b) => a - b);
      if (knownBeats.length === 0) {
        compressedBeat = beat;
      } else if (beat <= knownBeats[0]) {
        compressedBeat = beatCompressionMap.get(knownBeats[0])!;
      } else if (beat >= knownBeats[knownBeats.length - 1]) {
        compressedBeat = beatCompressionMap.get(knownBeats[knownBeats.length - 1])!;
      } else {
        // Find surrounding beats and interpolate
        let lo = 0, hi = knownBeats.length - 1;
        while (lo < hi - 1) {
          const mid = (lo + hi) >> 1;
          if (knownBeats[mid] <= beat) lo = mid; else hi = mid;
        }
        const bLo = knownBeats[lo], bHi = knownBeats[hi];
        const cLo = beatCompressionMap.get(bLo)!;
        const cHi = beatCompressionMap.get(bHi)!;
        const frac = (beat - bLo) / (bHi - bLo);
        compressedBeat = cLo + frac * (cHi - cLo);
      }
    }
    let y = startPos + compressedBeat * beatSpacing;
    if (bottomUp) {
      y = drawingHeight - y;
    }
    return y;
  }

  /**
   * Build beat compression map: maps original beats → compressed layout positions.
   * Ported from compute_beat_compression_0 in harpnotes.rb.
   *
   * The Ruby algorithm computes increments based on note VISUAL SIZE
   * (from DURATION_TO_STYLE) multiplied by BEAT_RESOLUTION, not raw beat gaps.
   * This produces compression values proportional to how much vertical space
   * each note needs on the sheet.
   */
  private buildBeatCompressionMap(
    song: Song, layoutConf: any, layoutlineVoices: number[]
  ): Map<number, number> {
    const compressionMap = new Map<number, number>();
    const packer = layoutConf.packer ?? {};
    const packMethod = packer.pack_method ?? 0;
    const confMinIncrement = (packer.pack_min_increment ?? 0.2);
    const beatResolution = layoutConf.BEAT_RESOLUTION ?? 192;
    const durationToStyle = layoutConf.DURATION_TO_STYLE ?? {};
    const scaledMinIncrement = confMinIncrement * beatResolution;

    // Collect all playable entities grouped by beat from layout voices
    const beatToPlayables = new Map<number, Playable[]>();
    for (const voiceIdx of layoutlineVoices) {
      if (voiceIdx >= song.voices.length) continue;
      const voice = song.voices[voiceIdx];
      for (const entity of voice.entities) {
        if (!(entity instanceof Playable)) continue;
        const beat = entity.beat;
        if (!beatToPlayables.has(beat)) {
          beatToPlayables.set(beat, []);
        }
        beatToPlayables.get(beat)!.push(entity);
      }
    }

    const sortedBeats = Array.from(beatToPlayables.keys()).sort((a, b) => a - b);

    if (sortedBeats.length === 0) {
      return compressionMap;
    }

    if (packMethod === 0 || packMethod === 1) {
      // Default compression (method 0): increments based on note visual sizes
      // Ruby: size = BEAT_RESOLUTION * DURATION_TO_STYLE[duration_id].first
      //       defaultincrement = (current_size + last_size) / 2
      let position = 0;
      let lastSize = 0;

      for (let i = 0; i < sortedBeats.length; i++) {
        const beat = sortedBeats[i];
        const playables = beatToPlayables.get(beat)!;

        // Find max duration at this beat
        const maxDuration = Math.max(...playables.map(p => p.duration));
        const durationKey = this.durationToKey(maxDuration, durationToStyle);
        const styleInfo = durationToStyle[durationKey] ?? durationToStyle['err'] ?? [1, 'filled', false];
        const sizeFactor = styleInfo[0] as number;

        // size = BEAT_RESOLUTION * size_factor_from_duration_style
        const size = beatResolution * sizeFactor;

        // defaultincrement = average of current and previous note size
        const defaultIncrement = (size + lastSize) / 2;
        lastSize = size;

        // First beat starts at 0
        if (i === 0) {
          compressionMap.set(beat, 0);
          continue;
        }

        let increment = Math.max(scaledMinIncrement, defaultIncrement);

        // Extra space for measure starts
        const hasMeasureStart = playables.some(p => p.measureStart);
        if (hasMeasureStart) {
          increment += increment / 4;
        }

        // Extra space for part starts
        const hasPartStart = playables.some(p => p.firstInPart);
        if (hasPartStart) {
          increment += defaultIncrement;
        }

        position += increment;
        compressionMap.set(beat, position);
      }
    } else {
      // Method 2: linear (identity)
      for (const beat of sortedBeats) {
        compressionMap.set(beat, beat);
      }
    }

    return compressionMap;
  }

  /** Convert duration number to a string key like "d64", "d16", etc. */
  private durationToKey(duration: number, durationToStyle: Record<string, any>): string {
    const key = `d${duration}`;
    if (durationToStyle[key] !== undefined) return key;
    return 'err';
  }

  /** Compute note shift for boundary handling */
  private computeNoteShift(
    x: number, size: [number, number], entity: Playable, limitA3: boolean
  ): number {
    let shift = 0;

    // A3 boundary handling
    if (limitA3) {
      if (x < 5) shift += size[0];
      if (x > 415) shift -= size[0];
    }

    // Explicit shift from music model (e.g., same-pitch notes in different voices)
    if (entity.shift) {
      shift += entity.shift.dir === 'left' ? -size[0] : size[0];
    }

    return shift;
  }

  /**
   * Create note flags (beams) as a Path drawable.
   * Vertical instrument orientation: beam goes upward, flags point right.
   */
  private createNoteFlags(
    x: number, y: number, size: [number, number],
    flagCount: number, lineWidth: number, color: string
  ): PathDrawable | null {
    if (flagCount <= 0) return null;

    const beamDx = 0.1;
    const beamDy = 2 * size[1];
    const flagX = 1.3 * size[1];
    const flagY = 0.6 * size[1];
    const flagDeltaY = flagY;
    const flagDeltaX = beamDx * flagDeltaY / beamDy;

    const fx = x + size[0] - lineWidth / 2;
    const fy = y;

    const path: PathCommand[] = [
      ['M', fx, fy],
      ['l', beamDx, -beamDy],
    ];

    for (let i = 0; i < flagCount; i++) {
      path.push(
        ['M', fx + beamDx - i * flagDeltaX, fy - beamDy + i * flagDeltaY],
        ['l', flagX, flagY],
      );
    }

    const result = createPath(path, null);
    result.lineWidth = lineWidth;
    result.color = color;
    return result;
  }

  /** Create a measure bar-over indicator above/below a note */
  private createBarOver(
    x: number, y: number, size: [number, number],
    color: string, lineThick: number, bottomUp: boolean
  ): EllipseDrawable | null {
    const barOverY = size[1] + 1.3 * lineThick;
    const barY = bottomUp ? y + barOverY : y - barOverY;
    const bar = createEllipse(
      [x, barY],
      [size[0], lineThick / 2],
      'filled', false, null, true
    );
    bar.color = color;
    return bar;
  }

  /**
   * Create L-shaped jumpline path with arrowhead.
   * Ported from Ruby's make_path_from_jumpline (harpnotes.rb:2989-3062).
   *
   * Path: from → horizontal → vertical → horizontal → to (with arrowhead at to)
   */
  private makeJumplinePath(
    fromDrawable: any, toDrawable: any,
    vertical: number, jumplineAnchor: [number, number],
    bottomUp: boolean,
    fromAnchorDir: string = 'after', toAnchorDir: string = 'before'
  ): { line: PathCommand[]; arrow: PathCommand[] } {
    const anchorX = jumplineAnchor[0];
    const anchorY = jumplineAnchor[1];

    const fromCenter = this.getDrawableCenter(fromDrawable);
    const fromSize: [number, number] = fromDrawable?.size ?? [3.5, 1.7];
    const toCenter = this.getDrawableCenter(toDrawable);
    const toSize: [number, number] = toDrawable?.size ?? [3.5, 1.7];

    // Anchor multipliers: 'before' = above (-1), 'after' = below (+1)
    // In bottomUp mode, swap before/after
    let fromAnchor = fromAnchorDir === 'before' ? -1 : 1;
    let toAnchor = toAnchorDir === 'before' ? -1 : 1;
    if (bottomUp) {
      fromAnchor = -fromAnchor;
      toAnchor = -toAnchor;
    }

    // Offset from center to attachment point = note size + anchor padding
    const fromOffsetMag: [number, number] = [fromSize[0] + anchorX, fromSize[1] + anchorY];
    const toOffsetMag: [number, number] = [toSize[0] + anchorX, toSize[1] + anchorY];

    // Vertical position (relative to from by default)
    const verticalX = fromCenter[0] + vertical;

    // Orientation: direction from note to vertical line (normalized X sign)
    const startOrientX = verticalX > fromCenter[0] ? 1 : (verticalX < fromCenter[0] ? -1 : 1);
    const endOrientX = verticalX > toCenter[0] ? 1 : (verticalX < toCenter[0] ? -1 : 1);

    // Start offset = size * [orientation, anchor_direction]
    const startOffsetX = fromOffsetMag[0] * startOrientX;
    const startOffsetY = fromOffsetMag[1] * fromAnchor;
    const endOffsetX = toOffsetMag[0] * endOrientX;
    const endOffsetY = toOffsetMag[1] * toAnchor;

    // Vertical segment Y positions (adjusted by Y offset only)
    const startVertX = verticalX;
    const startVertY = fromCenter[1] + startOffsetY;
    const endVertX = verticalX;
    const endVertY = toCenter[1] + endOffsetY;

    // Line points
    const p1x = fromCenter[0] + startOffsetX;
    const p1y = fromCenter[1] + startOffsetY;
    const p2x = startVertX;
    const p2y = startVertY;
    const p3x = endVertX;
    const p3y = endVertY;
    const p4x = toCenter[0] + endOffsetX;
    const p4y = toCenter[1] + endOffsetY;
    // p4_line ends inside the arrow (2px into arrow direction)
    const p4LineX = p4x + endOrientX * 2;
    const p4LineY = p4y;

    // Arrow points (filled triangle)
    const a1x = p4x + endOrientX * 2.5;
    const a1y = p4y + 1;
    const a2x = p4x + endOrientX * 2.5;
    const a2y = p4y - 1;

    // Relative line points
    const rp2x = p2x - p1x;
    const rp2y = p2y - p1y;
    const rp3x = p3x - p2x;
    const rp3y = p3y - p2y;
    const rp4x = p4LineX - p3x;
    const rp4y = p4LineY - p3y;

    // Relative arrow points
    const ra1x = a1x - p4x;
    const ra1y = a1y - p4y;
    const ra2x = a2x - a1x;
    const ra2y = a2y - a1y;
    const ra3x = p4x - a2x;
    const ra3y = p4y - a2y;

    const line: PathCommand[] = [
      ['M', p1x, p1y],
      ['l', rp2x, rp2y],
      ['l', rp3x, rp3y],
      ['l', rp4x, rp4y],
    ];

    const arrow: PathCommand[] = [
      ['M', p4x, p4y],
      ['l', ra1x, ra1y],
      ['l', ra2x, ra2y],
      ['l', ra3x, ra3y],
      ['z'],
    ];

    return { line, arrow };
  }

  /** Get center position of a drawable */
  private getDrawableCenter(drawable: any): [number, number] {
    if (drawable?.center) return drawable.center;
    if (drawable?.from) return drawable.from;
    return [0, 0];
  }
}
