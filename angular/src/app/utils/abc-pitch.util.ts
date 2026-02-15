/**
 * Utility functions for parsing and modifying ABC note pitches.
 *
 * abc2svg diatonic pitch numbering ("pit"):
 *   C,,=2  D,,=3 ... B,,=8   (octave -1)
 *   C,=9   D,=10 ... B,=15   (octave 0, uppercase with comma)
 *   C=16   D=17  ... B=22    (octave 1, uppercase no mark -- but abc2svg uses 9-15 for plain uppercase)
 *   Actually abc2svg: plain uppercase C-B = pit 16-22, lowercase c-b = pit 23-29, c' = pit 30 etc.
 *
 * In practice we only need relative deltas, so the exact base doesn't matter
 * as long as we can convert between ABC text and a pitch number consistently.
 */

/** Parsed components of an ABC note token */
export interface AbcNoteParts {
  prefix: string;      // decorations, accidentals before the letter (e.g. "^", "_", "=")
  letter: string;      // the note letter (A-G or a-g)
  octaveMarks: string; // octave modifiers: commas or apostrophes
  suffix: string;      // duration, ties, etc. after the note
}

const NOTE_RE = /^([_^=]*)?([A-Ga-g])([,']*)(.*)$/;

/** Parse an ABC note token into its components */
export function parseAbcNote(token: string): AbcNoteParts | null {
  const m = token.match(NOTE_RE);
  if (!m) return null;
  return {
    prefix: m[1] || '',
    letter: m[2],
    octaveMarks: m[3] || '',
    suffix: m[4] || '',
  };
}

/** Map note letter to diatonic step within octave (C=0, D=1 ... B=6) */
function letterToStep(letter: string): number {
  const upper = letter.toUpperCase();
  return 'CDEFGAB'.indexOf(upper);
}

/** Convert diatonic step (0-6) to letter in given case */
function stepToLetter(step: number, lowercase: boolean): string {
  const l = 'CDEFGAB'[((step % 7) + 7) % 7];
  return lowercase ? l.toLowerCase() : l;
}

/**
 * Compute a simple diatonic pitch number from ABC note parts.
 * Uppercase letters = octave 1 (pitch 7..13), lowercase = octave 2 (14..20).
 * Each comma lowers by 7, each apostrophe raises by 7.
 */
export function abcNoteToPitch(parts: AbcNoteParts): number {
  const step = letterToStep(parts.letter);
  const isLower = parts.letter >= 'a' && parts.letter <= 'g';
  let octave = isLower ? 2 : 1;
  for (const ch of parts.octaveMarks) {
    if (ch === ',') octave--;
    else if (ch === "'") octave++;
  }
  return octave * 7 + step;
}

/**
 * Convert a diatonic pitch number back to ABC note text.
 * Preserves the accidental prefix and duration suffix.
 */
export function pitchToAbcNote(pitch: number, prefix: string, suffix: string): string {
  const step = ((pitch % 7) + 7) % 7;
  const octave = Math.floor(pitch / 7);

  // Determine letter case and octave marks
  let lowercase: boolean;
  let marks: string;

  if (octave >= 2) {
    lowercase = true;
    marks = "'".repeat(octave - 2);
  } else {
    lowercase = false;
    marks = ','.repeat(1 - octave);
  }

  const letter = stepToLetter(step, lowercase);
  return prefix + letter + marks + suffix;
}

/**
 * Shift an ABC note token by a diatonic delta.
 * Returns the modified token string.
 */
export function shiftNote(token: string, delta: number): string {
  const parts = parseAbcNote(token);
  if (!parts) return token;
  const pitch = abcNoteToPitch(parts);
  return pitchToAbcNote(pitch + delta, parts.prefix, parts.suffix);
}

/**
 * Apply a diatonic pitch delta to the ABC text at the given character range.
 * Handles single notes and chords ([CEG]).
 *
 * @param abcText   Full ABC source text
 * @param startChar Start character index (from abc2svg annotation)
 * @param endChar   End character index
 * @param delta     Diatonic steps to shift (positive = up, negative = down)
 * @returns Modified ABC text
 */
export function applyPitchDelta(
  abcText: string,
  startChar: number,
  endChar: number,
  delta: number
): string {
  if (delta === 0) return abcText;

  const fragment = abcText.substring(startChar, endChar);
  let newFragment: string;

  if (fragment.startsWith('[')) {
    // Chord: shift each note inside brackets
    newFragment = fragment.replace(
      /([_^=]*[A-Ga-g][,']*)([\d\/]*)/g,
      (match, noteCore: string, dur: string) => {
        const parts = parseAbcNote(noteCore);
        if (!parts) return match;
        const pitch = abcNoteToPitch(parts);
        return pitchToAbcNote(pitch + delta, parts.prefix, dur);
      }
    );
  } else {
    // Single note
    newFragment = shiftNote(fragment, delta);
  }

  return abcText.substring(0, startChar) + newFragment + abcText.substring(endChar);
}
