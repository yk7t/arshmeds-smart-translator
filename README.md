# مترجم الكلمات الذكي

مترجم عربي/إنجليزي يحفظ الكلمات داخل جمل سياقية، ويعيد استخدام الكلمات السابقة حتى تثبت في الذاكرة. يحتوي على قاموس للكلمات قيد التعلم، قائمة للكلمات المتقنة، مساعد لغوي، ولعبة مراجعة ببطاقات مدتها 5 ثوانٍ.

التطبيق محمي بشاشة دخول باستخدام البريد الإلكتروني وكلمة مرور مشفرة، ولا يضع مفتاح Gemini أو كلمة المرور داخل المتصفح أو GitHub.

## المتطلبات

- Node.js 20 أو أحدث.
- حساب ومفتاح جديد لخدمة Gemini.
- لا تستخدم المفتاح الذي كان موجودًا في النسخة القديمة؛ يجب إلغاؤه من مزود الخدمة.

## التشغيل لأول مرة على الجهاز

افتح Terminal ونفّذ:

```bash
git clone https://github.com/yk7t/arshmeds-smart-translator.git
cd arshmeds-smart-translator
npm install
npm run setup-auth
```

سيطلب منك `setup-auth`:

1. البريد الإلكتروني الذي ستستخدمه للدخول.
2. كلمة مرور لا تقل عن 12 حرفًا.
3. إعادة كتابة كلمة المرور.

يتم حفظ Hash آمن لكلمة المرور داخل `.env`، ولا تُحفظ كلمة المرور نفسها. كما يتم إنشاء `SESSION_SECRET` عشوائيًا. ملف `.env` مستبعد من Git ولا يجب رفعه أبدًا.

بعد ذلك افتح `.env` على جهازك وأضف مفتاح Gemini الجديد واسم موديل مدعوم:

```env
GEMINI_API_KEY=PUT_YOUR_NEW_KEY_HERE
GEMINI_MODEL=PUT_A_SUPPORTED_MODEL_HERE
```

شغّل البرنامج:

```bash
npm run dev
```

ثم افتح:

```text
http://127.0.0.1:3000
```

## التشغيل في وضع Production

كل المتغيرات التالية مطلوبة في Production:

```env
NODE_ENV=production
GEMINI_API_KEY=...
GEMINI_MODEL=...
APP_LOGIN_EMAIL=...
APP_LOGIN_PASSWORD_HASH=...
SESSION_SECRET=...
ALLOWED_ORIGINS=https://your-domain.example
TRUST_PROXY=true
```

ثم:

```bash
npm ci
npm test
npm start
```

استخدم `TRUST_PROXY=true` فقط عندما تكون الاستضافة خلف Reverse Proxy موثوق. استخدم HTTPS دائمًا في Production.

## رفع الكود إلى GitHub

قبل الرفع، تأكد أن `.env` غير ظاهر في `git status`:

```bash
git status
git add .
git commit -m "Add secure login and smart vocabulary learning"
git push origin main
```

لا تستخدم `git add -f .env` ولا تضع أي مفتاح أو كلمة مرور داخل README أو الكود.

## النشر من GitHub

هذا المشروع لا يعمل على GitHub Pages؛ لأن GitHub Pages يستضيف ملفات Frontend فقط، بينما هذا التطبيق يحتاج Node.js Backend لإخفاء مفتاح Gemini والتحقق من تسجيل الدخول.

استخدم منصة تدعم Node.js مثل Render أو Railway أو Fly.io أو Google Cloud Run أو VPS:

1. ارفع المستودع إلى GitHub.
2. اربط المستودع بمنصة الاستضافة.
3. استخدم Build Command:

   ```text
   npm ci
   ```

4. استخدم Start Command:

   ```text
   npm start
   ```

5. أضف متغيرات Production السابقة داخل قسم Environment Variables/Secrets في منصة الاستضافة.
6. لا ترفع ملف `.env` نفسه.
7. اجعل `ALLOWED_ORIGINS` مساويًا لرابط الموقع النهائي، مثال:

   ```env
   ALLOWED_ORIGINS=https://smart-translator.example.com
   ```

8. اختبر بعد النشر:

   ```text
   https://your-domain.example/health
   ```

يجب أن تكون النتيجة مشابهة للآتي دون أي أسرار:

```json
{
  "status": "ok",
  "aiConfigured": true,
  "authConfigured": true
}
```

## أوامر التحقق

```bash
npm run lint
npm test
npm audit
```

## تسجيل الدخول والأمان

- الجلسة محفوظة في Cookie موقعة من الخادم ومدتها 8 ساعات.
- الـCookie تستخدم `HttpOnly` و`SameSite=Strict`، وتستخدم `Secure` في Production.
- جميع طلبات الترجمة والمساعد تحتاج جلسة صحيحة وCSRF token.
- محاولات تسجيل الدخول محددة لمنع التخمين المتكرر.
- كلمة المرور مخزنة باستخدام bcrypt، وليست نصًا صريحًا.
- استجابات API لا تُخزن في Cache.
- الواجهة لا تحتوي على مفتاح Gemini.

## بيانات الكلمات

تبقى الكلمات حاليًا داخل `localStorage` في متصفح المستخدم:

- الكلمات `learning` تظهر في القاموس واللعبة.
- الكلمات `mastered` تختفي من القاموس واللعبة، لكنها تبقى في النظام وتُستخدم كسياق للجمل الجديدة.
- البيانات القديمة في `savedVocabulary` و`savedEnglishWords` تُرحّل تلقائيًا إلى `smartVocabulary.v2`.
- تُحفظ نسخة احتياطية من البيانات القديمة في `smartVocabulary.legacyBackup`.

تسجيل الدخول يمنع الوصول إلى التطبيق، لكنه لا يزامن الكلمات بين الأجهزة. للمزامنة بين عدة أجهزة يجب إضافة قاعدة بيانات في مرحلة لاحقة.
