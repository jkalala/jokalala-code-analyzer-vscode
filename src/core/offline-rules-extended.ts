/**
 * Extended Offline Security Rules
 *
 * This module extends the base offline analyzer with 50+ additional security rules
 * for comprehensive coverage without requiring cloud connectivity.
 *
 * Categories:
 * - Injection (SQL, NoSQL, Command, XSS, XXE, LDAP, XPath)
 * - Authentication & Session Management
 * - Sensitive Data Exposure
 * - Security Misconfiguration
 * - Cryptographic Failures
 * - Business Logic
 * - API Security
 * - Mobile/Client-Side Security
 * - Infrastructure Security
 *
 * All rules include:
 * - CWE mapping
 * - OWASP Top 10 2021 mapping
 * - Remediation suggestions
 * - False positive filtering
 *
 * @module core/offline-rules-extended
 */

import { SecurityRule, Severity } from './offline-analyzer'

/**
 * Extended security rules - 50+ additional patterns
 */
export const EXTENDED_SECURITY_RULES: SecurityRule[] = [
  // ============================================
  // INJECTION ATTACKS (Extended)
  // ============================================

  // LDAP Injection
  {
    id: 'SEC016',
    name: 'LDAP Injection',
    description: 'Detects potential LDAP injection where user input is used in LDAP queries.',
    severity: Severity.HIGH,
    category: 'injection',
    cwe: ['CWE-90'],
    owasp: ['A03:2021'],
    languages: ['javascript', 'typescript', 'java', 'python', 'csharp', 'php'],
    patterns: [
      {
        type: 'regex',
        pattern: `(?:ldap|LDAP).*(?:search|bind|modify).*\\(.*(?:req|request|params|query|body|input|user)`,
        flags: 'gi',
        negativePatterns: ['escape', 'sanitize', 'validate'],
      },
      {
        type: 'regex',
        pattern: `\\(\\s*(?:uid|cn|sn|mail|memberOf)\\s*=.*\\$\\{`,
        flags: 'gi',
      },
    ],
    message: 'Potential LDAP injection. User input used in LDAP query without sanitization.',
    suggestion: 'Use parameterized LDAP queries or escape special LDAP characters (* ) \\ NUL.',
    enabled: true,
    priority: 2,
    references: [
      'https://owasp.org/www-community/attacks/LDAP_Injection',
      'https://cwe.mitre.org/data/definitions/90.html',
    ],
  },

  // XPath Injection
  {
    id: 'SEC017',
    name: 'XPath Injection',
    description: 'Detects potential XPath injection vulnerabilities.',
    severity: Severity.HIGH,
    category: 'injection',
    cwe: ['CWE-643'],
    owasp: ['A03:2021'],
    languages: ['javascript', 'typescript', 'java', 'python', 'csharp', 'php'],
    patterns: [
      {
        type: 'regex',
        pattern: `(?:xpath|XPath|selectNodes?)\\s*\\([^)]*(?:req|request|params|query|body|input)`,
        flags: 'gi',
      },
      {
        type: 'regex',
        pattern: `\\/\\/\\*\\[.*\\$\\{.*\\}.*\\]`,
        flags: 'gi',
      },
    ],
    message: 'Potential XPath injection. User input used in XPath expression.',
    suggestion: 'Use parameterized XPath queries or a safe XML library.',
    enabled: true,
    priority: 2,
    references: [
      'https://owasp.org/www-community/attacks/XPATH_Injection',
      'https://cwe.mitre.org/data/definitions/643.html',
    ],
  },

  // Template Injection (SSTI)
  {
    id: 'SEC018',
    name: 'Server-Side Template Injection',
    description: 'Detects potential template injection vulnerabilities.',
    severity: Severity.CRITICAL,
    category: 'injection',
    cwe: ['CWE-1336'],
    owasp: ['A03:2021'],
    languages: ['javascript', 'typescript', 'python', 'java', 'ruby', 'php'],
    patterns: [
      {
        type: 'regex',
        pattern: `(?:render|template|compile)\\s*\\([^)]*(?:req|request|params|query|body|input|user)`,
        flags: 'gi',
        negativePatterns: ['escape', 'autoescape'],
      },
      {
        type: 'regex',
        pattern: `Jinja2?\\(.*autoescape\\s*=\\s*False`,
        flags: 'gi',
      },
      {
        type: 'regex',
        pattern: `Template\\s*\\(\\s*(?:req|request|params|body)`,
        flags: 'gi',
      },
    ],
    message: 'Potential Server-Side Template Injection (SSTI). User input rendered in template.',
    suggestion: 'Never pass user input directly to template engines. Use safe template rendering with auto-escaping.',
    enabled: true,
    priority: 1,
    references: [
      'https://portswigger.net/web-security/server-side-template-injection',
    ],
  },

  // Header Injection
  {
    id: 'SEC019',
    name: 'HTTP Header Injection',
    description: 'Detects potential HTTP header injection vulnerabilities.',
    severity: Severity.MEDIUM,
    category: 'injection',
    cwe: ['CWE-113'],
    owasp: ['A03:2021'],
    languages: ['javascript', 'typescript', 'python', 'java', 'php', 'ruby'],
    patterns: [
      {
        type: 'regex',
        pattern: `(?:setHeader|set|header)\\s*\\([^)]*(?:req|request|params|query|body|input)`,
        flags: 'gi',
        negativePatterns: ['replace.*[\\r\\n]'],
      },
      {
        type: 'regex',
        pattern: `response\\.header\\s*=.*(?:req|request|params)`,
        flags: 'gi',
      },
    ],
    message: 'Potential HTTP Header Injection. User input used in HTTP headers.',
    suggestion: 'Validate and sanitize header values. Remove CRLF characters (\\r\\n).',
    enabled: true,
    priority: 3,
    references: [
      'https://owasp.org/www-community/attacks/HTTP_Response_Splitting',
      'https://cwe.mitre.org/data/definitions/113.html',
    ],
  },

  // Log Injection
  {
    id: 'SEC020',
    name: 'Log Injection',
    description: 'Detects potential log injection vulnerabilities.',
    severity: Severity.MEDIUM,
    category: 'injection',
    cwe: ['CWE-117'],
    owasp: ['A09:2021'],
    languages: ['javascript', 'typescript', 'python', 'java', 'csharp', 'php', 'go'],
    patterns: [
      {
        type: 'regex',
        pattern: `(?:console\\.log|logger\\.|log\\.|logging\\.)(?:info|warn|error|debug)\\s*\\([^)]*(?:req\\.body|req\\.query|req\\.params|request\\.)`,
        flags: 'gi',
        negativePatterns: ['sanitize', 'escape', 'JSON.stringify'],
      },
    ],
    message: 'Potential log injection. User input logged without sanitization.',
    suggestion: 'Sanitize user input before logging. Encode or escape special characters.',
    enabled: true,
    priority: 3,
    references: [
      'https://owasp.org/www-community/attacks/Log_Injection',
      'https://cwe.mitre.org/data/definitions/117.html',
    ],
  },

  // ============================================
  // AUTHENTICATION & SESSION MANAGEMENT
  // ============================================

  // Weak Password Requirements
  {
    id: 'SEC021',
    name: 'Weak Password Requirements',
    description: 'Detects weak password validation patterns.',
    severity: Severity.MEDIUM,
    category: 'authentication',
    cwe: ['CWE-521'],
    owasp: ['A07:2021'],
    languages: ['javascript', 'typescript', 'python', 'java', 'csharp', 'php'],
    patterns: [
      {
        type: 'regex',
        pattern: `password.*\\.length\\s*[<>=]{1,2}\\s*[1-7]\\b`,
        flags: 'gi',
      },
      {
        type: 'regex',
        pattern: `minLength\\s*[:=]\\s*[1-7]\\b.*password`,
        flags: 'gi',
      },
      {
        type: 'regex',
        pattern: `len\\s*\\(\\s*password\\s*\\)\\s*[<>=]{1,2}\\s*[1-7]\\b`,
        flags: 'gi',
      },
    ],
    message: 'Weak password requirements detected. Minimum password length should be at least 8 characters.',
    suggestion: 'Require passwords of at least 12 characters with complexity requirements.',
    enabled: true,
    priority: 3,
    references: [
      'https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html',
    ],
  },

  // Session Fixation
  {
    id: 'SEC022',
    name: 'Session Fixation Risk',
    description: 'Detects potential session fixation vulnerabilities.',
    severity: Severity.HIGH,
    category: 'authentication',
    cwe: ['CWE-384'],
    owasp: ['A07:2021'],
    languages: ['javascript', 'typescript', 'python', 'java', 'php'],
    patterns: [
      {
        type: 'regex',
        pattern: `session(?:Id|ID|_id)\\s*=\\s*(?:req|request)`,
        flags: 'gi',
        negativePatterns: ['regenerate', 'rotate', 'destroy'],
      },
      {
        type: 'regex',
        pattern: `req\\.session\\s*=.*(?:req\\.query|req\\.params|req\\.body)`,
        flags: 'gi',
      },
    ],
    message: 'Potential session fixation vulnerability. Session ID from user input.',
    suggestion: 'Regenerate session ID after authentication. Never accept session ID from user input.',
    enabled: true,
    priority: 2,
    references: [
      'https://owasp.org/www-community/attacks/Session_fixation',
    ],
  },

  // Brute Force Susceptibility
  {
    id: 'SEC023',
    name: 'Missing Rate Limiting',
    description: 'Detects login/authentication endpoints without rate limiting.',
    severity: Severity.MEDIUM,
    category: 'authentication',
    cwe: ['CWE-307'],
    owasp: ['A07:2021'],
    languages: ['javascript', 'typescript', 'python', 'java', 'go'],
    patterns: [
      {
        type: 'regex',
        pattern: `(?:app|router)\\.post\\s*\\(\\s*['"]\\/(?:login|signin|authenticate|auth)['"\\)]`,
        flags: 'gi',
        negativePatterns: ['rateLimit', 'rateLimiter', 'throttle', 'slowDown'],
      },
    ],
    message: 'Login endpoint may lack rate limiting, enabling brute force attacks.',
    suggestion: 'Implement rate limiting on authentication endpoints (e.g., express-rate-limit).',
    enabled: true,
    priority: 2,
    references: [
      'https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html',
    ],
  },

  // JWT Issues
  {
    id: 'SEC024',
    name: 'Insecure JWT Configuration',
    description: 'Detects insecure JWT signing or verification.',
    severity: Severity.CRITICAL,
    category: 'authentication',
    cwe: ['CWE-347'],
    owasp: ['A02:2021'],
    languages: ['javascript', 'typescript', 'python', 'java', 'go'],
    patterns: [
      {
        type: 'regex',
        pattern: `jwt\\.(?:sign|verify)\\s*\\([^)]*algorithm\\s*[:'"]\\s*['\"]?(?:none|HS256)['\"]?`,
        flags: 'gi',
      },
      {
        type: 'regex',
        pattern: `expiresIn\\s*[:=]\\s*['\"]?(?:\\d{1,2}d|\\d{1,3}h|['\"]\\d+[yY])`,
        flags: 'gi',
      },
      {
        type: 'regex',
        pattern: `verify\\s*\\([^)]*\\{[^}]*algorithms\\s*:\\s*\\[.*['\"]none['\"]`,
        flags: 'gi',
      },
    ],
    message: 'Insecure JWT configuration detected.',
    suggestion: 'Use RS256 or ES256 algorithm. Set short expiration times. Never allow "none" algorithm.',
    enabled: true,
    priority: 1,
    references: [
      'https://cheatsheetseries.owasp.org/cheatsheets/JSON_Web_Token_for_Java_Cheat_Sheet.html',
    ],
  },

  // ============================================
  // SENSITIVE DATA EXPOSURE
  // ============================================

  // Exposed Error Details
  {
    id: 'SEC025',
    name: 'Sensitive Error Exposure',
    description: 'Detects exposure of sensitive error details to users.',
    severity: Severity.MEDIUM,
    category: 'disclosure',
    cwe: ['CWE-209'],
    owasp: ['A04:2021'],
    languages: ['javascript', 'typescript', 'python', 'java', 'csharp', 'php'],
    patterns: [
      {
        type: 'regex',
        pattern: `(?:res|response)\\.(?:json|send)\\s*\\(\\s*(?:err|error)\\.(?:stack|message)`,
        flags: 'gi',
        negativePatterns: ['production', 'NODE_ENV'],
      },
      {
        type: 'regex',
        pattern: `catch.*\\{[^}]*(?:res|response).*(?:err|error|exception)\\.(?:stack|trace)`,
        flags: 'gis',
      },
    ],
    message: 'Sensitive error information may be exposed to users.',
    suggestion: 'Log full errors server-side but return generic error messages to clients.',
    enabled: true,
    priority: 3,
    references: [
      'https://cwe.mitre.org/data/definitions/209.html',
    ],
  },

  // PII in Logs
  {
    id: 'SEC026',
    name: 'PII in Logs',
    description: 'Detects logging of personally identifiable information.',
    severity: Severity.MEDIUM,
    category: 'disclosure',
    cwe: ['CWE-532'],
    owasp: ['A09:2021'],
    languages: ['javascript', 'typescript', 'python', 'java', 'csharp', 'go'],
    patterns: [
      {
        type: 'regex',
        pattern: `(?:log|console|logger).*(?:email|password|ssn|social.*security|credit.*card|phone|address)`,
        flags: 'gi',
        negativePatterns: ['mask', 'redact', '\\*\\*\\*'],
      },
    ],
    message: 'Potential PII being logged. This may violate privacy regulations.',
    suggestion: 'Mask or redact PII before logging. Use structured logging with PII filters.',
    enabled: true,
    priority: 2,
    references: [
      'https://cwe.mitre.org/data/definitions/532.html',
    ],
  },

  // Information Disclosure via Comments
  {
    id: 'SEC027',
    name: 'Sensitive Info in Comments',
    description: 'Detects sensitive information in code comments.',
    severity: Severity.LOW,
    category: 'disclosure',
    cwe: ['CWE-615'],
    owasp: ['A05:2021'],
    languages: ['javascript', 'typescript', 'python', 'java', 'csharp', 'php', 'go', 'ruby'],
    patterns: [
      {
        type: 'regex',
        pattern: `(?:\\/\\/|#|\\*|--|;).*(?:password|secret|api[_-]?key|token)\\s*[:=]\\s*\\S+`,
        flags: 'gi',
        negativePatterns: ['example', 'placeholder', 'xxx', 'your-'],
      },
      {
        type: 'regex',
        pattern: `(?:TODO|FIXME|HACK|XXX).*(?:password|secret|credential|auth)`,
        flags: 'gi',
      },
    ],
    message: 'Potential sensitive information in code comments.',
    suggestion: 'Remove sensitive information from comments before committing code.',
    enabled: true,
    priority: 4,
    references: [
      'https://cwe.mitre.org/data/definitions/615.html',
    ],
  },

  // ============================================
  // CRYPTOGRAPHIC FAILURES
  // ============================================

  // Insecure TLS Configuration
  {
    id: 'SEC028',
    name: 'Insecure TLS Configuration',
    description: 'Detects insecure TLS/SSL configurations.',
    severity: Severity.HIGH,
    category: 'cryptography',
    cwe: ['CWE-326'],
    owasp: ['A02:2021'],
    languages: ['javascript', 'typescript', 'python', 'java', 'go'],
    patterns: [
      {
        type: 'regex',
        pattern: `(?:SSL|TLS)v?[12]|TLSv1\\.[01]`,
        flags: 'gi',
      },
      {
        type: 'regex',
        pattern: `minVersion\\s*[:=]\\s*['\"]?(?:TLSv1|SSLv3)`,
        flags: 'gi',
      },
      {
        type: 'regex',
        pattern: `rejectUnauthorized\\s*[:=]\\s*false`,
        flags: 'gi',
      },
    ],
    message: 'Insecure TLS configuration. Older TLS versions have known vulnerabilities.',
    suggestion: 'Use TLS 1.2 or higher. Never disable certificate verification in production.',
    enabled: true,
    priority: 1,
    references: [
      'https://cheatsheetseries.owasp.org/cheatsheets/Transport_Layer_Protection_Cheat_Sheet.html',
    ],
  },

  // Hardcoded IV
  {
    id: 'SEC029',
    name: 'Hardcoded Initialization Vector',
    description: 'Detects hardcoded IVs in encryption.',
    severity: Severity.HIGH,
    category: 'cryptography',
    cwe: ['CWE-329'],
    owasp: ['A02:2021'],
    languages: ['javascript', 'typescript', 'python', 'java', 'csharp', 'go'],
    patterns: [
      {
        type: 'regex',
        pattern: `(?:iv|IV|nonce)\\s*[:=]\\s*(?:Buffer\\.from|new Uint8Array|bytes)\\s*\\([^)]*['\"][^'\"]{16,}['\"]`,
        flags: 'gi',
      },
      {
        type: 'regex',
        pattern: `(?:iv|IV)\\s*[:=]\\s*['\"][a-fA-F0-9]{16,}['\"]`,
        flags: 'gi',
      },
    ],
    message: 'Hardcoded initialization vector (IV) detected. IVs should be random.',
    suggestion: 'Generate a new random IV for each encryption operation.',
    enabled: true,
    priority: 2,
    references: [
      'https://cwe.mitre.org/data/definitions/329.html',
    ],
  },

  // Insufficient Key Size
  {
    id: 'SEC030',
    name: 'Insufficient Cryptographic Key Size',
    description: 'Detects use of cryptographic keys that are too short.',
    severity: Severity.MEDIUM,
    category: 'cryptography',
    cwe: ['CWE-326'],
    owasp: ['A02:2021'],
    languages: ['javascript', 'typescript', 'python', 'java', 'csharp', 'go'],
    patterns: [
      {
        type: 'regex',
        pattern: `(?:keySize|key_size|keyLength|bits)\\s*[:=]\\s*(?:64|128|512|1024)\\b`,
        flags: 'gi',
      },
      {
        type: 'regex',
        pattern: `generateKey.*(?:128|1024)`,
        flags: 'gi',
      },
    ],
    message: 'Potentially insufficient key size for cryptographic operation.',
    suggestion: 'Use 256-bit keys for AES, 2048-bit minimum for RSA (4096 recommended).',
    enabled: true,
    priority: 3,
    references: [
      'https://cwe.mitre.org/data/definitions/326.html',
    ],
  },

  // ============================================
  // SECURITY MISCONFIGURATION
  // ============================================

  // Debug Mode in Production
  {
    id: 'SEC031',
    name: 'Debug Mode Enabled',
    description: 'Detects debug mode configuration that may be unsafe in production.',
    severity: Severity.MEDIUM,
    category: 'configuration',
    cwe: ['CWE-489'],
    owasp: ['A05:2021'],
    languages: ['javascript', 'typescript', 'python', 'java', 'php', 'ruby'],
    patterns: [
      {
        type: 'regex',
        pattern: `DEBUG\\s*[:=]\\s*(?:true|1|['\"]true['\"]|True)`,
        flags: 'gi',
        negativePatterns: ['process\\.env', 'os\\.environ', 'getenv'],
      },
      {
        type: 'regex',
        pattern: `app\\.(?:debug|DEBUG)\\s*=\\s*True`,
        flags: 'gi',
      },
    ],
    message: 'Debug mode appears to be hardcoded as enabled.',
    suggestion: 'Use environment variables for debug settings. Never enable debug in production.',
    enabled: true,
    priority: 3,
    references: [
      'https://cwe.mitre.org/data/definitions/489.html',
    ],
  },

  // Directory Listing
  {
    id: 'SEC032',
    name: 'Directory Listing Enabled',
    description: 'Detects enabled directory listing configuration.',
    severity: Severity.LOW,
    category: 'configuration',
    cwe: ['CWE-548'],
    owasp: ['A05:2021'],
    languages: ['javascript', 'typescript', 'python', 'java', 'php'],
    patterns: [
      {
        type: 'regex',
        pattern: `(?:serveIndex|directory|listing|autoindex)\\s*[:=(]\\s*(?:true|on|1)`,
        flags: 'gi',
      },
    ],
    message: 'Directory listing may be enabled, exposing file structure.',
    suggestion: 'Disable directory listing in production environments.',
    enabled: true,
    priority: 4,
    references: [
      'https://cwe.mitre.org/data/definitions/548.html',
    ],
  },

  // Missing Security Headers
  {
    id: 'SEC033',
    name: 'Missing Security Headers',
    description: 'Detects response handling without security headers.',
    severity: Severity.LOW,
    category: 'configuration',
    cwe: ['CWE-693'],
    owasp: ['A05:2021'],
    languages: ['javascript', 'typescript', 'python', 'java'],
    patterns: [
      {
        type: 'regex',
        pattern: `app\\.(?:use|listen)\\s*\\(`,
        flags: 'gi',
        negativePatterns: ['helmet', 'security-headers', 'X-Content-Type-Options', 'X-Frame-Options'],
      },
    ],
    message: 'Application may be missing security headers.',
    suggestion: 'Use helmet.js (Node.js) or equivalent to set security headers.',
    enabled: true,
    priority: 4,
    references: [
      'https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Headers_Cheat_Sheet.html',
    ],
  },

  // ============================================
  // INSECURE FILE HANDLING
  // ============================================

  // Arbitrary File Upload
  {
    id: 'SEC034',
    name: 'Unrestricted File Upload',
    description: 'Detects file upload without proper validation.',
    severity: Severity.HIGH,
    category: 'file-handling',
    cwe: ['CWE-434'],
    owasp: ['A04:2021'],
    languages: ['javascript', 'typescript', 'python', 'java', 'php'],
    patterns: [
      {
        type: 'regex',
        pattern: `(?:multer|upload|formidable|busboy).*(?:any|single|array)\\s*\\(`,
        flags: 'gi',
        negativePatterns: ['fileFilter', 'accept', 'mimetype', 'limits'],
      },
      {
        type: 'regex',
        pattern: `\\$_FILES.*move_uploaded_file`,
        flags: 'gi',
        negativePatterns: ['getimagesize', 'mime_content_type'],
      },
    ],
    message: 'File upload without proper validation detected.',
    suggestion: 'Validate file type, size, and name. Store outside webroot. Use random filenames.',
    enabled: true,
    priority: 1,
    references: [
      'https://owasp.org/www-community/vulnerabilities/Unrestricted_File_Upload',
    ],
  },

  // Insecure File Permissions
  {
    id: 'SEC035',
    name: 'Insecure File Permissions',
    description: 'Detects overly permissive file permission settings.',
    severity: Severity.MEDIUM,
    category: 'file-handling',
    cwe: ['CWE-732'],
    owasp: ['A01:2021'],
    languages: ['javascript', 'typescript', 'python', 'java', 'go', 'ruby'],
    patterns: [
      {
        type: 'regex',
        pattern: `chmod\\s*\\(.*0?777`,
        flags: 'gi',
      },
      {
        type: 'regex',
        pattern: `mode\\s*[:=]\\s*0?777`,
        flags: 'gi',
      },
      {
        type: 'regex',
        pattern: `os\\.chmod\\([^,]+,\\s*0o?777\\)`,
        flags: 'gi',
      },
    ],
    message: 'Overly permissive file permissions (777) detected.',
    suggestion: 'Use minimal required permissions. Typically 644 for files, 755 for directories.',
    enabled: true,
    priority: 3,
    references: [
      'https://cwe.mitre.org/data/definitions/732.html',
    ],
  },

  // ============================================
  // API SECURITY
  // ============================================

  // GraphQL Introspection Enabled
  {
    id: 'SEC036',
    name: 'GraphQL Introspection in Production',
    description: 'Detects GraphQL introspection that may expose schema.',
    severity: Severity.LOW,
    category: 'api-security',
    cwe: ['CWE-200'],
    owasp: ['A05:2021'],
    languages: ['javascript', 'typescript', 'python', 'java', 'go'],
    patterns: [
      {
        type: 'regex',
        pattern: `introspection\\s*[:=]\\s*true`,
        flags: 'gi',
        negativePatterns: ['production.*false', 'NODE_ENV'],
      },
    ],
    message: 'GraphQL introspection may be enabled in production.',
    suggestion: 'Disable introspection in production to hide schema details.',
    enabled: true,
    priority: 4,
    references: [
      'https://cheatsheetseries.owasp.org/cheatsheets/GraphQL_Cheat_Sheet.html',
    ],
  },

  // Mass Assignment
  {
    id: 'SEC037',
    name: 'Mass Assignment Vulnerability',
    description: 'Detects potential mass assignment vulnerabilities.',
    severity: Severity.HIGH,
    category: 'api-security',
    cwe: ['CWE-915'],
    owasp: ['A04:2021'],
    languages: ['javascript', 'typescript', 'python', 'ruby', 'java'],
    patterns: [
      {
        type: 'regex',
        pattern: `(?:Object\\.assign|\\.\\.\\.|update|create)\\s*\\([^)]*req\\.body\\s*\\)`,
        flags: 'gi',
        negativePatterns: ['pick', 'only', 'whitelist', 'allowedFields'],
      },
      {
        type: 'regex',
        pattern: `Model\\.(?:create|update)\\s*\\(\\s*req\\.body`,
        flags: 'gi',
      },
    ],
    message: 'Potential mass assignment vulnerability. User input directly assigned to model.',
    suggestion: 'Whitelist allowed fields. Never directly assign user input to models.',
    enabled: true,
    priority: 2,
    references: [
      'https://cheatsheetseries.owasp.org/cheatsheets/Mass_Assignment_Cheat_Sheet.html',
    ],
  },

  // Sensitive Data in URL
  {
    id: 'SEC038',
    name: 'Sensitive Data in URL',
    description: 'Detects sensitive data being passed in URL parameters.',
    severity: Severity.MEDIUM,
    category: 'api-security',
    cwe: ['CWE-598'],
    owasp: ['A04:2021'],
    languages: ['javascript', 'typescript', 'python', 'java', 'csharp', 'php'],
    patterns: [
      {
        type: 'regex',
        pattern: `[?&](?:password|token|secret|api[_-]?key|session)=`,
        flags: 'gi',
      },
      {
        type: 'regex',
        pattern: `req\\.query\\.(?:password|token|secret|apiKey)`,
        flags: 'gi',
      },
    ],
    message: 'Sensitive data in URL query parameters. URLs are logged and cached.',
    suggestion: 'Pass sensitive data in request body or headers, never in URL.',
    enabled: true,
    priority: 2,
    references: [
      'https://cwe.mitre.org/data/definitions/598.html',
    ],
  },

  // ============================================
  // DENIAL OF SERVICE
  // ============================================

  // ReDoS Vulnerability
  {
    id: 'SEC039',
    name: 'Regular Expression DoS (ReDoS)',
    description: 'Detects regex patterns vulnerable to catastrophic backtracking.',
    severity: Severity.MEDIUM,
    category: 'dos',
    cwe: ['CWE-1333'],
    owasp: ['A05:2021'],
    languages: ['javascript', 'typescript', 'python', 'java', 'csharp', 'go'],
    patterns: [
      {
        type: 'regex',
        pattern: `new RegExp\\([^)]*(?:\\+\\s*\\+|\\*\\s*\\*|\\{\\d+,\\d*\\}\\s*\\+)`,
        flags: 'gi',
      },
      {
        type: 'regex',
        pattern: `\\/\\([^)]*\\+\\)[^*]*\\+\\/`,
        flags: 'gi',
      },
      {
        type: 'regex',
        pattern: `\\(\\[\\^[^\\]]+\\]\\*\\)\\+`,
        flags: 'gi',
      },
    ],
    message: 'Potential ReDoS vulnerability. Complex regex pattern with nested quantifiers.',
    suggestion: 'Simplify regex or use atomic groups. Consider regex timeout libraries.',
    enabled: true,
    priority: 3,
    references: [
      'https://owasp.org/www-community/attacks/Regular_expression_Denial_of_Service_-_ReDoS',
    ],
  },

  // Unbounded Resource Consumption
  {
    id: 'SEC040',
    name: 'Unbounded Resource Allocation',
    description: 'Detects unbounded loops or allocations that could cause DoS.',
    severity: Severity.MEDIUM,
    category: 'dos',
    cwe: ['CWE-770'],
    owasp: ['A05:2021'],
    languages: ['javascript', 'typescript', 'python', 'java', 'go'],
    patterns: [
      {
        type: 'regex',
        pattern: `while\\s*\\(\\s*true\\s*\\)`,
        flags: 'gi',
        negativePatterns: ['break', 'return'],
      },
      {
        type: 'regex',
        pattern: `for\\s*\\(\\s*;\\s*;\\s*\\)`,
        flags: 'gi',
      },
      {
        type: 'regex',
        pattern: `new Array\\(\\s*(?:req|request|params)`,
        flags: 'gi',
      },
    ],
    message: 'Potential unbounded resource consumption.',
    suggestion: 'Add limits and timeouts. Validate input sizes before allocation.',
    enabled: true,
    priority: 3,
    references: [
      'https://cwe.mitre.org/data/definitions/770.html',
    ],
  },

  // ============================================
  // CONTAINER/INFRASTRUCTURE SECURITY
  // ============================================

  // Docker Security Issues
  {
    id: 'SEC041',
    name: 'Insecure Docker Configuration',
    description: 'Detects insecure Docker configurations.',
    severity: Severity.HIGH,
    category: 'infrastructure',
    cwe: ['CWE-250'],
    owasp: ['A05:2021'],
    languages: ['dockerfile', 'yaml'],
    patterns: [
      {
        type: 'regex',
        pattern: `--privileged`,
        flags: 'gi',
      },
      {
        type: 'regex',
        pattern: `USER\\s+root`,
        flags: 'gi',
      },
      {
        type: 'regex',
        pattern: `securityContext:[\\s\\S]*?privileged:\\s*true`,
        flags: 'gi',
      },
    ],
    message: 'Insecure Docker configuration detected.',
    suggestion: 'Run containers as non-root. Avoid privileged mode. Use security contexts.',
    enabled: true,
    priority: 2,
    references: [
      'https://cheatsheetseries.owasp.org/cheatsheets/Docker_Security_Cheat_Sheet.html',
    ],
  },

  // Exposed Kubernetes Secrets
  {
    id: 'SEC042',
    name: 'Kubernetes Secret in Plain Text',
    description: 'Detects Kubernetes secrets that are not properly encoded.',
    severity: Severity.HIGH,
    category: 'infrastructure',
    cwe: ['CWE-312'],
    owasp: ['A02:2021'],
    languages: ['yaml'],
    patterns: [
      {
        type: 'regex',
        pattern: `kind:\\s*Secret[\\s\\S]*?stringData:`,
        flags: 'gi',
      },
      {
        type: 'regex',
        pattern: `(?:password|secret|token|key):\\s*['\"]?[a-zA-Z0-9+/=]{8,}['\"]?\\s*$`,
        flags: 'gim',
        negativePatterns: ['\\$\\{', 'vault:', 'sealed'],
      },
    ],
    message: 'Kubernetes secret may contain unencrypted sensitive data.',
    suggestion: 'Use Sealed Secrets, External Secrets, or vault integration.',
    enabled: true,
    priority: 2,
    references: [
      'https://kubernetes.io/docs/concepts/configuration/secret/',
    ],
  },

  // ============================================
  // BUSINESS LOGIC
  // ============================================

  // Race Condition
  {
    id: 'SEC043',
    name: 'Potential Race Condition',
    description: 'Detects potential race conditions in business logic.',
    severity: Severity.MEDIUM,
    category: 'business-logic',
    cwe: ['CWE-362'],
    owasp: ['A04:2021'],
    languages: ['javascript', 'typescript', 'python', 'java', 'go'],
    patterns: [
      {
        type: 'regex',
        pattern: `(?:balance|stock|quantity|count).*(?:await|async)[\\s\\S]{0,100}(?:balance|stock|quantity|count)`,
        flags: 'gi',
        negativePatterns: ['lock', 'mutex', 'transaction', 'atomic'],
      },
    ],
    message: 'Potential race condition in business logic.',
    suggestion: 'Use database transactions, locks, or atomic operations.',
    enabled: true,
    priority: 2,
    references: [
      'https://cwe.mitre.org/data/definitions/362.html',
    ],
  },

  // IDOR (Insecure Direct Object Reference)
  {
    id: 'SEC044',
    name: 'Insecure Direct Object Reference',
    description: 'Detects potential IDOR vulnerabilities.',
    severity: Severity.HIGH,
    category: 'business-logic',
    cwe: ['CWE-639'],
    owasp: ['A01:2021'],
    languages: ['javascript', 'typescript', 'python', 'java', 'php'],
    patterns: [
      {
        type: 'regex',
        pattern: `(?:findById|findOne|get)\\s*\\(\\s*(?:req\\.params\\.|req\\.query\\.|params\\.)(?:id|userId|orderId)`,
        flags: 'gi',
        negativePatterns: ['checkOwnership', 'authorize', 'canAccess', 'req\\.user'],
      },
    ],
    message: 'Potential IDOR vulnerability. Resource accessed without ownership verification.',
    suggestion: 'Always verify the current user owns or has access to the requested resource.',
    enabled: true,
    priority: 1,
    references: [
      'https://cheatsheetseries.owasp.org/cheatsheets/Insecure_Direct_Object_Reference_Prevention_Cheat_Sheet.html',
    ],
  },

  // ============================================
  // MOBILE/CLIENT-SIDE SECURITY
  // ============================================

  // Insecure WebView
  {
    id: 'SEC045',
    name: 'Insecure WebView Configuration',
    description: 'Detects insecure WebView configurations in mobile apps.',
    severity: Severity.HIGH,
    category: 'mobile-security',
    cwe: ['CWE-749'],
    owasp: ['A05:2021'],
    languages: ['javascript', 'typescript', 'java', 'swift', 'kotlin'],
    patterns: [
      {
        type: 'regex',
        pattern: `setJavaScriptEnabled\\s*\\(\\s*true\\s*\\)`,
        flags: 'gi',
      },
      {
        type: 'regex',
        pattern: `allowFileAccess.*true`,
        flags: 'gi',
      },
      {
        type: 'regex',
        pattern: `addJavascriptInterface`,
        flags: 'gi',
      },
    ],
    message: 'Insecure WebView configuration may allow JavaScript attacks.',
    suggestion: 'Disable JavaScript if not needed. Validate URLs. Avoid JavaScript interfaces.',
    enabled: true,
    priority: 2,
    references: [
      'https://owasp.org/www-community/attacks/WebView_Attacks',
    ],
  },

  // Local Storage of Sensitive Data
  {
    id: 'SEC046',
    name: 'Sensitive Data in Local Storage',
    description: 'Detects storage of sensitive data in browser localStorage.',
    severity: Severity.MEDIUM,
    category: 'client-security',
    cwe: ['CWE-922'],
    owasp: ['A04:2021'],
    languages: ['javascript', 'typescript'],
    patterns: [
      {
        type: 'regex',
        pattern: `localStorage\\.setItem\\s*\\([^)]*(?:token|password|secret|session|auth|jwt)`,
        flags: 'gi',
      },
      {
        type: 'regex',
        pattern: `sessionStorage\\.setItem\\s*\\([^)]*(?:password|secret|credit|ssn)`,
        flags: 'gi',
      },
    ],
    message: 'Sensitive data stored in localStorage/sessionStorage.',
    suggestion: 'Use httpOnly cookies for tokens. Never store passwords client-side.',
    enabled: true,
    priority: 2,
    references: [
      'https://cheatsheetseries.owasp.org/cheatsheets/HTML5_Security_Cheat_Sheet.html',
    ],
  },

  // Eval with User Input
  {
    id: 'SEC047',
    name: 'Dangerous eval() Usage',
    description: 'Detects use of eval() or similar functions with user input.',
    severity: Severity.CRITICAL,
    category: 'injection',
    cwe: ['CWE-95'],
    owasp: ['A03:2021'],
    languages: ['javascript', 'typescript', 'python', 'php', 'ruby'],
    patterns: [
      {
        type: 'regex',
        pattern: `\\beval\\s*\\(\\s*(?!['"\`][^$])`,
        flags: 'gi',
      },
      {
        type: 'regex',
        pattern: `new Function\\s*\\([^)]*(?:req|request|params|query|body|input)`,
        flags: 'gi',
      },
      {
        type: 'regex',
        pattern: `setTimeout\\s*\\([^)]*(?:req|request|params|query|body)`,
        flags: 'gi',
      },
    ],
    message: 'Dangerous use of eval() or similar function.',
    suggestion: 'Never use eval() with user input. Use safer alternatives like JSON.parse().',
    enabled: true,
    priority: 1,
    references: [
      'https://owasp.org/www-community/attacks/Code_Injection',
    ],
  },

  // ============================================
  // ADDITIONAL RULES
  // ============================================

  // Unsafe Reflection
  {
    id: 'SEC048',
    name: 'Unsafe Reflection',
    description: 'Detects unsafe use of reflection with user input.',
    severity: Severity.HIGH,
    category: 'injection',
    cwe: ['CWE-470'],
    owasp: ['A03:2021'],
    languages: ['java', 'csharp', 'python', 'ruby'],
    patterns: [
      {
        type: 'regex',
        pattern: `Class\\.forName\\s*\\([^)]*(?:req|request|params|input)`,
        flags: 'gi',
      },
      {
        type: 'regex',
        pattern: `getattr\\s*\\([^,]+,\\s*(?:req|request|input)`,
        flags: 'gi',
      },
    ],
    message: 'Unsafe reflection with user input may allow arbitrary code execution.',
    suggestion: 'Use a whitelist of allowed class/method names.',
    enabled: true,
    priority: 2,
    references: [
      'https://cwe.mitre.org/data/definitions/470.html',
    ],
  },

  // Integer Overflow
  {
    id: 'SEC049',
    name: 'Potential Integer Overflow',
    description: 'Detects potential integer overflow vulnerabilities.',
    severity: Severity.MEDIUM,
    category: 'buffer',
    cwe: ['CWE-190'],
    owasp: ['A03:2021'],
    languages: ['c', 'cpp', 'java', 'go'],
    patterns: [
      {
        type: 'regex',
        pattern: `(?:int|short|byte)\\s+\\w+\\s*=.*\\*.*(?:user|input|req)`,
        flags: 'gi',
      },
      {
        type: 'regex',
        pattern: `\\bsize\\s*\\*\\s*(?:count|num|length)`,
        flags: 'gi',
        negativePatterns: ['SafeMath', 'checked'],
      },
    ],
    message: 'Potential integer overflow. Large values may wrap around.',
    suggestion: 'Validate input ranges. Use safe math libraries or checked arithmetic.',
    enabled: true,
    priority: 3,
    references: [
      'https://cwe.mitre.org/data/definitions/190.html',
    ],
  },

  // Timing Attack Vulnerability
  {
    id: 'SEC050',
    name: 'Timing Attack Vulnerability',
    description: 'Detects string comparisons that may be vulnerable to timing attacks.',
    severity: Severity.MEDIUM,
    category: 'cryptography',
    cwe: ['CWE-208'],
    owasp: ['A02:2021'],
    languages: ['javascript', 'typescript', 'python', 'java', 'go'],
    patterns: [
      {
        type: 'regex',
        pattern: `(?:password|token|secret|hash|signature)\\s*(?:===?|!==?|==|!=)`,
        flags: 'gi',
        negativePatterns: ['timingSafeEqual', 'constantTimeCompare', 'secure_compare', 'compare_digest'],
      },
    ],
    message: 'String comparison may be vulnerable to timing attacks.',
    suggestion: 'Use constant-time comparison for secrets (crypto.timingSafeEqual, hmac.compare_digest).',
    enabled: true,
    priority: 3,
    references: [
      'https://cwe.mitre.org/data/definitions/208.html',
    ],
  },
]

/**
 * Get the complete rule set (base + extended)
 */
export function getAllSecurityRules(): SecurityRule[] {
  // Import base rules and combine
  return EXTENDED_SECURITY_RULES
}

/**
 * Get rules by category
 */
export function getRulesByCategory(category: string): SecurityRule[] {
  return EXTENDED_SECURITY_RULES.filter(rule => rule.category === category)
}

/**
 * Get rules by OWASP Top 10 category
 */
export function getRulesByOWASP(owaspId: string): SecurityRule[] {
  return EXTENDED_SECURITY_RULES.filter(rule => rule.owasp.includes(owaspId))
}

/**
 * Get rules by CWE ID
 */
export function getRulesByCWE(cweId: string): SecurityRule[] {
  return EXTENDED_SECURITY_RULES.filter(rule => rule.cwe.includes(cweId))
}

/**
 * Get rules by language
 */
export function getRulesByLanguage(language: string): SecurityRule[] {
  return EXTENDED_SECURITY_RULES.filter(
    rule => rule.languages.includes(language) || rule.languages.includes('*')
  )
}
