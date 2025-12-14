"use strict";
/**
 * GitHub Integration Plugin Types
 *
 * Type definitions for the Jokalala GitHub Integration plugin.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_SEVERITY_LABELS = exports.SEVERITY_COLORS = exports.SEVERITY_PRIORITY = void 0;
/**
 * Severity priority for sorting/filtering
 */
exports.SEVERITY_PRIORITY = {
    critical: 5,
    high: 4,
    medium: 3,
    low: 2,
    info: 1
};
/**
 * Severity to GitHub label color mapping
 */
exports.SEVERITY_COLORS = {
    critical: 'd73a4a', // Red
    high: 'ff6b6b', // Light red
    medium: 'ffa500', // Orange
    low: 'ffd93d', // Yellow
    info: '0075ca' // Blue
};
/**
 * Default issue labels by severity
 */
exports.DEFAULT_SEVERITY_LABELS = {
    critical: 'priority: critical',
    high: 'priority: high',
    medium: 'priority: medium',
    low: 'priority: low',
    info: 'priority: low'
};
//# sourceMappingURL=types.js.map