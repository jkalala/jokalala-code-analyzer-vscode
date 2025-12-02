/**
 * Debounce utility for delaying function execution
 */

/**
 * Creates a debounced function that delays invoking func until after wait milliseconds
 * have elapsed since the last time the debounced function was invoked.
 *
 * @param func The function to debounce
 * @param wait The number of milliseconds to delay
 * @returns A debounced version of the function
 */
export function debounce<T extends (...args: any[]) => void>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout | undefined

  return function (this: any, ...args: Parameters<T>) {
    const context = this

    if (timeoutId !== undefined) {
      clearTimeout(timeoutId)
    }

    timeoutId = setTimeout(() => {
      func.apply(context, args)
      timeoutId = undefined
    }, wait)
  }
}

/**
 * Creates a debounced function with immediate execution option
 *
 * @param func The function to debounce
 * @param wait The number of milliseconds to delay
 * @param immediate If true, trigger the function on the leading edge instead of trailing
 * @returns A debounced version of the function
 */
export function debounceImmediate<T extends (...args: any[]) => void>(
  func: T,
  wait: number,
  immediate: boolean = false
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout | undefined

  return function (this: any, ...args: Parameters<T>) {
    const context = this
    const callNow = immediate && timeoutId === undefined

    if (timeoutId !== undefined) {
      clearTimeout(timeoutId)
    }

    timeoutId = setTimeout(() => {
      timeoutId = undefined
      if (!immediate) {
        func.apply(context, args)
      }
    }, wait)

    if (callNow) {
      func.apply(context, args)
    }
  }
}
