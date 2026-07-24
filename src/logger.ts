import pino from 'pino';
import { env } from './config.js';

export const logger = pino({
  level: env.logLevel,
  base: { app: 'air4-intelligence' },
  timestamp: pino.stdTimeFunctions.isoTime,
});

/** Collects errors during a run so the pipeline can degrade instead of dying. */
export class RunErrors {
  private readonly items: string[] = [];

  capture(scope: string, err: unknown): void {
    const msg = err instanceof Error ? err.message : String(err);
    const line = `[${scope}] ${msg}`;
    this.items.push(line);
    logger.warn({ scope, err: msg }, 'recoverable error');
  }

  list(): string[] {
    return [...this.items];
  }

  get count(): number {
    return this.items.length;
  }
}
