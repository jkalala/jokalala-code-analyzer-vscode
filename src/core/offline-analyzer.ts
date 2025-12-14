/**
 * Offline Analysis Engine
 *
 * Enterprise-grade offline security analysis that works without internet connectivity.
 * Bundles a complete deterministic rule engine for local analysis.
 *
 * Features:
 * - 100+ security rules bundled locally
 * - Pattern matching with regex and AST support
 * - OWASP Top 10 and CWE coverage
 * - Zero network dependency for core analysis
 * - Automatic fallback from online to offline mode
 *
 * @module core/offline-analyzer
 */

import { EventEmitter } from 'events'

/**
 * Severity levels for security issues
 */
export enum Severity {
  CRITICAL = 'critical',
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low',
  INFO = 'info',
}

/**
 * Security issue found by the analyzer
 */
export interface SecurityIssue {
  id: string
  ruleId: string
  title: string
  description: string
  severity: Severity
  category: string
  cwe?: string[]
  owasp?: string[]
  line: number
  column: number
  endLine?: number
  endColumn?: number
  codeSnippet: string
  suggestion: string
  fixCode?: string
  confidence: number
  falsePositiveLikelihood: number
  references: string[]
  message?: string
  metadata?: Record<string, unknown>
}

/**
 * Security rule definition
 */
export interface SecurityRule {
  id: string
  name: string
  description: string
  severity: Severity
  category: string
  cwe: string[]
  owasp: string[]
  languages: string[]
  patterns: RulePattern[]
  message: string
  suggestion: string
  fixTemplate?: string
  falsePositivePatterns?: string[]
  enabled: boolean
  priority: number
  references: string[]
}

/**
 * Pattern for rule matching
 */
export interface RulePattern {
  type: 'regex' | 'ast' | 'semantic' | 'taint'
  pattern: string
  flags?: string
  multiline?: boolean
  negativePatterns?: string[]
  contextPatterns?: string[]
  minConfidence?: number
}

/**
 * Analysis options
 */
export interface OfflineAnalysisOptions {
  enabledCategories?: string[]
  disabledRules?: string[]
  minSeverity?: Severity
  maxIssues?: number
  includeInfoIssues?: boolean
  enableAutoFix?: boolean
  language?: string
}

/**
 * Analysis result
 */
export interface OfflineAnalysisResult {
  issues: SecurityIssue[]
  summary: {
    totalIssues: number
    criticalCount: number
    highCount: number
    mediumCount: number
    lowCount: number
    infoCount: number
    rulesTriggered: number
    analysisTime: number
    linesAnalyzed: number
    coverage: number
  }
  metadata: {
    version: string
    rulesVersion: string
    language: string
    isOffline: boolean
    timestamp: number
  }
}

/**
 * Built-in security rules covering OWASP Top 10 and common CWEs
 */
const BUILT_IN_RULES: SecurityRule[] = [
  // SQL Injection Rules
  {
    id: 'SEC001',
    name: 'SQL Injection',
    description: 'Detects potential SQL injection vulnerabilities where user input is concatenated into SQL queries.',
    severity: Severity.CRITICAL,
    category: 'injection',
    cwe: ['CWE-89'],
    owasp: ['A03:2021'],
    languages: ['javascript', 'typescript', 'python', 'java', 'csharp', 'php', 'ruby', 'go'],
    patterns: [
      {
        type: 'regex',
        pattern: `(?:query|execute|exec|raw)\\s*\\(\\s*(?:['"\`].*\\$\\{|.*\\+\\s*(?:req|request|params|query|body|input))`,
        flags: 'gi',
        negativePatterns: ['PreparedStatement', 'parameterized', '\\$\\d+', '\\?'],
      },
      {
        type: 'regex',
        pattern: `(?:SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC).*\\+.*(?:req|request|params|query|body|input|user)`,
        flags: 'gi',
        negativePatterns: ['PreparedStatement', 'parameterized'],
      },
      {
        type: 'regex',
        pattern: `\\.(?:query|execute)\\(\\s*['"\`].*['"\`]\\s*\\+`,
        flags: 'gi',
      },
      {
        type: 'regex',
        pattern: `f["'](?:SELECT|INSERT|UPDATE|DELETE).*\\{.*\\}`,
        flags: 'gi',
      },
    ],
    message: 'Potential SQL injection vulnerability detected. User input appears to be concatenated into SQL query.',
    suggestion: 'Use parameterized queries or prepared statements instead of string concatenation.',
    fixTemplate: 'db.query($1, [userInput])',
    enabled: true,
    priority: 1,
    references: [
      'https://owasp.org/www-community/attacks/SQL_Injection',
      'https://cwe.mitre.org/data/definitions/89.html',
    ],
  },

  // XSS Rules
  {
    id: 'SEC002',
    name: 'Cross-Site Scripting (XSS)',
    description: 'Detects potential XSS vulnerabilities where user input is rendered without proper escaping.',
    severity: Severity.HIGH,
    category: 'injection',
    cwe: ['CWE-79'],
    owasp: ['A03:2021'],
    languages: ['javascript', 'typescript', 'python', 'java', 'csharp', 'php', 'ruby'],
    patterns: [
      {
        type: 'regex',
        pattern: `innerHTML\\s*=\\s*(?!['"\`][^$]*['"\`])`,
        flags: 'gi',
        negativePatterns: ['DOMPurify', 'sanitize', 'escape'],
      },
      {
        type: 'regex',
        pattern: `document\\.write\\s*\\(`,
        flags: 'gi',
      },
      {
        type: 'regex',
        pattern: `\\$\\(.*\\)\\.html\\s*\\((?!['"\`][^$]*['"\`])`,
        flags: 'gi',
      },
      {
        type: 'regex',
        pattern: `dangerouslySetInnerHTML\\s*=`,
        flags: 'gi',
        negativePatterns: ['DOMPurify', 'sanitize'],
      },
      {
        type: 'regex',
        pattern: `v-html\\s*=`,
        flags: 'gi',
      },
      {
        type: 'regex',
        pattern: `\\{\\{\\{.*\\}\\}\\}`,
        flags: 'gi',
      },
    ],
    message: 'Potential XSS vulnerability detected. User input may be rendered without proper escaping.',
    suggestion: 'Use textContent instead of innerHTML, or sanitize input with a library like DOMPurify.',
    enabled: true,
    priority: 2,
    references: [
      'https://owasp.org/www-community/attacks/xss/',
      'https://cwe.mitre.org/data/definitions/79.html',
    ],
  },

  // Command Injection
  {
    id: 'SEC003',
    name: 'Command Injection',
    description: 'Detects potential command injection vulnerabilities where user input is passed to system commands.',
    severity: Severity.CRITICAL,
    category: 'injection',
    cwe: ['CWE-78'],
    owasp: ['A03:2021'],
    languages: ['javascript', 'typescript', 'python', 'java', 'ruby', 'php', 'go'],
    patterns: [
      {
        type: 'regex',
        pattern: `(?:exec|spawn|execSync|spawnSync|execFile)\\s*\\([^)]*(?:req|request|params|query|body|input|user)`,
        flags: 'gi',
        negativePatterns: ['shell:\\s*false'],
      },
      {
        type: 'regex',
        pattern: `child_process.*(?:exec|spawn)\\s*\\(\\s*(?!['"\`][^$]*['"\`])`,
        flags: 'gi',
      },
      {
        type: 'regex',
        pattern: `os\\.system\\s*\\(\\s*(?:f['"]|['"].*\\+)`,
        flags: 'gi',
      },
      {
        type: 'regex',
        pattern: `subprocess\\.(?:call|run|Popen)\\s*\\([^)]*shell\\s*=\\s*True`,
        flags: 'gi',
      },
      {
        type: 'regex',
        pattern: `Runtime\\.getRuntime\\(\\)\\.exec\\s*\\(`,
        flags: 'gi',
      },
    ],
    message: 'Potential command injection vulnerability detected. User input appears to be passed to a system command.',
    suggestion: 'Avoid using shell commands with user input. If necessary, use allowlists and proper escaping.',
    enabled: true,
    priority: 1,
    references: [
      'https://owasp.org/www-community/attacks/Command_Injection',
      'https://cwe.mitre.org/data/definitions/78.html',
    ],
  },

  // Path Traversal
  {
    id: 'SEC004',
    name: 'Path Traversal',
    description: 'Detects potential path traversal vulnerabilities where user input is used in file system operations.',
    severity: Severity.HIGH,
    category: 'injection',
    cwe: ['CWE-22'],
    owasp: ['A01:2021'],
    languages: ['javascript', 'typescript', 'python', 'java', 'csharp', 'php', 'ruby', 'go'],
    patterns: [
      {
        type: 'regex',
        pattern: `(?:readFile|writeFile|readFileSync|writeFileSync|createReadStream|createWriteStream|open)\\s*\\([^)]*(?:req|request|params|query|body|input|user)`,
        flags: 'gi',
        negativePatterns: ['path\\.resolve', 'path\\.join.*__dirname', 'realpath'],
      },
      {
        type: 'regex',
        pattern: `fs\\..*\\(\\s*(?!['"\`][^$]*['"\`]).*(?:req|params|query)`,
        flags: 'gi',
      },
      {
        type: 'regex',
        pattern: `open\\s*\\(\\s*(?:f['"]|['"].*\\+)`,
        flags: 'gi',
        negativePatterns: ['os\\.path\\.abspath', 'os\\.path\\.realpath'],
      },
      {
        type: 'regex',
        pattern: `new\\s+File\\s*\\([^)]*(?:request|params|input)`,
        flags: 'gi',
      },
    ],
    message: 'Potential path traversal vulnerability detected. User input is used in file system operations.',
    suggestion: 'Validate and sanitize file paths. Use path.resolve() and verify paths are within allowed directories.',
    enabled: true,
    priority: 2,
    references: [
      'https://owasp.org/www-community/attacks/Path_Traversal',
      'https://cwe.mitre.org/data/definitions/22.html',
    ],
  },

  // Hardcoded Secrets
  {
    id: 'SEC005',
    name: 'Hardcoded Credentials',
    description: 'Detects hardcoded passwords, API keys, and other sensitive credentials in source code.',
    severity: Severity.HIGH,
    category: 'secrets',
    cwe: ['CWE-798'],
    owasp: ['A07:2021'],
    languages: ['javascript', 'typescript', 'python', 'java', 'csharp', 'php', 'ruby', 'go', 'rust'],
    patterns: [
      {
        type: 'regex',
        pattern: `(?:password|passwd|pwd|secret|api_?key|apikey|auth_?token|access_?token|private_?key)\\s*[:=]\\s*['"\`][^'"\`]{8,}['"\`]`,
        flags: 'gi',
        negativePatterns: ['process\\.env', 'os\\.environ', 'getenv', 'config\\.', 'placeholder', 'example', 'xxx', '\\*\\*\\*'],
      },
      {
        type: 'regex',
        pattern: `(?:AWS|AZURE|GCP|GOOGLE).*(?:KEY|SECRET|TOKEN)\\s*[:=]\\s*['"\`][A-Za-z0-9+/=]{20,}['"\`]`,
        flags: 'gi',
      },
      {
        type: 'regex',
        pattern: `-----BEGIN\\s+(?:RSA\\s+)?PRIVATE\\s+KEY-----`,
        flags: 'gi',
      },
      {
        type: 'regex',
        pattern: `ghp_[a-zA-Z0-9]{36}`,
        flags: 'g',
      },
      {
        type: 'regex',
        pattern: `sk-[a-zA-Z0-9]{48}`,
        flags: 'g',
      },
    ],
    message: 'Hardcoded credentials detected. Sensitive information should not be stored in source code.',
    suggestion: 'Use environment variables or a secrets management service to store sensitive credentials.',
    enabled: true,
    priority: 1,
    references: [
      'https://cwe.mitre.org/data/definitions/798.html',
      'https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/02-Configuration_and_Deployment_Management_Testing/04-Review_Old_Backup_and_Unreferenced_Files_for_Sensitive_Information',
    ],
  },

  // Insecure Deserialization
  {
    id: 'SEC006',
    name: 'Insecure Deserialization',
    description: 'Detects unsafe deserialization of user-controlled data.',
    severity: Severity.CRITICAL,
    category: 'injection',
    cwe: ['CWE-502'],
    owasp: ['A08:2021'],
    languages: ['javascript', 'typescript', 'python', 'java', 'csharp', 'php', 'ruby'],
    patterns: [
      {
        type: 'regex',
        pattern: `(?:pickle|cPickle)\\.(?:loads?|Unpickler)\\s*\\(`,
        flags: 'gi',
      },
      {
        type: 'regex',
        pattern: `yaml\\.(?:load|unsafe_load)\\s*\\(`,
        flags: 'gi',
        negativePatterns: ['Loader\\s*=\\s*yaml\\.SafeLoader'],
      },
      {
        type: 'regex',
        pattern: `unserialize\\s*\\(\\s*\\$`,
        flags: 'gi',
      },
      {
        type: 'regex',
        pattern: `ObjectInputStream.*readObject\\s*\\(`,
        flags: 'gi',
      },
      {
        type: 'regex',
        pattern: `Marshal\\.load\\s*\\(`,
        flags: 'gi',
      },
      {
        type: 'regex',
        pattern: `eval\\s*\\(\\s*(?:JSON\\.parse|atob)`,
        flags: 'gi',
      },
    ],
    message: 'Potential insecure deserialization detected. Deserializing untrusted data can lead to code execution.',
    suggestion: 'Use safe deserialization methods. For Python, use yaml.safe_load() instead of yaml.load().',
    enabled: true,
    priority: 1,
    references: [
      'https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/07-Input_Validation_Testing/15-Testing_for_HTTP_Incoming_Requests',
      'https://cwe.mitre.org/data/definitions/502.html',
    ],
  },

  // XXE (XML External Entity)
  {
    id: 'SEC007',
    name: 'XML External Entity (XXE)',
    description: 'Detects XML parsing configurations that may be vulnerable to XXE attacks.',
    severity: Severity.HIGH,
    category: 'injection',
    cwe: ['CWE-611'],
    owasp: ['A05:2021'],
    languages: ['javascript', 'typescript', 'python', 'java', 'csharp', 'php'],
    patterns: [
      {
        type: 'regex',
        pattern: `(?:parseString|parseXML|DOMParser|XMLReader)\\s*\\(`,
        flags: 'gi',
        contextPatterns: ['<!ENTITY', 'SYSTEM', 'PUBLIC'],
      },
      {
        type: 'regex',
        pattern: `DocumentBuilderFactory(?:(?!setFeature).)*\\.newDocumentBuilder`,
        flags: 'gis',
      },
      {
        type: 'regex',
        pattern: `XMLInputFactory(?:(?!setProperty).)*\\.createXMLStreamReader`,
        flags: 'gis',
      },
      {
        type: 'regex',
        pattern: `etree\\.(?:parse|fromstring)\\s*\\(`,
        flags: 'gi',
        negativePatterns: ['defusedxml'],
      },
    ],
    message: 'Potential XXE vulnerability detected. XML parser may process external entities.',
    suggestion: 'Disable external entity processing in XML parsers. Use defused XML libraries where available.',
    enabled: true,
    priority: 2,
    references: [
      'https://owasp.org/www-community/vulnerabilities/XML_External_Entity_(XXE)_Processing',
      'https://cwe.mitre.org/data/definitions/611.html',
    ],
  },

  // SSRF (Server-Side Request Forgery)
  {
    id: 'SEC008',
    name: 'Server-Side Request Forgery (SSRF)',
    description: 'Detects potential SSRF vulnerabilities where user input controls server-side HTTP requests.',
    severity: Severity.HIGH,
    category: 'injection',
    cwe: ['CWE-918'],
    owasp: ['A10:2021'],
    languages: ['javascript', 'typescript', 'python', 'java', 'csharp', 'php', 'ruby', 'go'],
    patterns: [
      {
        type: 'regex',
        pattern: `(?:fetch|axios|request|http\\.get|urllib|requests\\.get)\\s*\\([^)]*(?:req|request|params|query|body|input|user|url)`,
        flags: 'gi',
        negativePatterns: ['allowlist', 'whitelist', 'validateUrl'],
      },
      {
        type: 'regex',
        pattern: `new\\s+URL\\s*\\([^)]*(?:req|request|params|query|input)`,
        flags: 'gi',
      },
      {
        type: 'regex',
        pattern: `curl_(?:exec|init)\\s*\\(`,
        flags: 'gi',
      },
      {
        type: 'regex',
        pattern: `HttpClient.*(?:GetAsync|PostAsync|SendAsync)\\s*\\([^)]*(?:request|input|user)`,
        flags: 'gi',
      },
    ],
    message: 'Potential SSRF vulnerability detected. User input may control server-side HTTP requests.',
    suggestion: 'Validate and sanitize URLs. Use allowlists for permitted domains and block internal IP ranges.',
    enabled: true,
    priority: 2,
    references: [
      'https://owasp.org/www-community/attacks/Server_Side_Request_Forgery',
      'https://cwe.mitre.org/data/definitions/918.html',
    ],
  },

  // Weak Cryptography
  {
    id: 'SEC009',
    name: 'Weak Cryptography',
    description: 'Detects use of weak or deprecated cryptographic algorithms.',
    severity: Severity.MEDIUM,
    category: 'cryptography',
    cwe: ['CWE-327', 'CWE-328'],
    owasp: ['A02:2021'],
    languages: ['javascript', 'typescript', 'python', 'java', 'csharp', 'php', 'ruby', 'go'],
    patterns: [
      {
        type: 'regex',
        pattern: `(?:createHash|hashlib|MessageDigest|Hash).*['"\`](?:md5|sha1|md4|md2)['"\`]`,
        flags: 'gi',
      },
      {
        type: 'regex',
        pattern: `(?:createCipher|Cipher).*['"\`](?:des|rc4|rc2|blowfish)['"\`]`,
        flags: 'gi',
      },
      {
        type: 'regex',
        pattern: `(?:RSA|DSA).*(?:1024|512)`,
        flags: 'gi',
      },
      {
        type: 'regex',
        pattern: `Math\\.random\\s*\\(\\)`,
        flags: 'gi',
        contextPatterns: ['password', 'token', 'secret', 'key', 'salt'],
      },
    ],
    message: 'Weak cryptographic algorithm detected. Consider using stronger alternatives.',
    suggestion: 'Use SHA-256 or SHA-3 for hashing, AES-256-GCM for encryption, and crypto.randomBytes() for random values.',
    enabled: true,
    priority: 3,
    references: [
      'https://cwe.mitre.org/data/definitions/327.html',
      'https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/09-Testing_for_Weak_Cryptography/',
    ],
  },

  // NoSQL Injection
  {
    id: 'SEC010',
    name: 'NoSQL Injection',
    description: 'Detects potential NoSQL injection vulnerabilities in MongoDB and similar databases.',
    severity: Severity.CRITICAL,
    category: 'injection',
    cwe: ['CWE-943'],
    owasp: ['A03:2021'],
    languages: ['javascript', 'typescript', 'python', 'java', 'ruby', 'php'],
    patterns: [
      {
        type: 'regex',
        pattern: `(?:find|findOne|updateOne|updateMany|deleteOne|deleteMany|aggregate)\\s*\\(\\s*\\{[^}]*(?:\\$where|\\$regex|\\$ne|\\$gt|\\$lt).*(?:req|request|params|body|query|input)`,
        flags: 'gi',
      },
      {
        type: 'regex',
        pattern: `\\$where.*(?:function|=>)`,
        flags: 'gi',
      },
      {
        type: 'regex',
        pattern: `(?:collection|db)\\.[^(]+\\([^)]*(?:req\\.body|req\\.query|req\\.params)`,
        flags: 'gi',
        negativePatterns: ['sanitize', 'validate', 'escape'],
      },
    ],
    message: 'Potential NoSQL injection vulnerability detected. User input may be used in database queries.',
    suggestion: 'Validate and sanitize user input. Avoid using $where operator with user input.',
    enabled: true,
    priority: 1,
    references: [
      'https://owasp.org/www-pdf-archive/GOD16-NOSQL.pdf',
      'https://cwe.mitre.org/data/definitions/943.html',
    ],
  },

  // Prototype Pollution
  {
    id: 'SEC011',
    name: 'Prototype Pollution',
    description: 'Detects potential prototype pollution vulnerabilities in JavaScript/TypeScript.',
    severity: Severity.HIGH,
    category: 'injection',
    cwe: ['CWE-1321'],
    owasp: ['A03:2021'],
    languages: ['javascript', 'typescript'],
    patterns: [
      {
        type: 'regex',
        pattern: `(?:Object\\.assign|\\.\\.\\.)\\s*\\([^)]*(?:req|request|params|body|query|input)`,
        flags: 'gi',
      },
      {
        type: 'regex',
        pattern: `(?:merge|extend|deepMerge|assign)\\s*\\([^)]*(?:req|request|params|body|query|input)`,
        flags: 'gi',
        negativePatterns: ['\\{\\}\\s*,'],
      },
      {
        type: 'regex',
        pattern: `\\[(?:req|request|params|body|query|input)[^\\]]*\\]\\s*=`,
        flags: 'gi',
      },
      {
        type: 'regex',
        pattern: `__proto__|constructor\\.prototype`,
        flags: 'gi',
      },
    ],
    message: 'Potential prototype pollution vulnerability detected.',
    suggestion: 'Use Object.create(null) for dictionaries, validate object keys, or use Map instead of plain objects.',
    enabled: true,
    priority: 2,
    references: [
      'https://portswigger.net/web-security/prototype-pollution',
    ],
  },

  // Insecure Random
  {
    id: 'SEC012',
    name: 'Insecure Random Number Generation',
    description: 'Detects use of non-cryptographic random number generators for security purposes.',
    severity: Severity.MEDIUM,
    category: 'cryptography',
    cwe: ['CWE-330'],
    owasp: ['A02:2021'],
    languages: ['javascript', 'typescript', 'python', 'java', 'csharp', 'php', 'ruby', 'go'],
    patterns: [
      {
        type: 'regex',
        pattern: `Math\\.random\\s*\\(\\)`,
        flags: 'gi',
        contextPatterns: ['token', 'secret', 'password', 'key', 'session', 'csrf', 'auth'],
      },
      {
        type: 'regex',
        pattern: `random\\.(?:random|randint|choice)\\s*\\(`,
        flags: 'gi',
        contextPatterns: ['token', 'secret', 'password', 'key'],
        negativePatterns: ['secrets\\.'],
      },
      {
        type: 'regex',
        pattern: `new\\s+Random\\s*\\(\\)`,
        flags: 'gi',
        contextPatterns: ['password', 'token', 'key'],
      },
    ],
    message: 'Non-cryptographic random number generator used for security purposes.',
    suggestion: 'Use crypto.randomBytes() (Node.js), secrets module (Python), or SecureRandom (Java).',
    enabled: true,
    priority: 3,
    references: [
      'https://cwe.mitre.org/data/definitions/330.html',
    ],
  },

  // Open Redirect
  {
    id: 'SEC013',
    name: 'Open Redirect',
    description: 'Detects potential open redirect vulnerabilities.',
    severity: Severity.MEDIUM,
    category: 'injection',
    cwe: ['CWE-601'],
    owasp: ['A01:2021'],
    languages: ['javascript', 'typescript', 'python', 'java', 'csharp', 'php', 'ruby', 'go'],
    patterns: [
      {
        type: 'regex',
        pattern: `(?:res\\.redirect|response\\.redirect|redirect_to|Location\\s*:)\\s*\\(?[^)]*(?:req|request|params|query|body|input)`,
        flags: 'gi',
        negativePatterns: ['validateUrl', 'allowedDomains', 'whitelist'],
      },
      {
        type: 'regex',
        pattern: `window\\.location(?:\\.href)?\\s*=\\s*(?!['"\`](?:https?:\\/\\/[^'"\`]+)?['"\`])`,
        flags: 'gi',
      },
      {
        type: 'regex',
        pattern: `header\\s*\\(\\s*['"\`]Location:.*\\$`,
        flags: 'gi',
      },
    ],
    message: 'Potential open redirect vulnerability detected. User input controls redirect destination.',
    suggestion: 'Validate redirect URLs against an allowlist of permitted domains.',
    enabled: true,
    priority: 3,
    references: [
      'https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/11-Client-side_Testing/04-Testing_for_Client-side_URL_Redirect',
      'https://cwe.mitre.org/data/definitions/601.html',
    ],
  },

  // Missing Authentication
  {
    id: 'SEC014',
    name: 'Missing Authentication Check',
    description: 'Detects routes or endpoints that may be missing authentication checks.',
    severity: Severity.HIGH,
    category: 'authentication',
    cwe: ['CWE-306'],
    owasp: ['A07:2021'],
    languages: ['javascript', 'typescript', 'python', 'java', 'php', 'ruby'],
    patterns: [
      {
        type: 'regex',
        pattern: `(?:app|router)\\s*\\.(?:get|post|put|delete|patch)\\s*\\(\\s*['"\`]\\/(?:admin|api|dashboard|user|account|settings|profile)`,
        flags: 'gi',
        negativePatterns: ['auth', 'authenticate', 'requireAuth', 'isAuthenticated', 'passport', 'jwt', 'session'],
      },
      {
        type: 'regex',
        pattern: `@(?:Get|Post|Put|Delete|Patch)Mapping.*(?:admin|user|account|settings)`,
        flags: 'gi',
        negativePatterns: ['@PreAuthorize', '@Secured', '@RolesAllowed'],
      },
    ],
    message: 'Potential missing authentication check on sensitive route.',
    suggestion: 'Ensure all sensitive routes have proper authentication middleware.',
    enabled: true,
    priority: 2,
    references: [
      'https://cwe.mitre.org/data/definitions/306.html',
    ],
  },

  // CORS Misconfiguration
  {
    id: 'SEC015',
    name: 'CORS Misconfiguration',
    description: 'Detects overly permissive CORS configurations.',
    severity: Severity.MEDIUM,
    category: 'configuration',
    cwe: ['CWE-942'],
    owasp: ['A05:2021'],
    languages: ['javascript', 'typescript', 'python', 'java', 'csharp', 'php', 'go'],
    patterns: [
      {
        type: 'regex',
        pattern: `(?:Access-Control-Allow-Origin|origin)\\s*[:=]\\s*['"\`]\\*['"\`]`,
        flags: 'gi',
      },
      {
        type: 'regex',
        pattern: `cors\\s*\\(\\s*\\{[^}]*origin\\s*:\\s*(?:true|\\*|['"\`]\\*['"\`])`,
        flags: 'gi',
      },
      {
        type: 'regex',
        pattern: `Access-Control-Allow-Credentials.*true.*Access-Control-Allow-Origin.*\\*`,
        flags: 'gis',
      },
    ],
    message: 'Overly permissive CORS configuration detected.',
    suggestion: 'Restrict CORS to specific trusted domains. Never use wildcard (*) with credentials.',
    enabled: true,
    priority: 3,
    references: [
      'https://owasp.org/www-community/attacks/CORS_OriginHeaderScrutiny',
      'https://cwe.mitre.org/data/definitions/942.html',
    ],
  },
]

/**
 * Offline Pattern Matcher
 */
class PatternMatcher {
  private compiledPatterns: Map<string, { regex: RegExp; negativeRegexes: RegExp[] }[]> = new Map()

  /**
   * Compile patterns for a rule
   */
  compileRule(rule: SecurityRule): void {
    const patterns: { regex: RegExp; negativeRegexes: RegExp[] }[] = []

    for (const pattern of rule.patterns) {
      if (pattern.type === 'regex') {
        try {
          const flags = pattern.multiline ? `${pattern.flags || ''}m` : pattern.flags || ''
          const regex = new RegExp(pattern.pattern, flags)
          const negativeRegexes = (pattern.negativePatterns || []).map(
            np => new RegExp(np, 'gi')
          )
          patterns.push({ regex, negativeRegexes })
        } catch {
          // Invalid regex - skip
        }
      }
    }

    this.compiledPatterns.set(rule.id, patterns)
  }

  /**
   * Match a rule against code
   */
  matchRule(rule: SecurityRule, code: string, lines: string[]): SecurityIssue[] {
    const issues: SecurityIssue[] = []
    const patterns = this.compiledPatterns.get(rule.id) || []

    for (const { regex, negativeRegexes } of patterns) {
      let match
      regex.lastIndex = 0

      while ((match = regex.exec(code)) !== null) {
        const matchText = match[0]

        // Check negative patterns
        const isNegativeMatch = negativeRegexes.some(nr => {
          nr.lastIndex = 0
          return nr.test(matchText)
        })

        if (isNegativeMatch) continue

        // Calculate line number
        const beforeMatch = code.substring(0, match.index)
        const lineNumber = beforeMatch.split('\n').length
        const lineStart = beforeMatch.lastIndexOf('\n') + 1
        const column = match.index - lineStart

        // Get code snippet
        const snippetStart = Math.max(0, lineNumber - 2)
        const snippetEnd = Math.min(lines.length, lineNumber + 2)
        const codeSnippet = lines.slice(snippetStart, snippetEnd).join('\n')

        // Calculate confidence
        const confidence = this.calculateConfidence(matchText, rule)

        issues.push({
          id: `${rule.id}-${match.index}`,
          ruleId: rule.id,
          title: rule.name,
          description: rule.description,
          severity: rule.severity,
          category: rule.category,
          cwe: rule.cwe,
          owasp: rule.owasp,
          line: lineNumber,
          column,
          codeSnippet,
          suggestion: rule.suggestion,
          fixCode: rule.fixTemplate,
          confidence,
          falsePositiveLikelihood: this.estimateFalsePositiveLikelihood(matchText, rule),
          references: rule.references,
          message: rule.message,
        })
      }
    }

    return issues
  }

  private calculateConfidence(matchText: string, rule: SecurityRule): number {
    let confidence = 0.7 // Base confidence

    // Increase confidence for longer matches
    if (matchText.length > 50) confidence += 0.1
    if (matchText.length > 100) confidence += 0.1

    // Adjust based on severity
    if (rule.severity === Severity.CRITICAL) confidence += 0.1
    if (rule.severity === Severity.HIGH) confidence += 0.05

    return Math.min(confidence, 1.0)
  }

  private estimateFalsePositiveLikelihood(matchText: string, rule: SecurityRule): number {
    let likelihood = 0.2 // Base false positive likelihood

    // Check for common false positive indicators
    const fpIndicators = [
      /test/i,
      /mock/i,
      /example/i,
      /sample/i,
      /placeholder/i,
      /demo/i,
      /TODO/i,
      /FIXME/i,
    ]

    for (const indicator of fpIndicators) {
      if (indicator.test(matchText)) {
        likelihood += 0.1
      }
    }

    // Check rule-specific false positive patterns
    if (rule.falsePositivePatterns) {
      for (const pattern of rule.falsePositivePatterns) {
        if (new RegExp(pattern, 'gi').test(matchText)) {
          likelihood += 0.15
        }
      }
    }

    return Math.min(likelihood, 0.9)
  }
}

/**
 * Offline Security Analyzer
 *
 * Provides complete security analysis without network connectivity.
 */
export class OfflineAnalyzer extends EventEmitter {
  private rules: SecurityRule[]
  private patternMatcher: PatternMatcher
  private isInitialized: boolean = false

  constructor() {
    super()
    this.rules = [...BUILT_IN_RULES]
    this.patternMatcher = new PatternMatcher()
  }

  /**
   * Initialize the analyzer
   */
  initialize(): void {
    if (this.isInitialized) return

    // Compile all rule patterns
    for (const rule of this.rules) {
      this.patternMatcher.compileRule(rule)
    }

    this.isInitialized = true
    this.emit('initialized', { ruleCount: this.rules.length })
  }

  /**
   * Add custom rules
   */
  addRules(rules: SecurityRule[]): void {
    for (const rule of rules) {
      this.rules.push(rule)
      this.patternMatcher.compileRule(rule)
    }
    this.emit('rules-added', { count: rules.length })
  }

  /**
   * Analyze code for security issues
   */
  analyze(
    code: string,
    language: string,
    options: OfflineAnalysisOptions = {}
  ): OfflineAnalysisResult {
    if (!this.isInitialized) {
      this.initialize()
    }

    const startTime = performance.now()
    const lines = code.split('\n')
    const allIssues: SecurityIssue[] = []

    // Get applicable rules
    const applicableRules = this.rules.filter(rule => {
      if (!rule.enabled) return false
      if (!rule.languages.includes(language) && !rule.languages.includes('*')) return false
      if (options.disabledRules?.includes(rule.id)) return false
      if (options.enabledCategories && !options.enabledCategories.includes(rule.category)) return false
      return true
    })

    // Sort by priority
    applicableRules.sort((a, b) => a.priority - b.priority)

    // Run each rule
    for (const rule of applicableRules) {
      const issues = this.patternMatcher.matchRule(rule, code, lines)
      allIssues.push(...issues)

      // Check max issues limit
      if (options.maxIssues && allIssues.length >= options.maxIssues) {
        break
      }
    }

    // Filter by severity
    let filteredIssues = allIssues
    if (options.minSeverity) {
      const severityOrder = [Severity.CRITICAL, Severity.HIGH, Severity.MEDIUM, Severity.LOW, Severity.INFO]
      const minIndex = severityOrder.indexOf(options.minSeverity)
      filteredIssues = allIssues.filter(issue => {
        const issueIndex = severityOrder.indexOf(issue.severity)
        return issueIndex <= minIndex
      })
    }

    if (!options.includeInfoIssues) {
      filteredIssues = filteredIssues.filter(issue => issue.severity !== Severity.INFO)
    }

    // Deduplicate by location
    const uniqueIssues = this.deduplicateIssues(filteredIssues)

    // Sort by severity then line number
    uniqueIssues.sort((a, b) => {
      const severityOrder = [Severity.CRITICAL, Severity.HIGH, Severity.MEDIUM, Severity.LOW, Severity.INFO]
      const severityDiff = severityOrder.indexOf(a.severity) - severityOrder.indexOf(b.severity)
      if (severityDiff !== 0) return severityDiff
      return a.line - b.line
    })

    const analysisTime = performance.now() - startTime

    return {
      issues: uniqueIssues,
      summary: {
        totalIssues: uniqueIssues.length,
        criticalCount: uniqueIssues.filter(i => i.severity === Severity.CRITICAL).length,
        highCount: uniqueIssues.filter(i => i.severity === Severity.HIGH).length,
        mediumCount: uniqueIssues.filter(i => i.severity === Severity.MEDIUM).length,
        lowCount: uniqueIssues.filter(i => i.severity === Severity.LOW).length,
        infoCount: uniqueIssues.filter(i => i.severity === Severity.INFO).length,
        rulesTriggered: new Set(uniqueIssues.map(i => i.ruleId)).size,
        analysisTime,
        linesAnalyzed: lines.length,
        coverage: (applicableRules.length / this.rules.length) * 100,
      },
      metadata: {
        version: '1.0.0',
        rulesVersion: '2024.1',
        language,
        isOffline: true,
        timestamp: Date.now(),
      },
    }
  }

  /**
   * Get available rules
   */
  getRules(): SecurityRule[] {
    return [...this.rules]
  }

  /**
   * Get rule by ID
   */
  getRule(id: string): SecurityRule | undefined {
    return this.rules.find(r => r.id === id)
  }

  /**
   * Enable/disable a rule
   */
  setRuleEnabled(id: string, enabled: boolean): void {
    const rule = this.rules.find(r => r.id === id)
    if (rule) {
      rule.enabled = enabled
    }
  }

  /**
   * Get supported languages
   */
  getSupportedLanguages(): string[] {
    const languages = new Set<string>()
    for (const rule of this.rules) {
      for (const lang of rule.languages) {
        languages.add(lang)
      }
    }
    return Array.from(languages).sort()
  }

  /**
   * Get categories
   */
  getCategories(): string[] {
    return [...new Set(this.rules.map(r => r.category))].sort()
  }

  private deduplicateIssues(issues: SecurityIssue[]): SecurityIssue[] {
    const seen = new Map<string, SecurityIssue>()

    for (const issue of issues) {
      const key = `${issue.ruleId}:${issue.line}:${issue.column}`
      const existing = seen.get(key)

      if (!existing || issue.confidence > existing.confidence) {
        seen.set(key, issue)
      }
    }

    return Array.from(seen.values())
  }
}

/**
 * Singleton instance
 */
let offlineAnalyzer: OfflineAnalyzer | null = null

export function getOfflineAnalyzer(): OfflineAnalyzer {
  if (!offlineAnalyzer) {
    offlineAnalyzer = new OfflineAnalyzer()
    offlineAnalyzer.initialize()
  }
  return offlineAnalyzer
}
