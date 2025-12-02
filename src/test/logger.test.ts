import * as vscode from 'vscode'
import { LogLevel } from '../interfaces/logger.interface'
import { Logger } from '../services/logger'

describe('Logger', () => {
  let logger: Logger
  let mockChannel: any

  beforeEach(() => {
    // Mock the output channel
    mockChannel = {
      appendLine: jest.fn(),
      clear: jest.fn(),
      dispose: jest.fn(),
    }

    jest
      .spyOn(vscode.window, 'createOutputChannel')
      .mockReturnValue(mockChannel)
    jest.spyOn(console, 'log').mockImplementation()
    jest.spyOn(console, 'debug').mockImplementation()
    jest.spyOn(console, 'warn').mockImplementation()
    jest.spyOn(console, 'error').mockImplementation()

    logger = new Logger()
  })

  afterEach(() => {
    logger.dispose()
    jest.restoreAllMocks()
  })

  describe('Basic Logging', () => {
    it('should log debug messages', () => {
      logger.debug('Debug message')
      expect(mockChannel.appendLine).toHaveBeenCalled()
      expect(console.debug).toHaveBeenCalled()
    })

    it('should log info messages', () => {
      logger.info('Info message')
      expect(mockChannel.appendLine).toHaveBeenCalled()
      expect(console.log).toHaveBeenCalled()
    })

    it('should log warning messages', () => {
      logger.warn('Warning message')
      expect(mockChannel.appendLine).toHaveBeenCalled()
      expect(console.warn).toHaveBeenCalled()
    })

    it('should log error messages', () => {
      logger.error('Error message')
      expect(mockChannel.appendLine).toHaveBeenCalled()
      expect(console.error).toHaveBeenCalled()
    })

    it('should log error messages with error object', () => {
      const error = new Error('Test error')
      logger.error('Error occurred', error)
      expect(mockChannel.appendLine).toHaveBeenCalled()
      const loggedMessage = mockChannel.appendLine.mock.calls[0][0]
      expect(loggedMessage).toContain('Test error')
    })

    it('should log messages with context', () => {
      const context = { userId: '123', action: 'test' }
      logger.info('Message with context', context)
      const loggedMessage = mockChannel.appendLine.mock.calls[0][0]
      expect(loggedMessage).toContain('userId')
      expect(loggedMessage).toContain('123')
    })
  })

  describe('Log Level Filtering', () => {
    it('should filter debug messages when level is Info', () => {
      logger.setLevel(LogLevel.Info)
      mockChannel.appendLine.mockClear()

      logger.debug('Debug message')
      expect(mockChannel.appendLine).toHaveBeenCalledTimes(0)
    })

    it('should allow info messages when level is Info', () => {
      logger.setLevel(LogLevel.Info)
      mockChannel.appendLine.mockClear()

      logger.info('Info message')
      expect(mockChannel.appendLine).toHaveBeenCalled()
    })

    it('should filter info and debug when level is Warn', () => {
      logger.setLevel(LogLevel.Warn)
      mockChannel.appendLine.mockClear()

      logger.debug('Debug message')
      logger.info('Info message')
      expect(mockChannel.appendLine).toHaveBeenCalledTimes(0)
    })

    it('should allow warnings when level is Warn', () => {
      logger.setLevel(LogLevel.Warn)
      mockChannel.appendLine.mockClear()

      logger.warn('Warning message')
      expect(mockChannel.appendLine).toHaveBeenCalled()
    })

    it('should only allow errors when level is Error', () => {
      logger.setLevel(LogLevel.Error)
      mockChannel.appendLine.mockClear()

      logger.debug('Debug message')
      logger.info('Info message')
      logger.warn('Warning message')
      expect(mockChannel.appendLine).toHaveBeenCalledTimes(0)

      logger.error('Error message')
      expect(mockChannel.appendLine).toHaveBeenCalled()
    })

    it('should get current log level', () => {
      logger.setLevel(LogLevel.Warn)
      expect(logger.getLevel()).toBe(LogLevel.Warn)
    })
  })

  describe('Performance Metrics', () => {
    it('should log performance metrics', () => {
      logger.setLevel(LogLevel.Debug)
      mockChannel.appendLine.mockClear()

      logger.logMetric('test-operation', 150, 'ms')
      expect(mockChannel.appendLine).toHaveBeenCalled()
      const loggedMessage = mockChannel.appendLine.mock.calls[0][0]
      expect(loggedMessage).toContain('METRIC')
      expect(loggedMessage).toContain('test-operation')
      expect(loggedMessage).toContain('150ms')
    })

    it('should not log metrics when level is above Debug', () => {
      logger.setLevel(LogLevel.Info)
      mockChannel.appendLine.mockClear()

      logger.logMetric('test-operation', 150, 'ms')
      expect(mockChannel.appendLine).toHaveBeenCalledTimes(0)
    })

    it('should use default unit of ms', () => {
      logger.setLevel(LogLevel.Debug)
      mockChannel.appendLine.mockClear()

      logger.logMetric('test-operation', 150)
      const loggedMessage = mockChannel.appendLine.mock.calls[0][0]
      expect(loggedMessage).toContain('150ms')
    })

    it('should start and stop timer', () => {
      logger.setLevel(LogLevel.Debug)
      mockChannel.appendLine.mockClear()

      const stopTimer = logger.startTimer('test-timer')
      stopTimer()

      expect(mockChannel.appendLine).toHaveBeenCalled()
      const loggedMessage = mockChannel.appendLine.mock.calls[0][0]
      expect(loggedMessage).toContain('test-timer')
    })
  })

  describe('Log Management', () => {
    it('should clear logs', () => {
      logger.info('Test message')
      logger.clear()
      expect(mockChannel.clear).toHaveBeenCalled()
    })

    it('should export logs', async () => {
      logger.info('Test message 1')
      logger.warn('Test message 2')
      logger.error('Test message 3')

      const exported = await logger.export()
      expect(exported).toContain('Jokalala Code Analysis Logs')
      expect(exported).toContain('Test message 1')
      expect(exported).toContain('Test message 2')
      expect(exported).toContain('Test message 3')
    })

    it('should export performance metrics', async () => {
      logger.setLevel(LogLevel.Debug)
      logger.logMetric('operation-1', 100, 'ms')
      logger.logMetric('operation-2', 200, 'ms')

      const exported = await logger.export()
      expect(exported).toContain('Performance Metrics')
      expect(exported).toContain('operation-1')
      expect(exported).toContain('operation-2')
    })

    it('should dispose resources', () => {
      logger.dispose()
      expect(mockChannel.dispose).toHaveBeenCalled()
    })
  })

  describe('Log Entry Formatting', () => {
    it('should include timestamp in log entries', () => {
      logger.info('Test message')
      const loggedMessage = mockChannel.appendLine.mock.calls[0][0]
      expect(loggedMessage).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
    })

    it('should include log level in log entries', () => {
      logger.info('Test message')
      const loggedMessage = mockChannel.appendLine.mock.calls[0][0]
      expect(loggedMessage).toContain('[INFO]')
    })

    it('should format error stack traces', () => {
      const error = new Error('Test error')
      logger.error('Error occurred', error)
      const loggedMessage = mockChannel.appendLine.mock.calls[0][0]
      expect(loggedMessage).toContain('Error:')
      expect(loggedMessage).toContain('Stack:')
    })

    it('should handle context serialization errors gracefully', () => {
      const circularContext: any = {}
      circularContext.self = circularContext

      logger.info('Message with circular context', circularContext)
      const loggedMessage = mockChannel.appendLine.mock.calls[0][0]
      expect(loggedMessage).toContain('Unable to serialize')
    })
  })

  describe('Log Entry Limits', () => {
    it('should limit stored log entries to maxLogEntries', async () => {
      // Log more than maxLogEntries (1000)
      for (let i = 0; i < 1100; i++) {
        logger.info(`Message ${i}`)
      }

      const exported = await logger.export()
      expect(exported).toContain('Total entries: 1000')
      expect(exported).not.toContain('Message 0')
      expect(exported).toContain('Message 1099')
    })

    it('should limit stored performance metrics to 500', async () => {
      logger.setLevel(LogLevel.Debug)

      // Log more than 500 metrics
      for (let i = 0; i < 600; i++) {
        logger.logMetric(`metric-${i}`, i, 'ms')
      }

      const exported = await logger.export()
      expect(exported).not.toContain('metric-0')
      expect(exported).toContain('metric-599')
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty messages', () => {
      logger.info('')
      expect(mockChannel.appendLine).toHaveBeenCalled()
    })

    it('should handle undefined context', () => {
      logger.info('Message', undefined)
      expect(mockChannel.appendLine).toHaveBeenCalled()
    })

    it('should handle empty context object', () => {
      logger.info('Message', {})
      const loggedMessage = mockChannel.appendLine.mock.calls[0][0]
      expect(loggedMessage).not.toContain('Context:')
    })

    it('should handle error without stack trace', () => {
      const error = new Error('Test error')
      delete error.stack
      logger.error('Error occurred', error)
      const loggedMessage = mockChannel.appendLine.mock.calls[0][0]
      expect(loggedMessage).toContain('Test error')
    })
  })
})
