"use strict";
/**
 * Enhanced Logger Interface
 * Provides structured logging with context, performance tracking, and log management
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.LogLevel = void 0;
var LogLevel;
(function (LogLevel) {
    LogLevel[LogLevel["Debug"] = 0] = "Debug";
    LogLevel[LogLevel["Info"] = 1] = "Info";
    LogLevel[LogLevel["Warn"] = 2] = "Warn";
    LogLevel[LogLevel["Error"] = 3] = "Error";
})(LogLevel || (exports.LogLevel = LogLevel = {}));
//# sourceMappingURL=logger.interface.js.map