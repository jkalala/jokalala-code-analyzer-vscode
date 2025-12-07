// Minimal Jest type declarations for TypeScript compilation without the full Jest dependency
// These definitions cover only the APIs used in our test suite.
declare const jest: {
  fn: <T extends (...args: any[]) => any = (...args: any[]) => any>(implementation?: T) => jest.Mock<ReturnType<T>, Parameters<T>>
  spyOn<T extends object, K extends keyof T>(object: T, method: K): jest.SpyInstance<T[K]>
  restoreAllMocks(): void
}

declare namespace jest {
  interface Mock<T = any, Y extends any[] = any[]> {
    (...args: Y): T
    mock: {
      calls: Y[]
    }
    mockClear(): void
    mockReturnValue(value: T): Mock<T, Y>
    mockImplementation(fn?: (...args: Y) => T): Mock<T, Y>
  }

  interface SpyInstance<T = any> extends Mock<T> {}
}

declare function describe(name: string, fn: () => void): void

declare function it(name: string, fn: () => any): void

declare function beforeEach(fn: () => any): void

declare function afterEach(fn: () => any): void

interface Expectation {
  toHaveBeenCalled(): void
  toHaveBeenCalledTimes(count: number): void
  toContain(expected: any): void
  toBe(expected: any): void
  toEqual(expected: any): void
  toMatch(expected: RegExp | string): void
  not: Expectation
}

declare function expect(actual: any): Expectation
