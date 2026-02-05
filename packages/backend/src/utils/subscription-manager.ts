/**
 * Generic subscription manager for Socket.io room tracking
 * Eliminates duplicated subscription logic across namespaces
 */
export class SubscriptionManager<TKey = string> {
  private subscriptions = new Map<TKey, Set<string>>()
  private onEmptyCallback?: (key: TKey) => void

  constructor(onEmpty?: (key: TKey) => void) {
    this.onEmptyCallback = onEmpty
  }

  add(key: TKey, socketId: string): void {
    if (!this.subscriptions.has(key)) {
      this.subscriptions.set(key, new Set())
    }
    this.subscriptions.get(key)?.add(socketId)
  }

  remove(key: TKey, socketId: string): boolean {
    const subs = this.subscriptions.get(key)
    if (subs) {
      subs.delete(socketId)
      if (subs.size === 0) {
        this.subscriptions.delete(key)
        this.onEmptyCallback?.(key)
        return true // Indicates the subscription is now empty
      }
    }
    return false
  }

  get(key: TKey): Set<string> | undefined {
    return this.subscriptions.get(key)
  }

  getCount(key: TKey): number {
    return this.subscriptions.get(key)?.size ?? 0
  }

  has(key: TKey): boolean {
    return this.subscriptions.has(key)
  }

  cleanupSocket(socketId: string): TKey[] {
    const emptiedKeys: TKey[] = []
    for (const [key, sockets] of this.subscriptions.entries()) {
      sockets.delete(socketId)
      if (sockets.size === 0) {
        this.subscriptions.delete(key)
        this.onEmptyCallback?.(key)
        emptiedKeys.push(key)
      }
    }
    return emptiedKeys
  }

  getAllCounts(): Map<TKey, number> {
    const result = new Map<TKey, number>()
    for (const [key, sockets] of this.subscriptions.entries()) {
      result.set(key, sockets.size)
    }
    return result
  }

  keys(): IterableIterator<TKey> {
    return this.subscriptions.keys()
  }

  clear(): void {
    this.subscriptions.clear()
  }
}
