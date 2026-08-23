import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import readline from 'node:readline/promises';
import bcrypt from 'bcryptjs';

const envPath = path.resolve('.env');
const examplePath = path.resolve('.env.example');

async function askEmail() {
  const prompt = readline.createInterface({ input: process.stdin, output: process.stdout });
  const email = (await prompt.question('البريد الإلكتروني لتسجيل الدخول: ')).trim().toLocaleLowerCase('en-US');
  prompt.close();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new Error('البريد الإلكتروني غير صالح.');
  }
  return email;
}

function askHidden(label) {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== 'function') {
    throw new Error('شغّل الأمر داخل Terminal تفاعلي لإدخال كلمة المرور بأمان.');
  }
  return new Promise((resolve, reject) => {
    let value = '';
    process.stdout.write(label);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    const finish = () => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeListener('data', onData);
      process.stdout.write('\n');
      resolve(value);
    };
    const onData = (character) => {
      if (character === '\u0003') {
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdin.removeListener('data', onData);
        process.stdout.write('\n');
        reject(new Error('تم إلغاء الإعداد.'));
        return;
      }
      if (character === '\r' || character === '\n') {
        finish();
        return;
      }
      if (character === '\u007f') {
        if (value.length) {
          value = value.slice(0, -1);
          process.stdout.write('\b \b');
        }
        return;
      }
      if (character >= ' ') {
        value += character;
        process.stdout.write('•');
      }
    };
    process.stdin.on('data', onData);
  });
}

function setEnvValue(source, key, value) {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  if (pattern.test(source)) return source.replace(pattern, line);
  return `${source.trimEnd()}\n${line}\n`;
}

async function main() {
  const email = await askEmail();
  const password = await askHidden('كلمة المرور (12 حرفًا على الأقل): ');
  const confirmation = await askHidden('أعد كتابة كلمة المرور: ');
  if (password.length < 12) throw new Error('كلمة المرور يجب أن تكون 12 حرفًا على الأقل.');
  if (password !== confirmation) throw new Error('كلمتا المرور غير متطابقتين.');

  const passwordHash = await bcrypt.hash(password, 12);
  const sessionSecret = crypto.randomBytes(48).toString('base64url');
  let source;
  try {
    source = await fs.readFile(envPath, 'utf8');
  } catch {
    source = await fs.readFile(examplePath, 'utf8');
  }
  source = setEnvValue(source, 'APP_LOGIN_EMAIL', email);
  source = setEnvValue(source, 'APP_LOGIN_PASSWORD_HASH', passwordHash);
  source = setEnvValue(source, 'SESSION_SECRET', sessionSecret);
  await fs.writeFile(envPath, source, { mode: 0o600 });
  await fs.chmod(envPath, 0o600);
  console.log('تم إعداد تسجيل الدخول داخل .env دون حفظ كلمة المرور كنص صريح.');
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
