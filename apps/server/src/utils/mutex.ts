/**
 * A minimal FIFO async mutex. Used to serialize runtime-mutating operations
 * (execute / localnet control) so two requests can't race Anvil ownership.
 */
export class Mutex {
  private tail: Promise<void> = Promise.resolve();

  runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.tail.then(fn, fn);
    // Keep the chain alive regardless of fn's outcome.
    this.tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }
}
