"use strict";
/// <reference types="mocha" />
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const assert = __importStar(require("assert"));
const vscode = __importStar(require("vscode"));
const logger_interface_1 = require("../interfaces/logger.interface");
const logger_1 = require("../services/logger");
// ── Minimal spy helper (replaces jest.fn()) ───────────────────────────────────
function makeSpy(impl) {
    const calls = [];
    const spy = (...args) => {
        calls.push(args);
        return impl ? impl(...args) : undefined;
    };
    spy.calls = calls;
    spy.callCount = () => calls.length;
    spy.clear = () => { calls.splice(0, calls.length); };
    spy.lastCall = () => calls[calls.length - 1];
    return spy;
}
suite('Logger', () => {
    let logger;
    let appendLineSpy;
    let clearSpy;
    let disposeSpy;
    // Originals saved for restore
    let origCreateOutputChannel;
    let origConsoleLog;
    let origConsoleDebug;
    let origConsoleWarn;
    let origConsoleError;
    setup(() => {
        appendLineSpy = makeSpy();
        clearSpy = makeSpy();
        disposeSpy = makeSpy();
        const mockChannel = {
            name: 'Jokalala',
            appendLine: appendLineSpy,
            append: () => { },
            clear: clearSpy,
            dispose: disposeSpy,
            show: () => { },
            hide: () => { },
            replace: () => { },
        };
        // Patch vscode.window.createOutputChannel
        origCreateOutputChannel = vscode.window.createOutputChannel;
        vscode.window.createOutputChannel = () => mockChannel;
        // Silence console noise during tests
        origConsoleLog = console.log;
        origConsoleDebug = console.debug;
        origConsoleWarn = console.warn;
        origConsoleError = console.error;
        console.log = () => { };
        console.debug = () => { };
        console.warn = () => { };
        console.error = () => { };
        logger = new logger_1.Logger();
        // Set to Debug so all tests see all log levels by default.
        // Clear the spy afterwards so setLevel's own log entry doesn't
        // appear in tests that check calls[0].
        logger.setLevel(logger_interface_1.LogLevel.Debug);
        appendLineSpy.clear();
    });
    teardown(() => {
        logger.dispose();
        vscode.window.createOutputChannel = origCreateOutputChannel;
        console.log = origConsoleLog;
        console.debug = origConsoleDebug;
        console.warn = origConsoleWarn;
        console.error = origConsoleError;
        appendLineSpy.clear();
    });
    suite('Basic Logging', () => {
        test('should log debug messages', () => {
            logger.debug('Debug message');
            assert.ok(appendLineSpy.callCount() > 0, 'appendLine should be called');
        });
        test('should log info messages', () => {
            logger.info('Info message');
            assert.ok(appendLineSpy.callCount() > 0, 'appendLine should be called');
        });
        test('should log warning messages', () => {
            logger.warn('Warning message');
            assert.ok(appendLineSpy.callCount() > 0, 'appendLine should be called');
        });
        test('should log error messages', () => {
            logger.error('Error message');
            assert.ok(appendLineSpy.callCount() > 0, 'appendLine should be called');
        });
        test('should log error messages with error object', () => {
            const error = new Error('Test error');
            logger.error('Error occurred', error);
            assert.ok(appendLineSpy.callCount() > 0, 'appendLine should be called');
            const loggedMessage = appendLineSpy.calls[0]?.[0];
            assert.ok(loggedMessage.includes('Test error'), 'Should include error message');
        });
        test('should log messages with context', () => {
            const context = { userId: '123', action: 'test' };
            logger.info('Message with context', context);
            const loggedMessage = appendLineSpy.calls[0]?.[0];
            assert.ok(loggedMessage.includes('userId'), 'Should include userId key');
            assert.ok(loggedMessage.includes('123'), 'Should include userId value');
        });
    });
    suite('Log Level Filtering', () => {
        test('should filter debug messages when level is Info', () => {
            logger.setLevel(logger_interface_1.LogLevel.Info);
            appendLineSpy.clear();
            logger.debug('Debug message');
            assert.strictEqual(appendLineSpy.callCount(), 0, 'Debug should be filtered at Info level');
        });
        test('should allow info messages when level is Info', () => {
            logger.setLevel(logger_interface_1.LogLevel.Info);
            appendLineSpy.clear();
            logger.info('Info message');
            assert.ok(appendLineSpy.callCount() > 0, 'Info should pass at Info level');
        });
        test('should filter info and debug when level is Warn', () => {
            logger.setLevel(logger_interface_1.LogLevel.Warn);
            appendLineSpy.clear();
            logger.debug('Debug message');
            logger.info('Info message');
            assert.strictEqual(appendLineSpy.callCount(), 0, 'Debug/Info should be filtered at Warn level');
        });
        test('should allow warnings when level is Warn', () => {
            logger.setLevel(logger_interface_1.LogLevel.Warn);
            appendLineSpy.clear();
            logger.warn('Warning message');
            assert.ok(appendLineSpy.callCount() > 0, 'Warn should pass at Warn level');
        });
        test('should only allow errors when level is Error', () => {
            logger.setLevel(logger_interface_1.LogLevel.Error);
            appendLineSpy.clear();
            logger.debug('Debug message');
            logger.info('Info message');
            logger.warn('Warning message');
            assert.strictEqual(appendLineSpy.callCount(), 0, 'Debug/Info/Warn should be filtered at Error level');
            logger.error('Error message');
            assert.ok(appendLineSpy.callCount() > 0, 'Error should pass at Error level');
        });
        test('should get current log level', () => {
            logger.setLevel(logger_interface_1.LogLevel.Warn);
            assert.strictEqual(logger.getLevel(), logger_interface_1.LogLevel.Warn);
        });
    });
    suite('Performance Metrics', () => {
        test('should log performance metrics', () => {
            logger.setLevel(logger_interface_1.LogLevel.Debug);
            appendLineSpy.clear();
            logger.logMetric('test-operation', 150, 'ms');
            assert.ok(appendLineSpy.callCount() > 0, 'Should log metric');
            const loggedMessage = appendLineSpy.calls[0]?.[0];
            assert.ok(loggedMessage.includes('METRIC'), 'Should include METRIC label');
            assert.ok(loggedMessage.includes('test-operation'), 'Should include operation name');
            assert.ok(loggedMessage.includes('150ms'), 'Should include value and unit');
        });
        test('should not log metrics when level is above Debug', () => {
            logger.setLevel(logger_interface_1.LogLevel.Info);
            appendLineSpy.clear();
            logger.logMetric('test-operation', 150, 'ms');
            assert.strictEqual(appendLineSpy.callCount(), 0, 'Metrics should be filtered above Debug');
        });
        test('should use default unit of ms', () => {
            logger.setLevel(logger_interface_1.LogLevel.Debug);
            appendLineSpy.clear();
            logger.logMetric('test-operation', 150);
            const loggedMessage = appendLineSpy.calls[0]?.[0];
            assert.ok(loggedMessage.includes('150ms'), 'Should default to ms unit');
        });
        test('should start and stop timer', () => {
            logger.setLevel(logger_interface_1.LogLevel.Debug);
            appendLineSpy.clear();
            const stopTimer = logger.startTimer('test-timer');
            stopTimer();
            assert.ok(appendLineSpy.callCount() > 0, 'Should log timer result');
            const loggedMessage = appendLineSpy.calls[0]?.[0];
            assert.ok(loggedMessage.includes('test-timer'), 'Should include timer name');
        });
    });
    suite('Log Management', () => {
        test('should clear logs', () => {
            logger.info('Test message');
            logger.clear();
            assert.ok(clearSpy.callCount() > 0, 'clear() should be called on channel');
        });
        test('should export logs', async () => {
            logger.info('Test message 1');
            logger.warn('Test message 2');
            logger.error('Test message 3');
            const exported = await logger.export();
            assert.ok(exported.includes('Jokalala Code Analysis Logs'), 'Should include header');
            assert.ok(exported.includes('Test message 1'), 'Should include info message');
            assert.ok(exported.includes('Test message 2'), 'Should include warn message');
            assert.ok(exported.includes('Test message 3'), 'Should include error message');
        });
        test('should export performance metrics', async () => {
            logger.setLevel(logger_interface_1.LogLevel.Debug);
            logger.logMetric('operation-1', 100, 'ms');
            logger.logMetric('operation-2', 200, 'ms');
            const exported = await logger.export();
            assert.ok(exported.includes('Performance Metrics'), 'Should include metrics section');
            assert.ok(exported.includes('operation-1'), 'Should include first metric');
            assert.ok(exported.includes('operation-2'), 'Should include second metric');
        });
        test('should dispose resources', () => {
            logger.dispose();
            assert.ok(disposeSpy.callCount() > 0, 'dispose() should be called on channel');
        });
    });
    suite('Log Entry Formatting', () => {
        test('should include timestamp in log entries', () => {
            logger.info('Test message');
            const loggedMessage = appendLineSpy.calls[0]?.[0];
            assert.ok(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(loggedMessage), 'Should include ISO timestamp');
        });
        test('should include log level in log entries', () => {
            logger.info('Test message');
            const loggedMessage = appendLineSpy.calls[0]?.[0];
            assert.ok(loggedMessage.includes('[INFO]'), 'Should include log level');
        });
        test('should format error stack traces', () => {
            const error = new Error('Test error');
            logger.error('Error occurred', error);
            const loggedMessage = appendLineSpy.calls[0]?.[0];
            assert.ok(loggedMessage.includes('Error:'), 'Should include Error label');
            assert.ok(loggedMessage.includes('Stack:'), 'Should include Stack label');
        });
        test('should handle context serialization errors gracefully', () => {
            const circularContext = {};
            circularContext.self = circularContext;
            logger.info('Message with circular context', circularContext);
            const loggedMessage = appendLineSpy.calls[0]?.[0];
            assert.ok(loggedMessage.includes('Unable to serialize'), 'Should handle circular refs');
        });
    });
    suite('Log Entry Limits', () => {
        test('should limit stored log entries to maxLogEntries', async () => {
            for (let i = 0; i < 1100; i++) {
                logger.info(`Message ${i}`);
            }
            const exported = await logger.export();
            assert.ok(exported.includes('Total entries: 1000'), 'Should cap at 1000 entries');
            assert.ok(!exported.includes('Message 0'), 'Oldest entries should be dropped');
            assert.ok(exported.includes('Message 1099'), 'Newest entry should be present');
        });
        test('should limit stored performance metrics to 500', async () => {
            logger.setLevel(logger_interface_1.LogLevel.Debug);
            for (let i = 0; i < 600; i++) {
                logger.logMetric(`metric-${i}`, i, 'ms');
            }
            const exported = await logger.export();
            assert.ok(!exported.includes('metric-0'), 'Oldest metric should be dropped');
            assert.ok(exported.includes('metric-599'), 'Newest metric should be present');
        });
    });
    suite('Edge Cases', () => {
        test('should handle empty messages', () => {
            logger.info('');
            assert.ok(appendLineSpy.callCount() > 0, 'Should handle empty message');
        });
        test('should handle undefined context', () => {
            logger.info('Message', undefined);
            assert.ok(appendLineSpy.callCount() > 0, 'Should handle undefined context');
        });
        test('should handle empty context object', () => {
            logger.info('Message', {});
            const loggedMessage = appendLineSpy.calls[0]?.[0];
            assert.ok(!loggedMessage.includes('Context:'), 'Empty context should not add Context section');
        });
        test('should handle error without stack trace', () => {
            const error = new Error('Test error');
            delete error.stack;
            logger.error('Error occurred', error);
            const loggedMessage = appendLineSpy.calls[0]?.[0];
            assert.ok(loggedMessage.includes('Test error'), 'Should include error message without stack');
        });
    });
});
//# sourceMappingURL=logger.test.js.map