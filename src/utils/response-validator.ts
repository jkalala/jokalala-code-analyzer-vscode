/**
 * Response Validation Utility
 * Validates API responses against expected schemas
 */

import {
  AnalysisResult,
  ProjectAnalysisResult,
} from '../interfaces/code-analysis-service.interface'

export class ValidationError extends Error {
  constructor(
    message: string,
    public field?: string
  ) {
    super(message)
    this.name = 'ValidationError'
  }
}

/**
 * Validate analysis result
 */
export function validateAnalysisResult(result: any): result is AnalysisResult {
  if (!result || typeof result !== 'object') {
    throw new ValidationError('Analysis result must be an object')
  }

  if (!Array.isArray(result.prioritizedIssues)) {
    throw new ValidationError('prioritizedIssues must be an array')
  }

  if (!Array.isArray(result.recommendations)) {
    throw new ValidationError('recommendations must be an array')
  }

  if (!result.summary || typeof result.summary !== 'object') {
    throw new ValidationError('summary must be an object')
  }

  return true
}

/**
 * Validate project analysis result
 */
export function validateProjectAnalysisResult(
  result: any
): result is ProjectAnalysisResult {
  validateAnalysisResult(result)

  if (typeof result.filesAnalyzed !== 'number') {
    throw new ValidationError('filesAnalyzed must be a number')
  }

  if (typeof result.filesSkipped !== 'number') {
    throw new ValidationError('filesSkipped must be a number')
  }

  return true
}

/**
 * Sanitize and normalize analysis result
 */
export function sanitizeAnalysisResult(result: any): AnalysisResult {
  return {
    prioritizedIssues: Array.isArray(result?.prioritizedIssues)
      ? result.prioritizedIssues
      : [],
    recommendations: Array.isArray(result?.recommendations)
      ? result.recommendations
      : [],
    summary: {
      totalIssues: result?.summary?.totalIssues || 0,
      criticalIssues: result?.summary?.criticalIssues || 0,
      highIssues: result?.summary?.highIssues || 0,
      mediumIssues: result?.summary?.mediumIssues || 0,
      lowIssues: result?.summary?.lowIssues || 0,
      overallScore: result?.summary?.overallScore,
      analysisTime: result?.summary?.analysisTime,
    },
    requestId: result?.requestId,
    cached: result?.cached,
  }
}

/**
 * Sanitize and normalize project analysis result
 */
export function sanitizeProjectAnalysisResult(
  result: any
): ProjectAnalysisResult {
  const baseResult = sanitizeAnalysisResult(result)

  return {
    ...baseResult,
    filesAnalyzed: result?.filesAnalyzed || 0,
    filesSkipped: result?.filesSkipped || 0,
  }
}
