"use strict";
/**
 * Debounce utility for delaying function execution
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.debounce = debounce;
exports.debounceImmediate = debounceImmediate;
/**
 * Creates a debounced function that delays invoking func until after wait milliseconds
 * have elapsed since the last time the debounced function was invoked.
 *
 * @param func The function to debounce
 * @param wait The number of milliseconds to delay
 * @returns A debounced version of the function
 */
function debounce(func, wait) {
    let timeoutId;
    return function (...args) {
        const context = this;
        if (timeoutId !== undefined) {
            clearTimeout(timeoutId);
        }
        timeoutId = setTimeout(() => {
            func.apply(context, args);
            timeoutId = undefined;
        }, wait);
    };
}
/**
 * Creates a debounced function with immediate execution option
 *
 * @param func The function to debounce
 * @param wait The number of milliseconds to delay
 * @param immediate If true, trigger the function on the leading edge instead of trailing
 * @returns A debounced version of the function
 */
function debounceImmediate(func, wait, immediate = false) {
    let timeoutId;
    return function (...args) {
        const context = this;
        const callNow = immediate && timeoutId === undefined;
        if (timeoutId !== undefined) {
            clearTimeout(timeoutId);
        }
        timeoutId = setTimeout(() => {
            timeoutId = undefined;
            if (!immediate) {
                func.apply(context, args);
            }
        }, wait);
        if (callNow) {
            func.apply(context, args);
        }
    };
}
//# sourceMappingURL=debounce.js.map