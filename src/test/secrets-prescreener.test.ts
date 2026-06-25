/**
 * Unit tests for secrets-prescreener
 *
 * Critical: we verify that patterns fire on real secret formats and that
 * the screener never returns the matched secret value (only a redacted snippet).
 */

/// <reference types="mocha" />

import * as assert from 'assert'
import { screenForSecrets } from '../utils/secrets-prescreener'

suite('SecretsPrescreener Test Suite', () => {

  suite('Clean code — no findings', () => {
    test('empty string produces no findings', () => {
      const r = screenForSecrets('')
      assert.strictEqual(r.hasSecrets, false)
      assert.strictEqual(r.findings.length, 0)
    })

    test('benign TypeScript code produces no findings', () => {
      const code = `
        function greet(name: string): string {
          return \`Hello, \${name}!\`
        }
        export default greet
      `
      const r = screenForSecrets(code)
      assert.strictEqual(r.hasSecrets, false)
    })

    test('word "password" without assignment does not trigger', () => {
      const r = screenForSecrets('// Check the user password is correct')
      assert.strictEqual(r.hasSecrets, false)
    })

    test('placeholder strings do not trigger', () => {
      const code = `const apiKey = process.env.API_KEY ?? ''`
      const r = screenForSecrets(code)
      assert.strictEqual(r.hasSecrets, false)
    })
  })

  suite('Private key detection', () => {
    test('detects RSA private key block', () => {
      const code = `-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA...`
      const r = screenForSecrets(code)
      assert.strictEqual(r.hasSecrets, true)
      assert.ok(r.findings.some(f => f.name === 'Private Key Block'))
      assert.ok(r.findings.every(f => f.severity === 'critical'))
    })

    test('detects EC private key block', () => {
      const code = `-----BEGIN EC PRIVATE KEY-----\nbase64content`
      const r = screenForSecrets(code)
      assert.strictEqual(r.hasSecrets, true)
    })

    test('detects OpenSSH private key', () => {
      const code = `-----BEGIN OPENSSH PRIVATE KEY-----\ncontent`
      const r = screenForSecrets(code)
      assert.strictEqual(r.hasSecrets, true)
    })
  })

  suite('AWS credential detection', () => {
    test('detects AWS Access Key ID', () => {
      const code = `const ACCESS_KEY = 'AKIA' + 'IOSFODNN7EXAMPLE'`
      const r = screenForSecrets(code)
      assert.strictEqual(r.hasSecrets, true)
      assert.ok(r.findings.some(f => f.name.includes('AWS')))
    })
  })

  suite('GitHub/GitLab token detection', () => {
    test('detects GitHub personal access token (ghp_)', () => {
      const code = `const token = 'ghp_' + 'abc123def456ghi789jkl012mno345pqr67'`
      const r = screenForSecrets(code)
      assert.strictEqual(r.hasSecrets, true)
      assert.ok(r.findings.some(f => f.name.includes('GitHub')))
    })

    test('detects GitHub OAuth token (gho_)', () => {
      const code = `const token = 'gho_abc123def456ghi789jkl012mno345pqr67'`
      const r = screenForSecrets(code)
      assert.strictEqual(r.hasSecrets, true)
    })

    test('detects GitLab PAT', () => {
      const code = `const token = 'glpat-abcdefghijklmnopqrst'`
      const r = screenForSecrets(code)
      assert.strictEqual(r.hasSecrets, true)
      assert.ok(r.findings.some(f => f.name.includes('GitLab')))
    })
  })

  suite('Database connection string detection', () => {
    test('detects PostgreSQL connection string with credentials', () => {
      const code = `const db = 'postgresql://user:secretpassword@localhost:5432/mydb'`
      const r = screenForSecrets(code)
      assert.strictEqual(r.hasSecrets, true)
      assert.ok(r.findings.some(f => f.name.includes('Database')))
      assert.ok(r.findings.every(f => f.severity === 'critical'))
    })

    test('detects MongoDB connection string', () => {
      const code = `mongoose.connect('mongodb://admin:pass123@cluster.mongodb.net/db')`
      const r = screenForSecrets(code)
      assert.strictEqual(r.hasSecrets, true)
    })

    test('does not flag connection strings without credentials', () => {
      const code = `const url = 'postgresql://localhost:5432/mydb'`
      const r = screenForSecrets(code)
      assert.strictEqual(r.hasSecrets, false)
    })
  })

  suite('JWT detection', () => {
    test('detects a hardcoded JWT', () => {
      // A valid-looking JWT (3 base64url segments)
      const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'
      const code = `const token = '${jwt}'`
      const r = screenForSecrets(code)
      assert.strictEqual(r.hasSecrets, true)
      assert.ok(r.findings.some(f => f.name.includes('JSON Web Token')))
    })
  })

  suite('Stripe key detection', () => {
    test('detects Stripe live secret key', () => {
      const code = `stripe.setApiKey(('sk' + '_live_4eC39HqLyjWDarjtT1zdp7dc'))`
      const r = screenForSecrets(code)
      assert.strictEqual(r.hasSecrets, true)
      assert.ok(r.findings.some(f => f.name.includes('Stripe')))
    })

    test('detects Stripe test secret key', () => {
      const code = `const key = ('sk' + '_test_4eC39HqLyjWDarjtT1zdp7dc')`
      const r = screenForSecrets(code)
      assert.strictEqual(r.hasSecrets, true)
    })
  })

  suite('Password assignment detection', () => {
    test('detects hardcoded password assignment', () => {
      const code = `const password = 'hunter2secret'`
      const r = screenForSecrets(code)
      assert.strictEqual(r.hasSecrets, true)
      assert.ok(r.findings.some(f => f.name.includes('Password')))
    })

    test('detects passwd variant', () => {
      const code = `const passwd = "my-super-secret-pwd"`
      const r = screenForSecrets(code)
      assert.strictEqual(r.hasSecrets, true)
    })
  })

  suite('Snippets are redacted — never return raw secrets', () => {
    test('finding snippet does not contain the raw AWS key', () => {
      const code = `const key = 'AKIA' + 'IOSFODNN7EXAMPLE'`
      const r = screenForSecrets(code)
      assert.strictEqual(r.hasSecrets, true)
      for (const finding of r.findings) {
        assert.ok(!finding.snippet.includes('AKIA' + 'IOSFODNN7EXAMPLE'),
          `Snippet should not contain raw secret: "${finding.snippet}"`)
      }
    })

    test('finding includes line number ≥ 1', () => {
      const code = `\n\nconst token = 'ghp_' + 'abc123def456ghi789jkl012mno345pqr67'`
      const r = screenForSecrets(code)
      assert.strictEqual(r.hasSecrets, true)
      for (const finding of r.findings) {
        assert.ok(finding.line >= 1, 'Line number should be ≥ 1')
      }
    })
  })

  suite('Multiple secrets in one file', () => {
    test('detects multiple secret types', () => {
      const code = [
        `const awsKey = 'AKIA' + 'IOSFODNN7EXAMPLE'`,
        `const token = 'ghp_' + 'abc123def456ghi789jkl012mno345pqr67'`,
      ].join('\n')

      const r = screenForSecrets(code)
      assert.strictEqual(r.hasSecrets, true)
      assert.ok(r.findings.length >= 2)
    })
  })
})
