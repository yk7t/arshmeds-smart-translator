import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { User } from './db.js';

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

export function createAuthService({ sessionSecret, now = () => Date.now() }) {
  const secret = String(sessionSecret || '');
  const configured = secret.length >= 32;

  function signature(value) {
    return crypto.createHmac('sha256', secret).update(value).digest('base64url');
  }

  function createSessionToken(email) {
    if (!configured) throw new Error('Authentication is not configured');
    const payload = Buffer.from(JSON.stringify({ version: 1, email, expiresAt: now() + SESSION_TTL_MS })).toString('base64url');
    return `${payload}.${signature(payload)}`;
  }

  function validateToken(token) {
    if (!configured || typeof token !== 'string') return null;
    const [payload, providedSignature, extra] = token.split('.');
    if (!payload || !providedSignature || extra || !safeEqual(signature(payload), providedSignature)) return null;
    try {
      const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
      if (data.version === 1 && Number.isFinite(data.expiresAt) && data.expiresAt > now()) return data;
      return null;
    } catch {
      return null;
    }
  }

  function readSession(cookieHeader) {
    const token = readCookie(cookieHeader, AUTH_COOKIE_NAME);
    const data = validateToken(token);
    if (!data) return null;
    return { token, email: data.email, csrfToken: signature(`csrf:${token}`) };
  }

  return {
    configured,
    async registerUser(email, password) {
      if (!configured) return { success: false, error: 'لم يتم إعداد مفتاح الأمان للحسابات.' };
      const normalizedEmail = String(email || '').trim().toLocaleLowerCase('en-US');
      const existingUser = await User.findOne({ email: normalizedEmail });
      if (existingUser) return { success: false, error: 'البريد الإلكتروني مسجل مسبقاً.' };

      const hashedPassword = await bcrypt.hash(String(password || ''), 10);
      await User.create({ email: normalizedEmail, password: hashedPassword });
      return { success: true };
    },
    async verifyCredentials(candidateEmail, password) {
      if (!configured) return false;
      const normalizedEmail = String(candidateEmail || '').trim().toLocaleLowerCase('en-US');
      const user = await User.findOne({ email: normalizedEmail });
      if (!user) return false;
      return await bcrypt.compare(String(password || ''), user.password);
    },
    createSessionToken,
    readSession,
    verifyCsrf(session, suppliedToken) {
      return Boolean(session && suppliedToken && safeEqual(session.csrfToken, suppliedToken));
    }
  };
}
