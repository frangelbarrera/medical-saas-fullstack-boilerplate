/**
 * Readiness state (OPS-001): during a graceful shutdown the process stops
 * accepting NEW work before it stops serving in-flight requests, so the
 * load balancer drains it without 5xx noise.
 */
let draining = false;

export const setDraining = (): void => {
  draining = true;
};

export const isDraining = (): boolean => draining;
