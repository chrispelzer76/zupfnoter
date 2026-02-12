/**
 * MIDI playback service ported from harpnote_player.rb.
 * Uses abc2svg play module (AbcPlay + Audio5) for audio generation.
 *
 * Player events are pre-built by ToAudio during parsing (in abc2svg.service.ts)
 * and passed here as a ready-made array — exactly like the Ruby original.
 */
import { Injectable, signal } from '@angular/core';
import { Subject } from 'rxjs';

export interface NoteEvent {
  /** ABC source index (startChar) of the note */
  index: number;
  on: boolean;
}

@Injectable({ providedIn: 'root' })
export class PlayerService {
  readonly playing = signal(false);
  readonly speed = signal(1.0);

  readonly noteOn$ = new Subject<NoteEvent>();
  readonly noteOff$ = new Subject<NoteEvent>();
  readonly songEnd$ = new Subject<void>();

  private audioContext: AudioContext | null = null;
  private abcPlay: any = null;
  private playerEvents: any[] | null = null;

  /** Initialize audio context and abc2svg play module */
  init(): void {
    if (this.abcPlay) return;

    this.audioContext = new AudioContext();

    // Replace the abc2svg.loadjs stub with a real script loader.
    // The bundled abc2svg-1.js has a no-op loadjs that always calls onerror,
    // so soundfont .js files never get loaded.
    const abc2svgGlobal = (window as any)['abc2svg'];
    if (abc2svgGlobal) {
      abc2svgGlobal.loadjs = (fn: string, onsuccess: () => void, onerror: () => void) => {
        const script = document.createElement('script');
        script.src = fn;
        script.onload = () => onsuccess();
        script.onerror = () => {
          console.warn('Failed to load script:', fn);
          if (onerror) onerror();
        };
        document.head.appendChild(script);
      };
    }

    const AbcPlayClass = (window as any)['AbcPlay'];
    if (!AbcPlayClass) {
      console.warn('abc2svg AbcPlay module not loaded');
      return;
    }

    this.abcPlay = new AbcPlayClass({
      ac: this.audioContext,
      sfu: 'assets/soundfont/zupfnoter',
      onend: () => {
        this.playing.set(false);
        this.songEnd$.next();
      },
      onnote: (index: number, on: boolean, _custom: any) => {
        const event: NoteEvent = { index, on };
        if (on) {
          this.noteOn$.next(event);
        } else {
          this.noteOff$.next(event);
        }
      },
      errmsg: (msg: string) => {
        console.warn('Player error:', msg);
      },
    });

    this.abcPlay.set_vol(1.0);
  }

  /** Load pre-built player events (from abc2svg parse → ToAudio) */
  loadEvents(events: any[]): void {
    if (!this.abcPlay) {
      this.init();
    }
    this.playerEvents = events;
  }

  /** Play the loaded events */
  play(): void {
    if (!this.abcPlay || !this.playerEvents) return;

    // Resume AudioContext if suspended (browser autoplay policy)
    if (this.audioContext?.state === 'suspended') {
      this.audioContext.resume();
    }

    this.abcPlay.play(0, 1000000, this.playerEvents);
    this.playing.set(true);
  }

  /** Load events and immediately play */
  playEvents(events: any[]): void {
    this.loadEvents(events);
    this.play();
  }

  /** Stop playback */
  stop(): void {
    if (this.playing()) {
      this.abcPlay?.stop();
    }
    this.playing.set(false);
  }

  /** Set playback speed (1.0 = normal) */
  setSpeed(factor: number): void {
    this.speed.set(factor);
    this.abcPlay?.set_speed(factor);
  }

  /** Set volume (0-1) */
  setVolume(volume: number): void {
    this.abcPlay?.set_vol(volume);
  }
}
