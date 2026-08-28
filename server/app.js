import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { AUTH_COOKIE_NAME, SESSION_TTL_MS } from './auth.js';
import { chatRequestSchema, loginRequestSchema, translateRequestSchema } from './validation.js';
import { Vocabulary } from './db.js';

const serverDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(serverDir, '..');
const publicDir = path.join(projectRoot, 'public');

function originAllowed(req, allowedOrigins) {
  const origin = req.get('origin');
  if (!origin) return true;
  if (allowedOrigins.has(origin)) return true;
  const forwardedProto = req.get('x-forwarded-proto')?.split(',')[0].trim();
  const protocol = forwardedProto || req.protocol;
  return origin === `${protocol}://${req.get('host')}`;
}

function parseBody(schema, req, res) {
  const result = schema.safeParse(req.body);
  if (result.success) return result.data;
  res.status(400).json({ error: 'INVALID_REQUEST', message: 'تحقق من البيانات المدخلة وحاول مرة أخرى.' });
  return null;
}

export function createApp({ aiClient, authService, allowedOrigins = [], trustProxy = false, production = false } = {}) {
  if (!aiClient) throw new Error('aiClient is required');
  if (!authService) throw new Error('authService is required');

  const app = express();
  if (trustProxy) app.set('trust proxy', 1);

  app.disable('x-powered-by');
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        mediaSrc: ["'self'"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"]
      }
    },
    crossOriginEmbedderPolicy: false
  }));
  app.use(express.json({ limit: '12kb', type: 'application/json' }));

  const origins = new Set(allowedOrigins.filter(Boolean));
  app.use(['/api', '/auth'], (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!originAllowed(req, origins)) {
      return res.status(403).json({ error: 'ORIGIN_NOT_ALLOWED', message: 'الطلب غير مسموح من هذا المصدر.' });
    }
    if (req.method === 'POST' && !req.is('application/json')) {
      return res.status(415).json({ error: 'UNSUPPORTED_MEDIA_TYPE', message: 'يجب إرسال البيانات بصيغة JSON.' });
    }
    return next();
  });

  const aiLimiter = rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'RATE_LIMITED', message: 'طلبات كثيرة. انتظر قليلًا.' } });
  const loginLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 5, standardHeaders: 'draft-8', legacyHeaders: false, skipSuccessfulRequests: true, message: { error: 'RATE_LIMITED', message: 'محاولات كثيرة. انتظر 15 دقيقة.' } });

  const cookieOptions = { httpOnly: true, secure: production, sameSite: 'strict', path: '/', maxAge: SESSION_TTL_MS };

  function requireAuthentication(req, res, next) {
    const session = authService.readSession(req.get('cookie'));
    if (!session) return res.status(401).json({ error: 'AUTH_REQUIRED', message: 'يجب تسجيل الدخول أولًا.' });
    req.authSession = session;
    return next();
  }

  function requireCsrf(req, res, next) {
    if (!authService.verifyCsrf(req.authSession, req.get('x-csrf-token'))) {
      return res.status(403).json({ error: 'INVALID_CSRF', message: 'انتهت صلاحية الطلب. سجّل الدخول مجددًا.' });
    }
    return next();
  }

  app.get('/health', (_req, res) => {
    res.set('Cache-Control', 'no-store').json({ status: 'ok', aiConfigured: Boolean(aiClient.configured), authConfigured: Boolean(authService.configured) });
  });

  app.get('/auth/status', (req, res) => {
    const session = authService.readSession(req.get('cookie'));
    res.json({ configured: Boolean(authService.configured), authenticated: Boolean(session), csrfToken: session?.csrfToken || null });
  });

  app.post('/auth/register', loginLimiter, async (req, res, next) => {
    if (!authService.configured) return res.status(503).json({ error: 'AUTH_NOT_CONFIGURED', message: 'لم يتم إعداد الخادم بعد.' });
    const input = parseBody(loginRequestSchema, req, res);
    if (!input) return;
    try {
      const result = await authService.registerUser(input.email, input.password);
      if (!result.success) return res.status(400).json({ error: 'REGISTRATION_FAILED', message: result.error });
      const token = authService.createSessionToken(input.email);
      res.cookie(AUTH_COOKIE_NAME, token, cookieOptions);
      const session = authService.readSession(`${AUTH_COOKIE_NAME}=${encodeURIComponent(token)}`);
      return res.json({ authenticated: true, csrfToken: session.csrfToken });
    } catch (error) { return next(error); }
  });

  app.post('/auth/login', loginLimiter, async (req, res, next) => {
    if (!authService.configured) return res.status(503).json({ error: 'AUTH_NOT_CONFIGURED', message: 'لم يتم إعداد الخادم بعد.' });
    const input = parseBody(loginRequestSchema, req, res);
    if (!input) return;
    try {
      const valid = await authService.verifyCredentials(input.email, input.password);
      if (!valid) return res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'البريد الإلكتروني أو كلمة المرور غير صحيحة.' });
      const token = authService.createSessionToken(input.email);
      res.cookie(AUTH_COOKIE_NAME, token, cookieOptions);
      const session = authService.readSession(`${AUTH_COOKIE_NAME}=${encodeURIComponent(token)}`);
      return res.json({ authenticated: true, csrfToken: session.csrfToken });
    } catch (error) { return next(error); }
  });

  app.post('/auth/logout', requireAuthentication, requireCsrf, (req, res) => {
    res.clearCookie(AUTH_COOKIE_NAME, { httpOnly: true, secure: production, sameSite: 'strict', path: '/' });
    res.json({ authenticated: false });
  });

  app.use('/api', requireAuthentication, requireCsrf);

  app.get('/api/sync', async (req, res, next) => {
    try {
      const vocab = await Vocabulary.findOne({ email: req.authSession.email });
      res.json({ records: vocab ? vocab.records : [] });
    } catch (error) { next(error); }
  });

  app.post('/api/sync', async (req, res, next) => {
    try {
      const { records } = req.body;
      if (!Array.isArray(records)) return res.status(400).json({ error: 'INVALID_FORMAT' });
      await Vocabulary.findOneAndUpdate(
        { email: req.authSession.email },
        { records },
        { upsert: true, new: true }
      );
      res.json({ success: true });
    } catch (error) { next(error); }
  });

  app.post('/api/translate', aiLimiter, async (req, res, next) => {
    const input = parseBody(translateRequestSchema, req, res);
    if (!input) return;
    try { res.json(await aiClient.translate(input)); } catch (error) { next(error); }
  });

  app.post('/api/chat', aiLimiter, async (req, res, next) => {
    const input = parseBody(chatRequestSchema, req, res);
    if (!input) return;
    try { res.json(await aiClient.chat(input)); } catch (error) { next(error); }
  });

  app.get('/music.mp3', (_req, res) => res.sendFile(path.join(projectRoot, 'music.mp3')));
  app.use(express.static(publicDir, { index: 'index.html', maxAge: 0, etag: true }));
  app.use(['/api', '/auth'], (_req, res) => { res.status(404).json({ error: 'NOT_FOUND', message: 'المسار المطلوب غير موجود.' }); });

  app.use((error, _req, res, _next) => {
    const providerUnavailable = !aiClient.configured || error?.name === 'AbortError';
    console.error(JSON.stringify({ level: 'error', event: 'api_request_failed', type: error?.name || 'Error' }));
    res.status(providerUnavailable ? 503 : 502).json({ error: 'AI_UNAVAILABLE', message: 'تعذر الاتصال بالخدمة حاليًا.' });
  });

  return app;
}
