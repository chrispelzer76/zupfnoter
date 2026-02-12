/**
 * Internationalization service.
 * Loads translations from locale JSON files (German primary, English fallback).
 */
import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class I18nService {
  private translations: Record<string, string> = {};
  readonly locale = signal('de');
  readonly loaded = signal(false);

  async loadLocale(locale = 'de'): Promise<void> {
    try {
      const response = await fetch(`assets/locale/zupfnoter_${locale}.json`);
      if (response.ok) {
        this.translations = await response.json();
        this.locale.set(locale);
        this.loaded.set(true);
      }
    } catch (e) {
      console.warn(`Failed to load locale ${locale}:`, e);
    }
  }

  /** Translate a key. Returns the key itself if no translation found. */
  t(key: string, ...args: any[]): string {
    let result = this.translations[key] ?? key;
    // Simple positional substitution: %{0}, %{1}, etc.
    args.forEach((arg, i) => {
      result = result.replace(`%{${i}}`, String(arg));
    });
    return result;
  }
}
