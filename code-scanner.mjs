/**
 * Lightweight Code Security Scanner
 *
 * Regex-based pattern matching for common security vulnerabilities:
 * SQL injection, XSS, command injection, path traversal, hardcoded secrets, insecure crypto
 */

const VULNERABILITY_PATTERNS = [
  // SQL Injection
  {
    type: 'sql-injection',
    severity: 'high',
    patterns: [
      { regex: /(?:query|execute|exec|run)\s*\(\s*['"`].*?\$\{.*?\}/g, desc: 'String interpolation in SQL query' },
      { regex: /(?:query|execute|exec|run)\s*\(\s*['"`].*?\+\s*(?:req\.|params\.|body\.|query\.)/g, desc: 'String concatenation with user input in SQL query' },
      { regex: /(?:query|execute|exec|run)\s*\(\s*`[^`]*\$\{(?:req|params|body|query|args|input|user)/g, desc: 'Template literal with user input in SQL query' },
      { regex: /['"]SELECT\s+.*?(?:WHERE|FROM).*?['"\s]*\+\s*\w+/gi, desc: 'SQL string concatenation' },
      { regex: /['"](?:INSERT|UPDATE|DELETE)\s+.*?['"\s]*\+\s*\w+/gi, desc: 'SQL write operation with string concatenation' },
    ],
    suggestion: 'Use parameterized queries or prepared statements instead of string concatenation.',
  },
  // XSS (Cross-Site Scripting)
  {
    type: 'xss',
    severity: 'high',
    patterns: [
      { regex: /\.innerHTML\s*=\s*(?!['"`]<)/g, desc: 'Dynamic innerHTML assignment' },
      { regex: /\.innerHTML\s*\+=\s*/g, desc: 'innerHTML concatenation' },
      { regex: /document\.write\s*\(/g, desc: 'document.write usage' },
      { regex: /\.outerHTML\s*=/g, desc: 'Dynamic outerHTML assignment' },
      { regex: /\beval\s*\(\s*(?!['"`])/g, desc: 'eval() with dynamic input' },
      { regex: /res\.send\s*\(\s*(?:req\.|params\.|body\.|query\.)/g, desc: 'Unescaped user input in response' },
      { regex: /dangerouslySetInnerHTML/g, desc: 'React dangerouslySetInnerHTML' },
    ],
    suggestion: 'Sanitize user input before rendering. Use textContent instead of innerHTML. Use a templating engine with auto-escaping.',
  },
  // Command Injection
  {
    type: 'command-injection',
    severity: 'critical',
    patterns: [
      { regex: /child_process.*exec\s*\(\s*(?!['"`])/g, desc: 'exec() with dynamic input' },
      { regex: /(?:exec|execSync|spawn|spawnSync)\s*\(\s*`[^`]*\$\{/g, desc: 'Command execution with template literal interpolation' },
      { regex: /(?:exec|execSync)\s*\(\s*['"].*?\+\s*(?:req\.|params\.|body\.|query\.|args|input|user)/g, desc: 'Command with concatenated user input' },
      { regex: /(?:exec|execSync|spawn)\s*\(\s*(?:req\.|params\.|body\.|query\.)/g, desc: 'Direct user input in command execution' },
      { regex: /child_process.*exec\s*\(\s*`/g, desc: 'exec with template literal' },
      { regex: /os\.(?:system|popen)\s*\(\s*(?!['"`])/g, desc: 'Python os.system/popen with dynamic input' },
      { regex: /subprocess\.(?:call|run|Popen)\s*\(\s*(?:f['"]|.*?\+)/g, desc: 'Python subprocess with dynamic input' },
    ],
    suggestion: 'Never pass user input directly to shell commands. Use execFile() with an argument array, or validate/sanitize inputs.',
  },
  // Path Traversal
  {
    type: 'path-traversal',
    severity: 'high',
    patterns: [
      { regex: /(?:readFile|readFileSync|createReadStream|access|stat)\s*\(\s*(?:req\.|params\.|body\.|query\.)/g, desc: 'File read with user-controlled path' },
      { regex: /(?:readFile|readFileSync|createReadStream|access|stat)\s*\(\s*`[^`]*\$\{(?:req|params|body|query)/g, desc: 'File read with interpolated user path' },
      { regex: /(?:readFile|readFileSync|createReadStream)\s*\(\s*(?:path\.join|path\.resolve)\s*\([^)]*(?:req\.|params\.|body\.|query\.)/g, desc: 'Path.join with user-controlled segment' },
      { regex: /\.\.\/|\.\.\\|%2e%2e/gi, desc: 'Path traversal pattern in string literal' },
      { regex: /open\s*\(\s*(?:request\.|params\.|args\.)/g, desc: 'File open with user input (Python)' },
    ],
    suggestion: 'Validate and sanitize file paths. Use path.resolve() and ensure the result is within allowed directories. Never use user input directly in file paths.',
  },
  // Hardcoded Secrets
  {
    type: 'hardcoded-secret',
    severity: 'medium',
    patterns: [
      { regex: /(?:password|passwd|pwd)\s*[:=]\s*['"][^'"]{4,}['"]/gi, desc: 'Hardcoded password' },
      { regex: /(?:api[_-]?key|apikey)\s*[:=]\s*['"][A-Za-z0-9_\-]{10,}['"]/gi, desc: 'Hardcoded API key' },
      { regex: /(?:secret|token)\s*[:=]\s*['"][A-Za-z0-9_\-]{10,}['"]/gi, desc: 'Hardcoded secret/token' },
      { regex: /(?:AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY)\s*[:=]\s*['"][A-Z0-9]{16,}['"]/g, desc: 'Hardcoded AWS credentials' },
      { regex: /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/g, desc: 'Embedded private key' },
      { regex: /(?:ghp_|gho_|github_pat_)[A-Za-z0-9_]{30,}/g, desc: 'GitHub personal access token' },
      { regex: /sk-[A-Za-z0-9]{20,}/g, desc: 'OpenAI-style API key' },
    ],
    suggestion: 'Store secrets in environment variables or a secrets manager. Never hardcode credentials in source code.',
  },
  // Insecure Crypto
  {
    type: 'insecure-crypto',
    severity: 'medium',
    patterns: [
      { regex: /createHash\s*\(\s*['"](?:md5|sha1)['"]\s*\)/g, desc: 'Weak hash algorithm (MD5/SHA1)' },
      { regex: /createCipher\s*\(\s*['"](?:des|rc4|blowfish)['"]/gi, desc: 'Weak cipher algorithm' },
      { regex: /Math\.random\s*\(\s*\)/g, desc: 'Math.random() used (not cryptographically secure)' },
      { regex: /createCipher\b/g, desc: 'createCipher (deprecated, use createCipheriv)' },
      { regex: /hashlib\.(?:md5|sha1)\s*\(/g, desc: 'Python weak hash (md5/sha1)' },
      { regex: /random\.(?:random|randint|choice)\s*\(/g, desc: 'Python random module (not cryptographic)' },
    ],
    suggestion: 'Use SHA-256+ for hashing, AES-256-GCM for encryption, and crypto.randomBytes() for random values.',
  },
];

/**
 * Scan code for security vulnerabilities
 * @param {string} code - Source code to scan
 * @param {string} language - Programming language (js, python, etc.)
 * @returns {{ vulnerabilities: Array, summary: string, score: number }}
 */
export function scanCode(code, language) {
  const lines = code.split('\n');
  const vulnerabilities = [];
  const seenLocations = new Set();

  for (const category of VULNERABILITY_PATTERNS) {
    for (const pattern of category.patterns) {
      // Reset regex state
      const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
      let match;
      while ((match = regex.exec(code)) !== null) {
        // Find the line number
        const beforeMatch = code.slice(0, match.index);
        const lineNum = beforeMatch.split('\n').length;
        const locationKey = `${category.type}:${lineNum}`;

        // Deduplicate same type on same line
        if (seenLocations.has(locationKey)) continue;
        seenLocations.add(locationKey);

        vulnerabilities.push({
          severity: category.severity,
          type: category.type,
          line: lineNum,
          description: pattern.desc,
          suggestion: category.suggestion,
          snippet: lines[lineNum - 1]?.trim().slice(0, 120) || '',
        });
      }
    }
  }

  // Sort by severity (critical > high > medium > low)
  const severityOrder = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
  vulnerabilities.sort((a, b) => (severityOrder[a.severity] ?? 5) - (severityOrder[b.severity] ?? 5));

  // Calculate score (100 = clean, 0 = very vulnerable)
  const deductions = vulnerabilities.reduce((sum, v) => {
    const penalty = { critical: 25, high: 15, medium: 8, low: 3, info: 1 };
    return sum + (penalty[v.severity] ?? 5);
  }, 0);
  const score = Math.max(0, 100 - deductions);

  // Build summary
  const counts = {};
  for (const v of vulnerabilities) {
    counts[v.severity] = (counts[v.severity] || 0) + 1;
  }
  const countParts = Object.entries(counts).map(([s, c]) => `${c} ${s}`);
  const summary = vulnerabilities.length === 0
    ? `No security vulnerabilities detected. Code looks clean. Score: ${score}/100.`
    : `Found ${vulnerabilities.length} potential vulnerabilities (${countParts.join(', ')}). Security score: ${score}/100.`;

  return { vulnerabilities, summary, score };
}
