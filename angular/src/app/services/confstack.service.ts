/**
 * Layered configuration stack ported from confstack2.rb.
 *
 * Supports:
 *   - push(hash) / pop() for stacking configuration layers
 *   - Deep key path access: get("layout.X_SPACING")
 *   - Lambda/function resolution with circular-dependency detection
 *   - Caching for performance
 */
import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ConfstackService {
  private confstack: Record<string, any>[] = [{}];
  private lookupCache: Record<string, any> = {};
  private confresultCache = new Map<any, any>();
  private callstack: string[] = [];
  private sourcestack: string[] = [];
  strict = true;
  private name: string;

  constructor() {
    this.name = 'default';
  }

  /** Initialise with an optional name (used for environment key) */
  init(name = 'default'): void {
    this.name = name;
    this.confstack = [{}];
    this.lookupCache = {};
    this.confresultCache.clear();
    this.callstack = [];
    this.sourcestack = [];
  }

  // -----------------------------------------------------------------------
  // Stack operations
  // -----------------------------------------------------------------------

  /** Push a new configuration layer (deep-merged onto the current top). */
  push(hash: Record<string, any> = {}): number {
    this.confresultCache.clear();
    this.lookupCache = {};

    if (hash && typeof hash === 'object' && !Array.isArray(hash)) {
      this.sourcestack.push(new Error().stack?.split('\n')[2]?.trim() ?? '');
      const merged = deepMerge(deepDup(this.confstack[this.confstack.length - 1]), hash);
      this.confstack.push(merged);
    }
    return this.confstack.length;
  }

  /** Remove the topmost configuration layer. */
  pop(): number {
    this.lookupCache = {};
    this.confresultCache.clear();
    this.sourcestack.pop();
    this.confstack.pop();
    return this.confstack.length;
  }

  /** Truncate the stack to a specific level. */
  resetTo(level: number): number {
    this.lookupCache = {};
    this.confresultCache.clear();
    this.sourcestack = this.sourcestack.slice(0, level + 1);
    this.confstack = this.confstack.slice(0, level + 1);
    return this.confstack.length;
  }

  /** Current stack depth */
  get depth(): number {
    return this.confstack.length;
  }

  // -----------------------------------------------------------------------
  // Get / set
  // -----------------------------------------------------------------------

  /**
   * Retrieve a configuration value.
   *
   * @param key   Dot-separated path, e.g. "layout.X_SPACING". If omitted returns entire config.
   * @param resolve  Whether to resolve function values (default true).
   */
  get(key?: string | null, resolve = true): any {
    let result: any;

    if (key == null) {
      result = this.confstack[this.confstack.length - 1];
    } else if (key in this.lookupCache) {
      result = this.lookupCache[key];
    } else {
      result = dig(this.confstack[this.confstack.length - 1], key.split('.'));
      this.lookupCache[key] = result;
      if (result === undefined && this.strict) {
        if (!this.keys().includes(key)) {
          console.error(`confstack: key not available: ${key}`);
        }
      }
    }

    if (resolve) {
      result = this.resolveDependencies(key ?? '', result);
    }
    return result;
  }

  /** Shorthand alias for get(key). */
  $(key: string): any {
    return this.get(key);
  }

  /**
   * Set a value in the topmost stack layer.
   * Supports dotted paths (e.g. "extract.0.title").
   */
  set(key: string, value: any): void {
    this.lookupCache = {};
    this.confresultCache.clear();
    const top = this.confstack[this.confstack.length - 1];
    setDeep(top, key.split('.'), value);
  }

  /** Delete a key from the topmost layer (sets to undefined). */
  delete(key: string): void {
    this.set(key, undefined);
  }

  /** Return all hierarchical key paths present in the current config. */
  keys(): string[] {
    return digKeys(this.confstack[this.confstack.length - 1]);
  }

  // -----------------------------------------------------------------------
  // Dependency resolution (lambdas / functions)
  // -----------------------------------------------------------------------

  private resolveDependencies(key: string, result: any): any {
    if (typeof result === 'function') {
      return this.resolveValueDependency(key, result);
    }
    if (result !== null && typeof result === 'object' && !Array.isArray(result)) {
      return this.resolveHashDependency(key, result);
    }
    if (Array.isArray(result)) {
      return this.resolveArrayDependency(key, result);
    }
    return result;
  }

  private resolveValueDependency(key: string, fn: () => any): any {
    if (this.confresultCache.has(fn)) {
      return this.confresultCache.get(fn);
    }

    if (this.callstack.includes(key)) {
      const loopStart = this.callstack.indexOf(key);
      const loop = this.callstack.slice(loopStart);
      this.callstack = [];
      throw new Error(`Circular conf dependency: ${[...loop, key + ' ...'].join(' -> ')}`);
    }

    this.callstack.push(key);
    const result = fn();
    this.callstack.pop();
    this.confresultCache.set(fn, result);
    return result;
  }

  private resolveHashDependency(key: string, hash: Record<string, any>): Record<string, any> {
    const result: Record<string, any> = {};
    for (const k of Object.keys(hash)) {
      result[k] = this.resolveDependencies(key ? `${key}.${k}` : k, hash[k]);
    }
    return result;
  }

  private resolveArrayDependency(key: string, arr: any[]): any[] {
    return arr.map(item => this.resolveDependencies('', item));
  }
}

// =========================================================================
// Utility functions
// =========================================================================

/** Deep-dig into a nested object following a path array. */
function dig(obj: any, path: string[]): any {
  let current = obj;
  for (const key of path) {
    if (current == null || typeof current !== 'object') return undefined;
    current = current[key];
  }
  return current;
}

/** Set a deep value via path array. */
function setDeep(obj: any, path: string[], value: any): void {
  let current = obj;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    if (current[key] == null || typeof current[key] !== 'object') {
      current[key] = {};
    }
    current = current[key];
  }
  current[path[path.length - 1]] = value;
}

/** Collect all hierarchical dot-separated key paths. */
function digKeys(obj: any, parentKey = ''): string[] {
  const result: string[] = [];
  if (obj == null || typeof obj !== 'object' || Array.isArray(obj)) return result;
  for (const key of Object.keys(obj)) {
    const newKey = parentKey ? `${parentKey}.${key}` : key;
    result.push(newKey);
    if (obj[key] != null && typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
      result.push(...digKeys(obj[key], newKey));
    }
  }
  return result;
}

/** Deep duplicate a value (handles objects, arrays, primitives). */
function deepDup(value: any): any {
  if (value == null) return value;
  if (typeof value === 'function') return value; // keep function refs
  if (Array.isArray(value)) return value.map(deepDup);
  if (typeof value === 'object') {
    const result: Record<string, any> = {};
    for (const key of Object.keys(value)) {
      result[key] = deepDup(value[key]);
    }
    return result;
  }
  return value;
}

/** Deep merge source into target (mutates target). */
function deepMerge(target: Record<string, any>, source: Record<string, any>): Record<string, any> {
  for (const key of Object.keys(source)) {
    const sv = source[key];
    const tv = target[key];
    if (
      sv != null && typeof sv === 'object' && !Array.isArray(sv) && typeof sv !== 'function' &&
      tv != null && typeof tv === 'object' && !Array.isArray(tv) && typeof tv !== 'function'
    ) {
      target[key] = deepMerge(tv, sv);
    } else {
      target[key] = deepDup(sv);
    }
  }
  return target;
}
