# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 2.2.x | ✅ Active |
| 2.1.x | ⚠️ Security fixes only |
| < 2.1.0 | ❌ No longer supported |

## Reporting a Vulnerability

**Please do NOT open a public GitHub issue for security vulnerabilities.**

If you discover a security vulnerability in SorarinBot, please report it responsibly:

1. **Email**: zyc2597376118@gmail.com
2. **Subject**: `[SECURITY] SorarinBot - <brief description>`
3. **Include**:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

## Response Timeline

| Step | Timeline |
|------|----------|
| Acknowledgment | Within 48 hours |
| Initial assessment | Within 5 business days |
| Fix or mitigation | Depends on severity |

## Scope

### In Scope

- Remote code execution
- Authentication/authorization bypass
- Data leakage (API keys, tokens, chat history)
- Denial of service via crafted input
- Path traversal or file inclusion
- SQL injection in database queries

### Out of Scope

- WeChat protocol-level issues (upstream dependency)
- LLM API provider issues (third-party service)
- Social engineering attacks
- Physical access to the user's machine
- Issues requiring root/admin access to the system

## Security Best Practices for Users

1. **Never share** `config.yaml` (contains API key) or `token.json` (contains WeChat login token)
2. **Bind to localhost** — Keep `web.listen: localhost:8080` unless you need remote access
3. **Use a firewall** — If exposing to a network, restrict access to trusted IPs only
4. **Keep updated** — Always use the latest version for security patches
5. **Separate API keys** — Use dedicated API keys with spending limits for the bot

## Acknowledgments

We appreciate responsible disclosure and will credit reporters in release notes (unless they prefer anonymity).
