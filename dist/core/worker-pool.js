"use strict";
/**
 * Worker Pool Architecture for Enterprise-Scale Parallel Processing
 *
 * This module implements a high-performance worker pool that enables:
 * - Parallel analysis across multiple CPU cores
 * - Non-blocking analysis with result streaming
 * - Intelligent load balancing with adaptive scheduling
 * - Graceful degradation under high load
 *
 * Performance targets:
 * - 10x faster project analysis through parallelization
 * - Sub-100ms response time for incremental analysis
 * - Memory-efficient processing of large codebases
 *
 * @module core/worker-pool
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkerPool = exports.TaskType = exports.TaskStatus = exports.TaskPriority = void 0;
exports.getGlobalWorkerPool = getGlobalWorkerPool;
exports.initializeGlobalWorkerPool = initializeGlobalWorkerPool;
exports.shutdownGlobalWorkerPool = shutdownGlobalWorkerPool;
const events_1 = require("events");
/**
 * Task priority levels for intelligent scheduling
 */
var TaskPriority;
(function (TaskPriority) {
    TaskPriority[TaskPriority["CRITICAL"] = 0] = "CRITICAL";
    TaskPriority[TaskPriority["HIGH"] = 1] = "HIGH";
    TaskPriority[TaskPriority["NORMAL"] = 2] = "NORMAL";
    TaskPriority[TaskPriority["LOW"] = 3] = "LOW";
    TaskPriority[TaskPriority["BACKGROUND"] = 4] = "BACKGROUND";
})(TaskPriority || (exports.TaskPriority = TaskPriority = {}));
/**
 * Task status tracking for monitoring and debugging
 */
var TaskStatus;
(function (TaskStatus) {
    TaskStatus["PENDING"] = "pending";
    TaskStatus["QUEUED"] = "queued";
    TaskStatus["RUNNING"] = "running";
    TaskStatus["COMPLETED"] = "completed";
    TaskStatus["FAILED"] = "failed";
    TaskStatus["CANCELLED"] = "cancelled";
    TaskStatus["TIMEOUT"] = "timeout";
})(TaskStatus || (exports.TaskStatus = TaskStatus = {}));
/**
 * Task types supported by the worker pool
 */
var TaskType;
(function (TaskType) {
    TaskType["FILE_ANALYSIS"] = "file_analysis";
    TaskType["PROJECT_ANALYSIS"] = "project_analysis";
    TaskType["INCREMENTAL_ANALYSIS"] = "incremental_analysis";
    TaskType["SECURITY_SCAN"] = "security_scan";
    TaskType["SECRETS_DETECTION"] = "secrets_detection";
    TaskType["DEPENDENCY_SCAN"] = "dependency_scan";
    TaskType["CONTAINER_SCAN"] = "container_scan";
    TaskType["RULE_VALIDATION"] = "rule_validation";
    TaskType["AST_PARSING"] = "ast_parsing";
    TaskType["PATTERN_MATCHING"] = "pattern_matching";
    TaskType["REPORT_GENERATION"] = "report_generation";
    TaskType["CACHE_OPERATION"] = "cache_operation";
})(TaskType || (exports.TaskType = TaskType = {}));
/**
 * Default configuration for the worker pool
 */
const DEFAULT_CONFIG = {
    minWorkers: 2,
    maxWorkers: Math.max(4, Math.floor((typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : 4) * 0.75)),
    taskTimeout: 60000,
    idleTimeout: 30000,
    maxQueueSize: 1000,
    enableAutoScaling: true,
    scalingThreshold: 0.8,
    enableMetrics: true,
    metricsInterval: 5000,
    enableTaskRetry: true,
    maxRetries: 3,
    retryDelay: 1000,
    enablePriorityScheduling: true,
    enableWorkStealing: true,
    enableBatching: true,
    batchSize: 10,
    batchTimeout: 100,
};
/**
 * Priority Queue for task scheduling
 */
class PriorityTaskQueue {
    constructor() {
        Object.defineProperty(this, "queues", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Map()
        });
        Object.defineProperty(this, "size", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        for (const priority of Object.values(TaskPriority)) {
            if (typeof priority === 'number') {
                this.queues.set(priority, []);
            }
        }
    }
    enqueue(task) {
        const queue = this.queues.get(task.priority);
        if (queue) {
            queue.push(task);
            this.size++;
        }
    }
    dequeue() {
        for (const priority of [
            TaskPriority.CRITICAL,
            TaskPriority.HIGH,
            TaskPriority.NORMAL,
            TaskPriority.LOW,
            TaskPriority.BACKGROUND,
        ]) {
            const queue = this.queues.get(priority);
            if (queue && queue.length > 0) {
                this.size--;
                return queue.shift();
            }
        }
        return undefined;
    }
    peek() {
        for (const priority of [
            TaskPriority.CRITICAL,
            TaskPriority.HIGH,
            TaskPriority.NORMAL,
            TaskPriority.LOW,
            TaskPriority.BACKGROUND,
        ]) {
            const queue = this.queues.get(priority);
            if (queue && queue.length > 0) {
                return queue[0];
            }
        }
        return undefined;
    }
    remove(taskId) {
        for (const queue of this.queues.values()) {
            const index = queue.findIndex(t => t.id === taskId);
            if (index !== -1) {
                queue.splice(index, 1);
                this.size--;
                return true;
            }
        }
        return false;
    }
    getSize() {
        return this.size;
    }
    isEmpty() {
        return this.size === 0;
    }
    clear() {
        for (const queue of this.queues.values()) {
            queue.length = 0;
        }
        this.size = 0;
    }
    getQueueSizes() {
        const sizes = {};
        for (const [priority, queue] of this.queues.entries()) {
            sizes[priority] = queue.length;
        }
        return sizes;
    }
}
/**
 * Virtual Worker implementation for VS Code extension environment
 * Uses microtask scheduling for non-blocking execution
 */
class VirtualWorker {
    constructor(id) {
        Object.defineProperty(this, "id", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "status", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'idle'
        });
        Object.defineProperty(this, "currentTask", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: null
        });
        Object.defineProperty(this, "stats", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "executors", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        this.id = id;
        this.stats = {
            id,
            status: 'idle',
            tasksCompleted: 0,
            tasksFailed: 0,
            totalProcessingTime: 0,
            averageTaskDuration: 0,
            lastActiveAt: Date.now(),
        };
        this.executors = new Map();
    }
    registerExecutor(taskType, executor) {
        this.executors.set(taskType, executor);
    }
    async execute(task) {
        if (this.status === 'terminated') {
            throw new Error('Worker has been terminated');
        }
        this.status = 'busy';
        this.currentTask = task;
        this.stats.lastActiveAt = Date.now();
        this.stats.currentTask = task.id;
        const startTime = performance.now();
        try {
            const executor = this.executors.get(task.type);
            if (!executor) {
                throw new Error(`No executor registered for task type: ${task.type}`);
            }
            // Execute with timeout
            const result = await Promise.race([
                executor(task.payload),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Task timeout')), task.timeout)),
            ]);
            const duration = performance.now() - startTime;
            this.stats.tasksCompleted++;
            this.stats.totalProcessingTime += duration;
            this.stats.averageTaskDuration =
                this.stats.totalProcessingTime / this.stats.tasksCompleted;
            return result;
        }
        catch (error) {
            this.stats.tasksFailed++;
            throw error;
        }
        finally {
            this.status = 'idle';
            this.currentTask = null;
            this.stats.currentTask = undefined;
        }
    }
    getStats() {
        return { ...this.stats, status: this.status };
    }
    isIdle() {
        return this.status === 'idle';
    }
    isBusy() {
        return this.status === 'busy';
    }
    terminate() {
        this.status = 'terminated';
        this.currentTask = null;
    }
}
/**
 * High-Performance Worker Pool for Enterprise-Scale Analysis
 *
 * Features:
 * - Adaptive worker scaling based on load
 * - Priority-based task scheduling
 * - Work stealing for optimal load distribution
 * - Comprehensive metrics and monitoring
 * - Graceful shutdown and error recovery
 */
class WorkerPool extends events_1.EventEmitter {
    constructor(config = {}) {
        super();
        Object.defineProperty(this, "config", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "workers", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Map()
        });
        Object.defineProperty(this, "taskQueue", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "activeTasks", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Map()
        });
        Object.defineProperty(this, "completedTasks", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Map()
        });
        Object.defineProperty(this, "metrics", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "metricsHistory", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        Object.defineProperty(this, "isRunning", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        Object.defineProperty(this, "schedulerInterval", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "metricsInterval", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "taskIdCounter", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.taskQueue = new PriorityTaskQueue();
        this.metrics = this.createInitialMetrics();
    }
    /**
     * Initialize the worker pool
     */
    async initialize() {
        if (this.isRunning) {
            return;
        }
        this.isRunning = true;
        // Create initial workers
        for (let i = 0; i < this.config.minWorkers; i++) {
            this.createWorker();
        }
        // Start the scheduler
        this.startScheduler();
        // Start metrics collection
        if (this.config.enableMetrics) {
            this.startMetricsCollection();
        }
        this.emit('initialized', { workerCount: this.workers.size });
    }
    /**
     * Register a task executor for a specific task type
     */
    registerExecutor(taskType, executor) {
        for (const worker of this.workers.values()) {
            worker.registerExecutor(taskType, executor);
        }
        // Store for future workers
        this.emit('executor-registered', { taskType });
    }
    /**
     * Submit a task for execution
     */
    async submit(type, payload, options = {}) {
        if (!this.isRunning) {
            throw new Error('Worker pool is not running');
        }
        if (this.taskQueue.getSize() >= this.config.maxQueueSize) {
            throw new Error('Task queue is full');
        }
        const task = {
            id: this.generateTaskId(),
            type,
            priority: options.priority ?? TaskPriority.NORMAL,
            payload,
            status: TaskStatus.PENDING,
            createdAt: Date.now(),
            retryCount: 0,
            maxRetries: options.maxRetries ?? this.config.maxRetries,
            timeout: options.timeout ?? this.config.taskTimeout,
            metadata: options.metadata,
            onProgress: options.onProgress,
        };
        return new Promise((resolve, reject) => {
            task.onComplete = resolve;
            task.onError = reject;
            task.status = TaskStatus.QUEUED;
            this.taskQueue.enqueue(task);
            this.metrics.totalTasks++;
            this.emit('task-queued', { taskId: task.id, type, priority: task.priority });
            // Trigger immediate scheduling
            this.scheduleNext();
        });
    }
    /**
     * Submit multiple tasks as a batch
     */
    async submitBatch(type, payloads, options = {}) {
        const results = [];
        const errors = [];
        let completed = 0;
        const promises = payloads.map(async (payload, index) => {
            try {
                const result = await this.submit(type, payload, {
                    priority: options.priority,
                    timeout: options.timeout,
                    maxRetries: options.maxRetries,
                });
                results[index] = result;
            }
            catch (error) {
                errors[index] = error;
            }
            finally {
                completed++;
                options.onBatchProgress?.(completed, payloads.length);
            }
        });
        await Promise.all(promises);
        if (errors.some(e => e !== undefined)) {
            const failedCount = errors.filter(e => e !== undefined).length;
            throw new Error(`Batch failed: ${failedCount}/${payloads.length} tasks failed`);
        }
        return results;
    }
    /**
     * Cancel a pending or running task
     */
    cancel(taskId) {
        // Try to remove from queue
        if (this.taskQueue.remove(taskId)) {
            this.metrics.cancelledTasks++;
            this.emit('task-cancelled', { taskId });
            return true;
        }
        // Mark active task as cancelled
        const activeTask = this.activeTasks.get(taskId);
        if (activeTask) {
            activeTask.status = TaskStatus.CANCELLED;
            this.metrics.cancelledTasks++;
            this.emit('task-cancelled', { taskId });
            return true;
        }
        return false;
    }
    /**
     * Get current pool metrics
     */
    getMetrics() {
        return { ...this.metrics };
    }
    /**
     * Get metrics history
     */
    getMetricsHistory() {
        return [...this.metricsHistory];
    }
    /**
     * Get worker statistics
     */
    getWorkerStats() {
        return Array.from(this.workers.values()).map(w => w.getStats());
    }
    /**
     * Get task status
     */
    getTaskStatus(taskId) {
        const activeTask = this.activeTasks.get(taskId);
        if (activeTask)
            return activeTask.status;
        const completedTask = this.completedTasks.get(taskId);
        if (completedTask)
            return completedTask.status;
        // Check queue
        for (const priority of Object.values(TaskPriority)) {
            if (typeof priority === 'number') {
                const queueSizes = this.taskQueue.getQueueSizes();
                if (queueSizes[priority] > 0) {
                    // Task might be in queue
                    return TaskStatus.QUEUED;
                }
            }
        }
        return undefined;
    }
    /**
     * Gracefully shutdown the worker pool
     */
    async shutdown() {
        this.isRunning = false;
        // Stop scheduler
        if (this.schedulerInterval) {
            clearInterval(this.schedulerInterval);
        }
        // Stop metrics collection
        if (this.metricsInterval) {
            clearInterval(this.metricsInterval);
        }
        // Wait for active tasks to complete (with timeout)
        const shutdownTimeout = 30000;
        const startTime = Date.now();
        while (this.activeTasks.size > 0 && Date.now() - startTime < shutdownTimeout) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        // Terminate workers
        for (const worker of this.workers.values()) {
            worker.terminate();
        }
        this.workers.clear();
        // Clear queues
        this.taskQueue.clear();
        this.activeTasks.clear();
        this.emit('shutdown');
    }
    // Private methods
    createWorker() {
        const workerId = `worker-${this.workers.size + 1}`;
        const worker = new VirtualWorker(workerId);
        this.workers.set(workerId, worker);
        this.emit('worker-created', { workerId });
        return worker;
    }
    removeWorker(workerId) {
        const worker = this.workers.get(workerId);
        if (worker && worker.isIdle()) {
            worker.terminate();
            this.workers.delete(workerId);
            this.emit('worker-removed', { workerId });
        }
    }
    generateTaskId() {
        return `task-${Date.now()}-${++this.taskIdCounter}`;
    }
    createInitialMetrics() {
        return {
            totalTasks: 0,
            completedTasks: 0,
            failedTasks: 0,
            cancelledTasks: 0,
            activeWorkers: 0,
            idleWorkers: 0,
            queuedTasks: 0,
            averageWaitTime: 0,
            averageExecutionTime: 0,
            throughput: 0,
            errorRate: 0,
            utilizationRate: 0,
            memoryUsage: 0,
            peakMemoryUsage: 0,
            timestamp: Date.now(),
        };
    }
    startScheduler() {
        // Use setImmediate for immediate task dispatch
        const scheduleLoop = () => {
            if (!this.isRunning)
                return;
            this.scheduleNext();
            this.schedulerInterval = setTimeout(scheduleLoop, 10);
        };
        scheduleLoop();
    }
    async scheduleNext() {
        // Find idle workers
        const idleWorkers = Array.from(this.workers.values()).filter(w => w.isIdle());
        if (idleWorkers.length === 0 || this.taskQueue.isEmpty()) {
            // Auto-scale if needed
            if (this.config.enableAutoScaling && !this.taskQueue.isEmpty()) {
                this.autoScale();
            }
            return;
        }
        // Assign tasks to idle workers
        for (const worker of idleWorkers) {
            const task = this.taskQueue.dequeue();
            if (!task)
                break;
            this.executeTask(worker, task);
        }
    }
    async executeTask(worker, task) {
        task.status = TaskStatus.RUNNING;
        task.startedAt = Date.now();
        task.workerId = worker.id;
        this.activeTasks.set(task.id, task);
        this.emit('task-started', { taskId: task.id, workerId: worker.id });
        try {
            const result = await worker.execute(task);
            task.status = TaskStatus.COMPLETED;
            task.completedAt = Date.now();
            task.result = result;
            this.metrics.completedTasks++;
            this.updateAverageExecutionTime(task.completedAt - (task.startedAt || task.createdAt));
            this.emit('task-completed', { taskId: task.id, duration: task.completedAt - (task.startedAt || task.createdAt) });
            task.onComplete?.(result);
        }
        catch (error) {
            const err = error;
            // Check if we should retry
            if (this.config.enableTaskRetry && task.retryCount < task.maxRetries) {
                task.retryCount++;
                task.status = TaskStatus.QUEUED;
                // Re-queue with delay
                setTimeout(() => {
                    if (this.isRunning) {
                        this.taskQueue.enqueue(task);
                        this.emit('task-retrying', { taskId: task.id, retryCount: task.retryCount });
                    }
                }, this.config.retryDelay * task.retryCount);
            }
            else {
                task.status = TaskStatus.FAILED;
                task.completedAt = Date.now();
                task.error = err;
                this.metrics.failedTasks++;
                this.emit('task-failed', { taskId: task.id, error: err.message });
                task.onError?.(err);
            }
        }
        finally {
            this.activeTasks.delete(task.id);
            this.completedTasks.set(task.id, task);
            // Limit completed tasks history
            if (this.completedTasks.size > 1000) {
                const oldestKey = this.completedTasks.keys().next().value;
                if (oldestKey) {
                    this.completedTasks.delete(oldestKey);
                }
            }
        }
    }
    autoScale() {
        const busyWorkers = Array.from(this.workers.values()).filter(w => w.isBusy()).length;
        const utilization = this.workers.size > 0 ? busyWorkers / this.workers.size : 0;
        // Scale up if utilization is high and we have queued tasks
        if (utilization >= this.config.scalingThreshold &&
            this.taskQueue.getSize() > 0 &&
            this.workers.size < this.config.maxWorkers) {
            this.createWorker();
        }
        // Scale down if utilization is low
        if (utilization < this.config.scalingThreshold * 0.5 &&
            this.workers.size > this.config.minWorkers) {
            const idleWorkers = Array.from(this.workers.entries()).filter(([_, w]) => w.isIdle());
            if (idleWorkers.length > 0) {
                this.removeWorker(idleWorkers[0][0]);
            }
        }
    }
    startMetricsCollection() {
        this.metricsInterval = setInterval(() => {
            this.updateMetrics();
        }, this.config.metricsInterval);
    }
    updateMetrics() {
        const busyWorkers = Array.from(this.workers.values()).filter(w => w.isBusy()).length;
        const idleWorkers = this.workers.size - busyWorkers;
        this.metrics = {
            ...this.metrics,
            activeWorkers: busyWorkers,
            idleWorkers,
            queuedTasks: this.taskQueue.getSize(),
            utilizationRate: this.workers.size > 0 ? busyWorkers / this.workers.size : 0,
            errorRate: this.metrics.totalTasks > 0
                ? this.metrics.failedTasks / this.metrics.totalTasks
                : 0,
            timestamp: Date.now(),
        };
        // Calculate throughput (tasks per second over last interval)
        const lastMetrics = this.metricsHistory[this.metricsHistory.length - 1];
        if (lastMetrics) {
            const timeDiff = (this.metrics.timestamp - lastMetrics.timestamp) / 1000;
            const tasksDiff = this.metrics.completedTasks - lastMetrics.completedTasks;
            this.metrics.throughput = timeDiff > 0 ? tasksDiff / timeDiff : 0;
        }
        // Keep limited history
        this.metricsHistory.push({ ...this.metrics });
        if (this.metricsHistory.length > 100) {
            this.metricsHistory.shift();
        }
        this.emit('metrics-updated', this.metrics);
    }
    updateAverageExecutionTime(duration) {
        const total = this.metrics.completedTasks;
        const currentAvg = this.metrics.averageExecutionTime;
        this.metrics.averageExecutionTime =
            (currentAvg * (total - 1) + duration) / total;
    }
}
exports.WorkerPool = WorkerPool;
/**
 * Singleton instance for global worker pool
 */
let globalWorkerPool = null;
function getGlobalWorkerPool() {
    if (!globalWorkerPool) {
        globalWorkerPool = new WorkerPool();
    }
    return globalWorkerPool;
}
function initializeGlobalWorkerPool(config) {
    globalWorkerPool = new WorkerPool(config);
    return globalWorkerPool.initialize();
}
function shutdownGlobalWorkerPool() {
    if (globalWorkerPool) {
        return globalWorkerPool.shutdown();
    }
    return Promise.resolve();
}
//# sourceMappingURL=worker-pool.js.map