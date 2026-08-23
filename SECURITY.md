# Security

## Secrets

- Keep `GEMINI_API_KEY` in the server environment only.
- Never add a real value to `.env.example`, frontend JavaScript, logs, screenshots, or issues.
- Browser obfuscation, Base64 encoding, and splitting a key into strings do not protect it.
- The credential formerly embedded in `index.html` must be considered compromised. Revoke it at the provider, inspect its usage, and create a restricted replacement. Moving that old credential to `.env` is not sufficient.
- Git history may still contain the old credential. Rotating it is mandatory even though the current working tree no longer contains it.

## Production controls

The server applies a restrictive Content Security Policy, same-origin checks, JSON-only API requests, schema validation, request-size limits, AI endpoint rate limits, safe error responses, and `Cache-Control: no-store` for API responses. Provider requests use a server-only header, a timeout, structured JSON output, and one bounded retry.

Authentication uses a bcrypt password hash from `APP_LOGIN_PASSWORD_HASH` and an HMAC-signed, eight-hour session cookie. The cookie is HttpOnly, SameSite=Strict, and Secure in production. Protected API requests also require an in-memory CSRF token. Login attempts are rate-limited. Production startup fails when authentication or AI environment variables are missing.

Run `npm run setup-auth` locally to generate the password hash and `SESSION_SECRET`. Never commit the resulting `.env` file or reuse one session secret across unrelated deployments.

Restrict the new provider credential by API and environment where the provider supports it. Put the application behind HTTPS and a trusted reverse proxy. Rate limiting reduces abuse but does not replace user authentication or provider quotas for a high-traffic public service.

## Reporting

Report vulnerabilities privately to the repository owner. Do not include credentials or user vocabulary in a public report.
