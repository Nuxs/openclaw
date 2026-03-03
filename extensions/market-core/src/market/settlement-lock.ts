/**
 * Per-orderId mutex for settlement operations.
 *
 * Prevents TOCTOU race conditions in settlement handlers by ensuring
 * that only one settlement operation (lock / release / refund) can
 * execute concurrently for the same orderId within this process.
 *
 * This is a process-level lock — sufficient for single-instance deployments.
 * Multi-instance deployments should additionally rely on the store-level
 * transaction (SQLite busy_timeout / file lock) as a secondary barrier.
 */

type QueueEntry = {
  resolve: () => void;
};

const orderLocks = new Map<string, Promise<void>>();

/**
 * Acquire an exclusive per-orderId lock, execute `fn`, then release.
 * Concurrent callers for the same orderId are serialized (FIFO).
 *
 * Different orderIds run fully in parallel — no global bottleneck.
 */
export async function withSettlementLock<T>(orderId: string, fn: () => Promise<T>): Promise<T> {
  // Chain behind whatever is currently held for this orderId.
  const prev = orderLocks.get(orderId) ?? Promise.resolve();

  let releaseLock!: () => void;
  const gate = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });

  // Register *our* gate as the new tail before awaiting.
  orderLocks.set(orderId, gate);

  // Wait for previous holder to finish.
  await prev;

  try {
    return await fn();
  } finally {
    // Clean up if we are still the tail (prevents unbounded Map growth).
    if (orderLocks.get(orderId) === gate) {
      orderLocks.delete(orderId);
    }
    releaseLock();
  }
}
