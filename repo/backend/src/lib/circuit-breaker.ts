// @ts-ignore -- no type declarations available for opossum
import CircuitBreaker from 'opossum';
import { config } from '../config';
import { logger } from './logger';

const breakers = new Map<string, CircuitBreaker>();

/**
 * Returns (or creates) a named circuit breaker wrapping the given async function.
 * Designed for carrier connector and other on-prem external calls.
 */
export function getCircuitBreaker<T>(
  name: string,
  fn: (...args: unknown[]) => Promise<T>
): CircuitBreaker<unknown[], T> {
  if (breakers.has(name)) {
    return breakers.get(name) as CircuitBreaker<unknown[], T>;
  }

  const breaker = new CircuitBreaker(fn, {
    name,
    timeout: config.circuitBreaker.timeout,
    errorThresholdPercentage: config.circuitBreaker.errorThresholdPercentage,
    resetTimeout: config.circuitBreaker.resetTimeout,
    volumeThreshold: 5,
  });

  breaker.on('open', () =>
    logger.warn({ msg: `Circuit breaker OPEN`, circuit: name })
  );
  breaker.on('halfOpen', () =>
    logger.info({ msg: `Circuit breaker HALF-OPEN`, circuit: name })
  );
  breaker.on('close', () =>
    logger.info({ msg: `Circuit breaker CLOSED (recovered)`, circuit: name })
  );
  breaker.on('fallback', (result: any) =>
    logger.warn({ msg: `Circuit breaker fallback triggered`, circuit: name, result })
  );
  breaker.on('reject', () =>
    logger.warn({ msg: `Circuit breaker rejected request`, circuit: name })
  );

  breakers.set(name, breaker as CircuitBreaker);
  return breaker;
}

export function getAllBreakerStats(): Record<string, object> {
  const stats: Record<string, object> = {};
  breakers.forEach((breaker, name) => {
    stats[name] = breaker.stats;
  });
  return stats;
}
