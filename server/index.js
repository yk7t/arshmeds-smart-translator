import 'dotenv/config';
import { createDeepSeekClient } from './ai.js';
import { createApp } from './app.js';
import { createAuthService } from './auth.js';
import { connectDB } from './db.js';

const isProduction = process.env.NODE_ENV === 'production';
const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
const model = process.env.DEEPSEEK_MODEL?.trim() || 'deepseek-chat';
const sessionSecret = process.env.SESSION_SECRET?.trim();
const mongoUri = process.env.MONGODB_URI?.trim();

if (isProduction && (!apiKey || !sessionSecret || !mongoUri)) {
  throw new Error('AI, authentication, and database environment variables are required in production');
}

const port = Number.parseInt(process.env.PORT || '3000', 10);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be a valid TCP port');
}

const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

const aiClient = createDeepSeekClient({ apiKey, model });
const authService = createAuthService({ sessionSecret });

const app = createApp({
  aiClient,
  authService,
  allowedOrigins,
  trustProxy: process.env.TRUST_PROXY === 'true',
  production: isProduction
});

async function startServer() {
  try {
    if (mongoUri) await connectDB(mongoUri);
    app.listen(port, () => {
      console.log(`Smart Translator is listening on port ${port}`);
      if (!aiClient.configured) console.warn('AI provider is not configured.');
      if (!authService.configured) console.warn('Authentication is not configured.');
    });
  } catch (error) {
    console.error('Failed to connect to database or start server:', error);
    process.exit(1);
  }
}

startServer();
