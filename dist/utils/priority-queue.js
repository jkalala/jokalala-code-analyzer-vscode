"use strict";
/**
 * Priority Queue Implementation
 * Used for managing analysis requests with priority support
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PriorityQueue = void 0;
/**
 * Priority Queue with support for low, normal, and high priorities
 * Items with higher priority are dequeued first
 * Items with same priority are dequeued in FIFO order
 */
class PriorityQueue {
    constructor() {
        Object.defineProperty(this, "items", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
    }
    /**
     * Add an item to the queue
     */
    enqueue(item, priority = 'normal') {
        const queueItem = {
            item,
            priority,
            timestamp: new Date(),
        };
        // Find the correct position to insert based on priority
        const priorityValue = this.getPriorityValue(priority);
        let inserted = false;
        for (let i = 0; i < this.items.length; i++) {
            const item = this.items[i];
            if (!item)
                continue;
            const currentPriorityValue = this.getPriorityValue(item.priority);
            if (priorityValue > currentPriorityValue) {
                this.items.splice(i, 0, queueItem);
                inserted = true;
                break;
            }
        }
        if (!inserted) {
            this.items.push(queueItem);
        }
    }
    /**
     * Remove and return the highest priority item
     */
    dequeue() {
        const queueItem = this.items.shift();
        return queueItem?.item;
    }
    /**
     * View the highest priority item without removing it
     */
    peek() {
        return this.items[0]?.item;
    }
    /**
     * Check if the queue is empty
     */
    isEmpty() {
        return this.items.length === 0;
    }
    /**
     * Get the number of items in the queue
     */
    size() {
        return this.items.length;
    }
    /**
     * Clear all items from the queue
     */
    clear() {
        this.items = [];
    }
    /**
     * Get all items in the queue (for inspection)
     */
    getAll() {
        return [...this.items];
    }
    /**
     * Remove a specific item from the queue
     */
    remove(predicate) {
        const index = this.items.findIndex(queueItem => predicate(queueItem.item));
        if (index !== -1) {
            this.items.splice(index, 1);
            return true;
        }
        return false;
    }
    /**
     * Convert priority to numeric value for comparison
     */
    getPriorityValue(priority) {
        switch (priority) {
            case 'high':
                return 3;
            case 'normal':
                return 2;
            case 'low':
                return 1;
            default:
                return 2;
        }
    }
}
exports.PriorityQueue = PriorityQueue;
//# sourceMappingURL=priority-queue.js.map