// @ts-ignore -- no type declarations available for opossum
import CircuitBreaker from 'opossum';
import { config } from '../config';
import { logger } from './logger';
import { emitToNamespace } from './socket';

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
    volumeThreshold: config.circuitBreaker.volumeThreshold,
    rollingCountTimeout: config.circuitBreaker.rollingCountTimeout,
    rollingCountBuckets: config.circuitBreaker.rollingCountBuckets,
  });

  breaker.on('open', () => {
    const message = `Circuit breaker opened for ${name}; sync attempts are temporarily paused`;
    logger.warn({ msg: 'Circuit breaker OPEN', circuit: name });
    emitToNamespace('/alerts', 'system:alert', {
      message,
      circuit: name,
      state: 'open',
      timestamp: new Date().toISOString(),
    });
  });
  breaker.on('halfOpen', () =>
    logger.info({ msg: `Circuit breaker HALF-OPEN`, circuit: name })
  );
  breaker.on('close', () => {
    const message = `Circuit breaker recovered for ${name}; sync attempts resumed`;
    logger.info({ msg: 'Circuit breaker CLOSED (recovered)', circuit: name });
    emitToNamespace('/alerts', 'system:alert', {
      message,
      circuit: name,
      state: 'closed',
      timestamp: new Date().toISOString(),
    });
  });
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
