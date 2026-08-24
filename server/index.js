import 'dotenv/config';
// هنا غيرنا الاستدعاء ليصير لـ DeepSeek بدل جيمني
import { createDeepSeekClient } from './ai.js';
import { createApp } from './app.js';
import { createAuthService } from './auth.js';

const isProduction = process.env.NODE_ENV === 'production';
// عدلنا أسماء المتغيرات عشان تقرأ مفتاح DeepSeek من الخزنة
const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
const model = process.env.DEEPSEEK_MODEL?.trim() || 'deepseek-chat';

const loginEmail = process.env.APP_LOGIN_EMAIL?.trim();
const loginPasswordHash = process.env.APP_LOGIN_PASSWORD_HASH?.trim();
const sessionSecret = process.env.SESSION_SECRET?.trim();

if (isProduction && (!apiKey || !model || !loginEmail || !loginPasswordHash || !sessionSecret)) {
    throw new Error('AI and authentication environment variables are required in production');
}

const port = Number.parseInt(process.env.PORT || '3000', 10);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be a valid TCP port');
}

const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

// إنشاء عميل DeepSeek للترجمة
const aiClient = createDeepSeekClient({ apiKey, model });

const authService = createAuthService({
    email: loginEmail,
    passwordHash: loginPasswordHash,
    sessionSecret
});

if (isProduction && !authService.configured) {
    throw new Error('Authentication configuration is invalid');
}

const app = createApp({
    aiClient,
    authService,
    allowedOrigins,
    trustProxy: process.env.TRUST_PROXY === 'true',
    production: isProduction
});

app.listen(port, () => {
    console.log(`Smart Translator is listening on port ${port}`);
    if (!aiClient.configured) console.warn('AI provider is not configured; translation endpoints will return 503.');
    if (!authService.configured) console.warn('Authentication is not configured; run npm run setup-auth.');
});
