/** One job at a time; at most `maxDepth` jobs waiting or running. */
export class JobQueue {
  readonly #maxDepth: number;
  #depth = 0;
  #tail: Promise<unknown> = Promise.resolve();

  constructor(maxDepth: number) {
    this.#maxDepth = maxDepth;
  }

  get depth(): number {
    return this.#depth;
  }

  /** Returns undefined when the queue is full. */
  run<T>(job: () => Promise<T>): Promise<T> | undefined {
    if (this.#depth >= this.#maxDepth) return undefined;
    this.#depth++;
    const result = this.#tail.then(job, job);
    this.#tail = result.catch(() => undefined).finally(() => {
      this.#depth--;
    });
    return result;
  }
}
