import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';

export const AUTH_COOKIE_NAME = 'translator_session';
export const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function readCookie(cookieHeader, name) {
  if (!cookieHeader) return null;
  for (const pair of cookieHeader.split(';')) {
    const separator = pair.indexOf('=');
    if (separator < 0) continue;
    const key = pair.slice(0, separator).trim();
    if (key === name) return decodeURIComponent(pair.slice(separator + 1).trim());
  }
  return null;
}

export function createAuthService({ email, passwordHash, sessionSecret, now = () => Date.now() }) {
  const normalizedEmail = String(email || '').trim().toLocaleLowerCase('en-US');
  const secret = String(sessionSecret || '');
  const hash = String(passwordHash || '');
  const configured = Boolean(
    normalizedEmail &&
    /^\$2[aby]\$\d{2}\$/.test(hash) &&
    secret.length >= 32
  );

  function signature(value) {
    return crypto.createHmac('sha256', secret).update(value).digest('base64url');
  }

  function createSessionToken() {
    if (!configured) throw new Error('Authentication is not configured');
    const payload = Buffer.from(JSON.stringify({ version: 1, expiresAt: now() + SESSION_TTL_MS })).toString('base64url');
    return `${payload}.${signature(payload)}`;
  }

  function validateToken(token) {
    if (!configured || typeof token !== 'string') return false;
    const [payload, providedSignature, extra] = token.split('.');
    if (!payload || !providedSignature || extra || !safeEqual(signature(payload), providedSignature)) return false;
    try {
      const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
      return data.version === 1 && Number.isFinite(data.expiresAt) && data.expiresAt > now();
    } catch {
      return false;
    }
  }

  function readSession(cookieHeader) {
    const token = readCookie(cookieHeader, AUTH_COOKIE_NAME);
    if (!validateToken(token)) return null;
    return { token, csrfToken: signature(`csrf:${token}`) };
  }

  return {
    configured,
    async verifyCredentials(candidateEmail, password) {
      if (!configured) return false;
      const emailMatches = safeEqual(
        String(candidateEmail || '').trim().toLocaleLowerCase('en-US'),
        normalizedEmail
      );
      const passwordMatches = await bcrypt.compare(String(password || ''), hash);
      return emailMatches && passwordMatches;
    },
    createSessionToken,
    readSession,
    verifyCsrf(session, suppliedToken) {
      return Boolean(session && suppliedToken && safeEqual(session.csrfToken, suppliedToken));
    }
  };
}
