# Security Policy

## Supported Versions

We release patches for security vulnerabilities in the following versions:

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

We take security seriously at Jokalala. We appreciate your efforts to responsibly disclose your findings.

### How to Report

**Please DO NOT report security vulnerabilities through public GitHub issues.**

Instead, please report security vulnerabilities through one of these channels:

1. **GitHub Security Advisories** (Preferred)

   Navigate to the [Security tab](https://github.com/jokalala/jokalala-code-analyzer-vscode/security/advisories/new) and create a new private security advisory.

2. **Email**

   Send details to [security@jokalala.com](mailto:security@jokalala.com)

   If possible, encrypt your message using our PGP key (available at [jokalala.com/pgp](https://jokalala.com/pgp)).

### What to Include

Please include the following information to help us understand and resolve the issue:

- **Type of vulnerability** (e.g., XSS, CSRF, injection, etc.)
- **Full paths of source files** related to the vulnerability
- **Step-by-step instructions** to reproduce the issue
- **Proof-of-concept or exploit code** (if possible)
- **Impact assessment** - what an attacker could achieve
- **Any special configuration** required to reproduce

### Response Timeline

- **Initial Response**: Within 48 hours
- **Triage & Assessment**: Within 5 business days
- **Resolution Timeline**: Depends on severity
  - Critical: 7 days
  - High: 14 days
  - Medium: 30 days
  - Low: 60 days

### What to Expect

1. **Acknowledgment**: You will receive an acknowledgment of your report within 48 hours.

2. **Assessment**: Our security team will assess the vulnerability and determine its severity.

3. **Updates**: We will keep you informed about our progress throughout the process.

4. **Fix & Disclosure**: Once the vulnerability is fixed:
   - We will notify you before public disclosure
   - You will be credited (unless you prefer anonymity)
   - A CVE will be requested if applicable

### Bug Bounty

Currently, we do not have a formal bug bounty program. However, we recognize and appreciate security researchers who help us improve. Significant contributions may be recognized through:

- Public acknowledgment in our security advisory
- Mention in release notes
- Jokalala swag and recognition

## Security Best Practices for Users

### API Key Security

- **Never commit API keys** to version control
- Use VS Code's SecretStorage (the extension does this automatically)
- Rotate keys periodically
- Use different keys for development and production

### Extension Security

- Only install extensions from trusted sources
- Keep the extension updated to the latest version
- Review extension permissions before installation
- Report suspicious behavior immediately

### Network Security

- Always use HTTPS endpoints
- The extension warns if HTTP is configured
- Ensure your network allows secure connections to our API

## Security Features

The Jokalala Code Analyzer includes several security features:

### Secure Storage

- API keys stored using VS Code's encrypted SecretStorage API
- No plaintext credentials in settings files
- Automatic migration from legacy storage

### Input Validation

- All user inputs are validated and sanitized
- XSS prevention with HTML escaping
- Path traversal protection

### Privacy Protection

- PII anonymization in telemetry
- File paths, emails, and tokens are redacted
- Opt-out available for all telemetry

### Network Security

- HTTPS enforcement (HTTP triggers warnings)
- Request validation
- Response integrity checks

## Known Security Considerations

### Extension Trust Model

As a VS Code extension, we operate within VS Code's security model:

- Extensions run with the same permissions as VS Code
- We minimize required permissions to essential functionality
- We follow VS Code's extension security guidelines

### Data Handling

- Code snippets sent to our API for analysis
- We do not store code longer than necessary for analysis
- See our [Privacy Policy](https://jokalala.com/privacy) for details

## Security Updates

Security updates are released as patch versions (e.g., 1.0.1) and are automatically available through VS Code's extension update mechanism.

To ensure you receive security updates:

1. Enable auto-updates in VS Code
2. Or manually check for updates regularly

## Contact

For security-related questions that don't involve vulnerability reports:

- Email: [security@jokalala.com](mailto:security@jokalala.com)
- Website: [jokalala.com/security](https://jokalala.com/security)

---

Thank you for helping keep Jokalala Code Analyzer and our users safe!
