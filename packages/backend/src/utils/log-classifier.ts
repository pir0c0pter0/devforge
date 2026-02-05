/**
 * Log Classifier Utility
 *
 * Classifies Docker container log lines by type for filtering and display.
 */

/**
 * Docker log type classification
 */
export type DockerLogType = 'build' | 'runtime' | 'error' | 'warning' | 'info';

/**
 * Pattern definitions for log classification
 */
interface ClassificationPattern {
  readonly type: DockerLogType;
  readonly patterns: readonly RegExp[];
}

/**
 * Classification patterns in priority order (first match wins)
 */
const CLASSIFICATION_PATTERNS: readonly ClassificationPattern[] = [
  {
    type: 'error',
    patterns: [
      /\bERROR\b/i,
      /\bError:/,
      /\berror:/,
      /\bFAIL(ED)?\b/i,
      /\bException\b/i,
      /\bexception\b/,
      /\bTypeError\b/,
      /\bSyntaxError\b/,
      /\bReferenceError\b/,
      /\bRangeError\b/,
      /\bEvalError\b/,
      /\bURIError\b/,
      /\bAggregateError\b/,
      /\bfatal\b/i,
      /\bpanic\b/i,
      /\bCRITICAL\b/,
      /\bcritical\b/,
      /\bsegfault\b/i,
      /\bOOMKilled\b/,
      /\bkilled\b/i,
      /\baborted\b/i,
      /^\s*at\s+.+\(.+:\d+:\d+\)/, // Stack trace line
      /^\s*at\s+.+\s+\(.+\)$/, // Stack trace line (alternative)
      /Traceback \(most recent call last\)/, // Python traceback
      /\bUnhandledPromiseRejection\b/,
      /\bENOENT\b/,
      /\bEACCES\b/,
      /\bECONNREFUSED\b/,
      /\bETIMEDOUT\b/,
      /\bENOMEM\b/,
    ],
  },
  {
    type: 'warning',
    patterns: [
      /\bWARN(ING)?\b/i,
      /\bwarning:/i,
      /\bDEPRECAT(ED|ION)?\b/i,
      /\bCAUTION\b/i,
      /\bNOTICE\b/i,
      /\bATTENTION\b/i,
      /npm WARN/,
      /pnpm WARN/,
      /yarn warn/i,
      /\bexperimental\b/i,
      /\bunsafe\b/i,
      /\binsecure\b/i,
    ],
  },
  {
    type: 'build',
    patterns: [
      /^npm\s/,
      /^pnpm\s/,
      /^yarn\s/,
      /\bnpm\s+(run|install|ci|build|test|start)\b/,
      /\bpnpm\s+(run|install|build|test|start)\b/,
      /\byarn\s+(run|install|build|test|start)\b/,
      /\bwebpack\b/i,
      /\bvite\b/i,
      /\brollup\b/i,
      /\besbuild\b/i,
      /\bparcel\b/i,
      /\btsc\b/,
      /\btsconfig\b/,
      /\bcompil(e|ing|ed|ation)\b/i,
      /\bBuild(ing)?\b/,
      /\bbuild(ing)?:/,
      /\bBundl(e|ing|ed)\b/i,
      /\bTranspil(e|ing|ed)\b/i,
      /\bMinif(y|ying|ied)\b/i,
      /\bOptimiz(e|ing|ed)\b/i,
      /\bLint(ing|ed)?\b/i,
      /\beslint\b/i,
      /\bprettier\b/i,
      /\bTypeCheck(ing)?\b/i,
      /\bgcc\b/,
      /\bg\+\+\b/,
      /\bclang\b/,
      /\bmake\b/,
      /\bcmake\b/,
      /\bcargo\s+(build|run|test|check)\b/,
      /\brustc\b/,
      /\bgo\s+(build|run|test|mod)\b/,
      /\bmaven\b/i,
      /\bgradle\b/i,
      /\bant\b/i,
      /\bpip\s+(install|freeze)\b/,
      /\bpython\s+setup\.py\b/,
      /\bpoetry\s+(install|build)\b/,
      /\bdocker\s+(build|push|pull)\b/i,
      /\[\d+\/\d+\]\s/, // Build step indicators like [1/5]
      /^>\s.+@.+\s/, // pnpm output format
      /^> Running\b/,
      /\bDone in\s+\d+/,
      /\bFinished in\s+\d+/,
      /\bCompleted in\s+\d+/,
    ],
  },
  {
    type: 'info',
    patterns: [
      /\bINFO\b/,
      /\binfo:/,
      /\[INFO\]/,
      /^\[\d{2}:\d{2}:\d{2}\]/, // Timestamp prefix like [10:30:45]
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/, // ISO timestamp
      /\bStarting\b/i,
      /\bListening\b/i,
      /\bConnected\b/i,
      /\bReady\b/i,
      /\bServer\s+(running|started|listening)\b/i,
      /\bApplication\s+(started|ready)\b/i,
      /\bDEBUG\b/,
      /\bdebug:/,
      /\[DEBUG\]/,
    ],
  },
];

/**
 * Classify a log line by its content and stream type
 *
 * @param content - The log line content
 * @param stream - The stream type (stdout or stderr)
 * @returns The classified log type
 */
export function classifyLogLine(
  content: string,
  stream: 'stdout' | 'stderr'
): DockerLogType {
  // Empty content defaults to runtime
  if (!content || content.trim().length === 0) {
    return 'runtime';
  }

  // Check against classification patterns
  for (const { type, patterns } of CLASSIFICATION_PATTERNS) {
    for (const pattern of patterns) {
      if (pattern.test(content)) {
        return type;
      }
    }
  }

  // Default: stderr without specific pattern -> error, stdout -> runtime
  if (stream === 'stderr') {
    return 'error';
  }

  return 'runtime';
}

/**
 * Get the display color class for a log type (for reference)
 */
export function getLogTypeColor(type: DockerLogType): string {
  switch (type) {
    case 'build':
      return 'blue';
    case 'runtime':
      return 'gray';
    case 'error':
      return 'red';
    case 'warning':
      return 'yellow';
    case 'info':
      return 'cyan';
    default:
      return 'gray';
  }
}

/**
 * Check if a log type should be included in a filter
 *
 * @param logType - The log type to check
 * @param allowedTypes - Array of allowed types (null means all allowed)
 */
export function isLogTypeAllowed(
  logType: DockerLogType,
  allowedTypes: readonly DockerLogType[] | null
): boolean {
  if (allowedTypes === null) {
    return true;
  }
  return allowedTypes.includes(logType);
}
