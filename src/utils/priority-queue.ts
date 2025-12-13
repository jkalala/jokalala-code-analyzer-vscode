/**
 * Priority Queue Implementation
 * Used for managing analysis requests with priority support
 */

import { Priority } from '../types'

export interface PriorityQueueItem<T> {
  item: T
  priority: Priority
  timestamp: Date
}

/**
 * Priority Queue with support for low, normal, and high priorities
 * Items with higher priority are dequeued first
 * Items with same priority are dequeued in FIFO order
 */
export class PriorityQueue<T> {
  private items: PriorityQueueItem<T>[] = []

  /**
   * Add an item to the queue
   */
  enqueue(item: T, priority: Priority = 'normal'): void {
    const queueItem: PriorityQueueItem<T> = {
      item,
      priority,
      timestamp: new Date(),
    }

    // Find the correct position to insert based on priority
    const priorityValue = this.getPriorityValue(priority)
    let inserted = false

    for (let i = 0; i < this.items.length; i++) {
      const item = this.items[i]
      if (!item) continue

      const currentPriorityValue = this.getPriorityValue(item.priority)

      if (priorityValue > currentPriorityValue) {
        this.items.splice(i, 0, queueItem)
        inserted = true
        break
      }
    }

    if (!inserted) {
      this.items.push(queueItem)
    }
  }

  /**
   * Remove and return the highest priority item
   */
  dequeue(): T | undefined {
    const queueItem = this.items.shift()
    return queueItem?.item
  }

  /**
   * View the highest priority item without removing it
   */
  peek(): T | undefined {
    return this.items[0]?.item
  }

  /**
   * Check if the queue is empty
   */
  isEmpty(): boolean {
    return this.items.length === 0
  }

  /**
   * Get the number of items in the queue
   */
  size(): number {
    return this.items.length
  }

  /**
   * Clear all items from the queue
   */
  clear(): void {
    this.items = []
  }

  /**
   * Get all items in the queue (for inspection)
   */
  getAll(): PriorityQueueItem<T>[] {
    return [...this.items]
  }

  /**
   * Remove a specific item from the queue
   */
  remove(predicate: (item: T) => boolean): boolean {
    const index = this.items.findIndex(queueItem => predicate(queueItem.item))
    if (index !== -1) {
      this.items.splice(index, 1)
      return true
    }
    return false
  }

  /**
   * Convert priority to numeric value for comparison
   */
  private getPriorityValue(priority: Priority): number {
    switch (priority) {
      case 'high':
        return 3
      case 'normal':
        return 2
      case 'low':
        return 1
      default:
        return 2
    }
  }
}
