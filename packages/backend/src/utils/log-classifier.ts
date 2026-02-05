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
      // Configuration/initialization dumps (i18next, etc.)
      /^\s*\w+:\s*\{$/, // Object property opening: "resources: {"
      /^\s*\w+:\s*\[$/, // Array property opening: "items: ["
      /^\s*[}\]],?\s*$/, // Closing braces: "}" or "]" or "},"
      /^\s*\w+:\s*(true|false|null),?\s*$/, // Boolean/null properties
      /^\s*\w+:\s*\d+,?\s*$/, // Number properties: "maxReplaces: 1000,"
      /^\s*\w+:\s*'[^']*',?\s*$/, // String properties: "lng: 'en',"
      /^\s*\w+:\s*"[^"]*",?\s*$/, // String properties (double quotes)
      /\[Function[:\s]/, // Function references: "[Function: bound format]"
      /\[Object\]/, // Object references: "{ translation: [Object] }"
      /\[Array\]/, // Array references
      /\bi18n(ext)?\b/i, // i18n/i18next
      /\btranslation\b/i, // translation configs
      /\binterpolation\b/i, // interpolation config
      /\bnamespace\b/i, // namespace configs
      /\bresources\b/i, // resources config
      /\bfallback\b/i, // fallback configs
      /\bdetection\b/i, // language detection
      /\bbackend\b/i, // backend configs
      /\bnesting\b/i, // nesting configs
      /\bpluralization\b/i, // plural configs
      /\bformatSeparator\b/, // i18next specific
      /\bescapeValue\b/, // i18next specific
      /\boverloadTranslationOptionHandler\b/, // i18next specific
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
      /\bLoaded\b/i,
      /\bInitialized?\b/i,
      /\bConfigured?\b/i,
      /\bEnabled\b/i,
      /\bDisabled\b/i,
      /\bUsing\b/i,
      /\bVersion\b/i,
      /\bv\d+\.\d+/,  // Version numbers like v1.0.0
      /\bport\s*\d+/i,
      /\bhttp:\/\//i,
      /\bhttps:\/\//i,
      /\bws:\/\//i,
      /\bwss:\/\//i,
      /\bPID\s*\d+/i,
      /\bworker\b/i,
      /\bprocess\b/i,
      /\bservice\b/i,
      /\bmodule\b/i,
      /\bplugin\b/i,
      /\broute\b/i,
      /\bendpoint\b/i,
      /\bmiddleware\b/i,
      /\bdatabase\b/i,
      /\bredis\b/i,
      /\bmongo\b/i,
      /\bpostgres\b/i,
      /\bmysql\b/i,
      /\bsqlite\b/i,
      /\bconnection\b/i,
      /\bsocket\b/i,
      /\bwebsocket\b/i,
      /\bauth\b/i,
      /\btoken\b/i,
      /\bsession\b/i,
      /\bcache\b/i,
      /\bqueue\b/i,
      /\bjob\b/i,
      /\btask\b/i,
      /\bevent\b/i,
      /\bhandler\b/i,
      /\bcontroller\b/i,
      /\brepository\b/i,
      /^\s*[→>-]\s+/,  // Arrow/bullet prefixes
      /^\s*\*\s+/,     // Asterisk prefix
      /^\s*•\s+/,      // Bullet prefix
    ],
  },
];

/**
 * Patterns that indicate "runtime" type (truly generic output)
 * These are checked AFTER info patterns fail
 */
const RUNTIME_PATTERNS: readonly RegExp[] = [
  /^[\s\d\-:.,]+$/, // Just numbers, spaces, punctuation
  /^\s*$/,          // Empty or whitespace only
  /^[=-]+$/,        // Separator lines
  /^\s*\|\s*/,      // Table-like output
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

  // stderr without specific pattern -> error
  if (stream === 'stderr') {
    return 'error';
  }

  // Check if it's truly generic runtime output
  for (const pattern of RUNTIME_PATTERNS) {
    if (pattern.test(content)) {
      return 'runtime';
    }
  }

  // Default for stdout: info (most stdout is informational)
  return 'info';
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
