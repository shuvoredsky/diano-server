import crypto from 'crypto';

interface DedupeEntry {
  expiresAt: number;
}

export class ViewCountDeduplicator {
  private cache = new Map<string, DedupeEntry>();
  private readonly defaultWindowMs: number;
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(windowMinutes = 15) {
    this.defaultWindowMs = windowMinutes * 60 * 1000;
    // Periodic cleanup every 10 minutes to prevent unbounded memory growth
    this.cleanupTimer = setInterval(() => this.cleanup(), 10 * 60 * 1000);
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  private generateKey(ip: string, productId: string): string {
    return crypto
      .createHash('sha256')
      .update(`${ip}:${productId}`)
      .digest('hex');
  }

  /**
   * Check if a view should be recorded.
   * If recorded, sets the deduplication window and returns true.
   * If within the active window, returns false.
   */
  shouldCountView(ip: string, productId: string, windowMs?: number): boolean {
    const key = this.generateKey(ip || '127.0.0.1', productId);
    const now = Date.now();
    const existing = this.cache.get(key);

    if (existing && existing.expiresAt > now) {
      return false;
    }

    const ttl = windowMs ?? this.defaultWindowMs;
    this.cache.set(key, { expiresAt: now + ttl });
    return true;
  }

  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt <= now) {
        this.cache.delete(key);
      }
    }
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}

export const viewDeduplicator = new ViewCountDeduplicator();
