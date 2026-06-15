# تقرير المراجعة الشاملة والأمان — Elbakri Portal

> **مرجع كامل:** كل المشاكل + الحلول + الكود + خطوات التنفيذ + اقتراح بدائل الـ API.
> **تاريخ المراجعة:** 2026-06-12 · **الحالة:** مراجعة فقط — لم يُنفَّذ أي تعديل على الكود.
> **الجمهور:** أي مطوّر يكمل المشروع. اقرأ "خطة العمل" في الآخر أولاً.

---

## جدول المحتويات
1. [الملخّص التنفيذي](#الملخّص-التنفيذي)
2. [🔴 مشاكل أمنية حرجة](#-مشاكل-أمنية-حرجة)
3. [🟠 مشاكل مهمة](#-مشاكل-مهمة)
4. [🟡 مشاكل ثانوية وتحسينات الجودة](#-مشاكل-ثانوية-وتحسينات-الجودة)
5. [✅ ما هو مبنيّ بشكل صحيح](#-ما-هو-مبنيّ-بشكل-صحيح)
6. [🏨 اقتراح بدائل جلب الفنادق والصور عبر API](#-اقتراح-بدائل-جلب-الفنادق-والصور-عبر-api)
7. [📋 خطة العمل بالترتيب](#-خطة-العمل-بالترتيب)
8. [📦 ملحق: الحزم المطلوب تثبيتها](#-ملحق-الحزم-المطلوب-تثبيتها)

---

## الملخّص التنفيذي

المشروع مبنيّ باحتراف: معمارية modular نظيفة، التسعير **server-authoritative** (العميل لا يتلاعب بالأسعار)، عزل الشركات مطبّق، نظام عملات حيّ، ودعم ثنائي اللغة + RTL. الأساس قوي.

لكن توجد **5 مشاكل حرجة** يجب إصلاحها قبل أي إطلاق حقيقي بأموال وبيانات عملاء، أخطرها **تسريب ملفات العملاء (جوازات السفر + كل الفواتير) للعامة بدون أي مصادقة**. كما أن منهجية جلب صور الفنادق الحالية فيها مخاطرة قانونية.

| الفئة | العدد | الحالة |
|------|------|--------|
| 🔴 حرجة | 5 | تتطلب إصلاحاً فورياً |
| 🟠 مهمة | 7 | تُصلح قبل الإطلاق |
| 🟡 ثانوية | 5 | تحسينات تدريجية |

---

## 🔴 مشاكل أمنية حرجة

### C-1 — ملفات العملاء كلها مكشوفة للعامة (تسريب بيانات فعلي)

**الموقع:** [`src/app.ts:46-47`](src/app.ts)
```js
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));
app.use('/generated', express.static(path.join(__dirname, '..', 'generated')));
```

**الخطر:**
- `/generated/` يحتوي كل الفواتير والبواتشر بأسماء **متوقّعة تماماً** (`INV-INV-2026-0001.pdf`, `VCH-VCH-2026-0001.pdf`). أي شخص بدون تسجيل دخول يعدّ من 1 لـ 9999 ويسحب **كل فواتير كل الشركات**.
- `/uploads/` يحتوي **جوازات السفر وتذاكر الطيران** المرفوعة في الفيزا والموافقات الأمنية ([`visa.controller.ts:210`](src/modules/visa/visa.controller.ts)، [`reception.controller.ts:159`](src/modules/airport-reception/reception.controller.ts)).
- الـ endpoint المحمي `/api/invoices/:id/pdf` **عديم الفائدة** لأن الملف نفسه عام باسم متوقّع → المهاجم يتخطّى الحماية كلها.

**الحل — فصل الملفات الحسّاسة عن الصور العامة:**

> ⚠️ ملاحظة مهمة: صور الفنادق/العروض/الوجهات تُرفع أيضاً إلى `/uploads` وتُعرض في `<img src="/uploads/...">`. لو حذفت التقديم العام بالكامل، صور الفنادق ستنكسر. لذلك نفصل:

**الخطوة 1 — وجّه الرفعات الحسّاسة إلى مجلد خاص.** عدّل [`src/modules/upload/upload.routes.ts`](src/modules/upload/upload.routes.ts):
```js
// أضِف باراميتر scope: الوثائق الحسّاسة → uploads/private، الصور → uploads/public
const publicDir  = path.join(process.cwd(), 'uploads', 'public');
const privateDir = path.join(process.cwd(), 'uploads', 'private');
for (const d of [publicDir, privateDir]) if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const isPrivate = req.query.scope === 'private';   // passport/ticket
    cb(null, isPrivate ? privateDir : publicDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    // اسم عشوائي غير قابل للتخمين بدل Date.now() المتوقّع
    const rand = crypto.randomBytes(16).toString('hex');
    cb(null, `${rand}${ext}`);
  },
});

router.post('/', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
  const scope = req.query.scope === 'private' ? 'private' : 'public';
  const url = `/uploads/${scope}/${req.file.filename}`;
  res.json({ success: true, data: { url, filename: req.file.filename, size: req.file.size } });
});
```
(الواجهة عند رفع جواز/تذكرة تنادي `/api/upload?scope=private`).

**الخطوة 2 — في [`src/app.ts`](src/app.ts) احذف التقديم العام واستبدله:**
```js
// احذف هذين السطرين تماماً:
// app.use('/uploads', express.static(...));
// app.use('/generated', express.static(...));

// الصور العامة فقط (فنادق/عروض/وجهات) تبقى متاحة:
app.use('/uploads/public', express.static(path.join(__dirname, '..', 'uploads', 'public')));

// الوثائق الخاصة عبر route محمي يتحقق من الملكية:
app.get('/uploads/private/:filename', authenticate, async (req, res) => {
  const caller = req.user!;
  const fileUrl = `/uploads/private/${req.params.filename}`;
  // تأكد أن المتصل يملك السجل المرتبط بالملف
  const owns = await prisma.visaApplication.findFirst({
    where: { OR: [{ passportUrl: fileUrl }, { flightTicketUrl: fileUrl }],
             ...(caller.role !== 'SUPERADMIN' ? { companyId: caller.companyId! } : {}) },
    select: { id: true },
  }) || await prisma.airportReception.findFirst({
    where: { ticketUrl: fileUrl,
             ...(caller.role !== 'SUPERADMIN' ? { companyId: caller.companyId! } : {}) },
    select: { id: true },
  });
  if (!owns) { res.status(403).json({ success: false, error: 'FORBIDDEN' }); return; }
  const safe = path.basename(req.params.filename); // منع path traversal
  res.sendFile(path.join(process.cwd(), 'uploads', 'private', safe));
});
```
- الـ PDF (`/generated`) لا يحتاج تقديماً عاماً إطلاقاً — يُقدَّم بالفعل عبر `/api/invoices/:id/pdf` و `/api/vouchers/:id/download` المحميين. مجرد حذف السطر يكفي.
- **تحقّق:** ابحث في الواجهة عن أي رابط مباشر `/generated/` للتأكد أن لا شيء يكسر (المتوقّع: لا شيء، التحميل يتم عبر الـ API بـ Authorization header).

**الأثر:** هذا الإصلاح وحده يغلق ~80% من خطر تسريب بيانات العملاء.

---

### C-2 — لا يوجد تخزين دائم (Railway ephemeral = فقدان بيانات)

**الموقع:** [`upload.routes.ts`](src/modules/upload/upload.routes.ts)، [`pdf.generator.ts:301`](src/modules/invoices/pdf.generator.ts)، [`voucher.generator.ts:288`](src/modules/vouchers/voucher.generator.ts) — كلها تكتب على القرص المحلي.

**الخطر:** نظام ملفات Railway مؤقّت. مع كل إعادة نشر/تشغيل، **يُمسح كل المحتوى** — جوازات سفر العملاء المرفوعة تختفي نهائياً (الفواتير تُعاد توليدها، لكن الجوازات لا).

**الحل — انقل التخزين إلى Object Storage:**
- الأنسب سعراً: **Cloudflare R2** (S3-compatible، بدون رسوم خروج). البدائل: AWS S3 أو Cloudinary.
- اجعل الـ bucket **private** وقدّم **signed URLs** مؤقتة فقط (مما يحل C-1 أيضاً تلقائياً).
- مثال بنية الكود (طبقة تخزير مجرّدة):
```js
// src/shared/storage.ts
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: { accessKeyId: process.env.R2_KEY!, secretAccessKey: process.env.R2_SECRET! },
});
const BUCKET = process.env.R2_BUCKET!;

export async function putFile(key: string, body: Buffer, contentType: string) {
  await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: body, ContentType: contentType }));
  return key;
}
export async function signedDownloadUrl(key: string, expiresIn = 300) {
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET, Key: key }), { expiresIn });
}
```
- بديل سريع مؤقت (لو لازم تأجيل الترحيل): اربط **Railway Volume** دائم على مسار `uploads/` و`generated/` — يمنع الفقدان لكنه لا يحل القابلية للتوسّع.

---

### C-3 — لا rate-limiting ولا security headers (استيلاء على الحسابات)

**الموقع:** [`src/app.ts`](src/app.ts) — لا `helmet`؛ [`auth.controller.ts:26`](src/modules/auth/auth.controller.ts) — لا حد محاولات على login.

**الخطر:** brute-force على كلمات مرور مديري الشركات بلا حد. لا security headers (CSP/HSTS/X-Frame-Options).

**الحل:**
```js
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

app.use(helmet({
  // ⚠️ مهم: الواجهة تستخدم CDNs (unpkg, fonts.googleapis, sheetjs) و <script> inline.
  // الـ CSP الافتراضي سيكسر التطبيق. ابدأ بـ CSP مخصّص أو عطّله مؤقتاً ثم شدّده.
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", 'https://unpkg.com', 'https://cdn.sheetjs.com'],
      styleSrc:  ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc:   ["'self'", 'https://fonts.gstatic.com'],
      imgSrc:    ["'self'", 'data:', 'https://*.bstatic.com'],
      connectSrc:["'self'"],
    },
  },
}));

// حد محاولات على المصادقة
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,         // 15 دقيقة
  max: 10,                          // 10 محاولات لكل IP
  standardHeaders: true,
  message: { success: false, error: 'TOO_MANY_REQUESTS' },
});
app.use('/api/auth/login', authLimiter);

// حد عام أوسع لكل الـ API (اختياري لكن موصى به)
app.use('/api', rateLimit({ windowMs: 60 * 1000, max: 120 }));
```
> ملاحظة: على Railway خلف بروكسي، أضِف `app.set('trust proxy', 1)` ليعمل تحديد IP بصح.

---

### C-4 — سباق رصيد المحفظة (خسارة مالية)

**الموقع:** نفس النمط في [`transport.controller.ts:380`](src/modules/transport/transport.controller.ts)، [`bookings.controller.ts:306`](src/modules/bookings/bookings.controller.ts)، [`activities.controller.ts:297`](src/modules/activities/activities.controller.ts)، [`cruise.controller.ts:230`](src/modules/nile-cruise/cruise.controller.ts)، [`visa.controller.ts:319`](src/modules/visa/visa.controller.ts)، [`sim-card.controller.ts:301`](src/modules/sim-card/sim-card.controller.ts)، [`reception.controller.ts:249`](src/modules/airport-reception/reception.controller.ts)، [`companies.controller.ts:299`](src/modules/companies/companies.controller.ts).

**الخطر — read-modify-write بقيمة مطلقة:**
```js
const balanceBefore = booking.company.balance;        // T1 و T2 يقرآن 100
const balanceAfter  = balanceBefore.sub(totalAmount); // T1: 70 / T2: 60
await tx.company.update({ data: { balance: balanceAfter } }); // الأخير يدوس على الأول
```
تأكيدان متزامنان لنفس الشركة → أحدهما يضيع → الشركة تحصل على خدمة مجاناً (تحت Postgres Read Committed بدون قفل صف).

**الحل — UPDATE ذرّي بشرط الرصيد (race-free):**
```js
// بدل: قراءة الرصيد ثم كتابة قيمة مطلقة، استخدم updateMany بشرط + decrement
const debit = await tx.company.updateMany({
  where: { id: companyId, balance: { gte: booking.totalAmount } },
  data:  { balance: { decrement: booking.totalAmount } },
});
if (debit.count === 0) throw new Error('INSUFFICIENT_BALANCE');

// اقرأ الرصيد الجديد لسجل المعاملة فقط
const after = await tx.company.findUniqueOrThrow({ where: { id: companyId }, select: { balance: true } });
await tx.walletTransaction.create({
  data: {
    companyId, type: 'DEBIT', amount: booking.totalAmount,
    balanceBefore: after.balance.add(booking.totalAmount),
    balanceAfter:  after.balance,
    reference: booking.refNumber, description: `...`, createdById: req.user!.id,
  },
});
```
نفس المبدأ للاسترجاع (`increment`) والشحن (`topupCompany`). الشرط `balance: { gte }` + `decrement` في عبارة UPDATE واحدة يأخذ row-lock فيتسلسل تلقائياً.

---

### C-5 — توكن الدخول في localStorage + لا يمكن إبطاله

**الموقع:** [`login.html:171`](public/login.html)، [`dashboard.html:214`](public/dashboard.html) — `localStorage.getItem("accessToken")`.

**الخطر:** أي XSS واحد يسرق التوكن. التوكن JWT stateless صالح ساعة بدون إمكانية إلغاء حتى بعد logout. وتحميل `lucide@latest` غير المثبّت يوسّع سطح الخطر.

**الحل (تدريجي):**
1. **فوري:** ثبّت نسخة Lucide محددة (انظر I-4)، وأضِف CSP (C-3) لتقليل XSS.
2. **متوسط:** قصّر عمر الـ access token إلى 15 دقيقة في [`auth.controller.ts:6`](src/modules/auth/auth.controller.ts):
   ```js
   const ACCESS_EXPIRES = process.env.JWT_EXPIRES_IN ?? '15m';
   ```
3. **الأفضل (إعادة هيكلة):** انقل الـ access token للذاكرة (متغيّر JS) بدل localStorage، أو حوّل المصادقة بالكامل لـ HttpOnly cookies — وقتها XSS لا يستطيع قراءة التوكن.

---

## 🟠 مشاكل مهمة

### I-1 — لا تحقّق (zod validation) على نقاط الحجوزات المالية
**الموقع:** [`transport.routes.ts:16`](src/modules/transport/transport.routes.ts)، sim/visa/activities/reception — تقرأ `req.body` يدوياً بـ type-assertions. عندك `validate()` middleware ممتاز مستخدم فقط على hotels/auth.

**الخطر:** مدخل تالف (تاريخ غير صالح) → `Invalid Date` → خطأ Prisma → 500. المخاطرة المالية منخفضة (الأسعار من الخادم) لكنها هشاشة.

**الحل:** أنشئ schema لكل نقطة وطبّق `validate()`:
```js
// transport.schema.ts
export const createTransportSchema = z.object({
  type: z.enum(['AIRPORT_TRANSFER','PRIVATE_TRANSFER','DAY_TOUR_TRANSPORT','INTERCITY']),
  fromLocation: z.string().min(1), toLocation: z.string().min(1),
  pickupDateTime: z.string().datetime().or(z.string().min(8)),
  passengerCount: z.number().int().positive().max(60).optional(),
  isRoundTrip: z.boolean().optional(),
  // ... باقي الحقول
});
// في الـ route:
router.post('/', validate(createTransportSchema), createTransportBooking);
```

### I-2 — لا fail-fast على الأسرار
**الموقع:** [`auth.ts:28`](src/middleware/auth.ts) — `process.env.JWT_SECRET!`. لو غاب السر، الخادم يقلع ثم كل طلب يفشل 500 صامت.

**الحل:** فحص إقلاع في أعلى [`src/app.ts`](src/app.ts):
```js
const REQUIRED = ['DATABASE_URL', 'JWT_SECRET', 'REFRESH_TOKEN_SECRET'];
for (const k of REQUIRED) {
  if (!process.env[k]) { console.error(`FATAL: missing env ${k}`); process.exit(1); }
}
```

### I-3 — الـ catch-all يخفي أخطاء الـ API
**الموقع:** [`src/app.ts:134`](src/app.ts) — `app.get('*')` يرجّع dashboard.html لأي مسار بما فيها `/api/غير-موجود` (HTML بـ 200 بدل JSON 404).

**الحل:** أضِف معالج 404 لمسارات الـ API قبل الـ catch-all:
```js
app.use('/api', (_req, res) => res.status(404).json({ success: false, error: 'NOT_FOUND' }));
app.get('/admin*', ...);
app.get('*', ...);
```

### I-4 — Lucide من CDN بنسخة غير مثبّتة
**الموقع:** [`dashboard.html:11`](public/dashboard.html)، admin.html، login.html — `lucide@latest`.

**الخطر:** نسخة غير مثبّتة = كسر مفاجئ + supply-chain. **الحل:** ثبّت نسخة (`lucide@0.460.0` مثلاً) أو استضِفها محلياً ضمن `/assets`.

### I-5 — التحقق من نوع الملف بالامتداد فقط
**الموقع:** [`upload.routes.ts:21`](src/modules/upload/upload.routes.ts) — regex على الامتداد، لا فحص محتوى.

**الخطر:** ملف HTML فيه سكربت يُسمّى `.png`. **الحل:** افحص magic-bytes:
```js
import { fileTypeFromBuffer } from 'file-type';
// بعد الرفع، تحقّق أن النوع الفعلي ضمن المسموح
const type = await fileTypeFromBuffer(buffer);
if (!type || !['image/jpeg','image/png','image/webp','image/gif','application/pdf'].includes(type.mime)) {
  // ارفض الملف
}
```

### I-6 — بروكسي الصور يتبع redirects (SSRF بسيط)
**الموقع:** [`src/app.ts:63`](src/app.ts) — `fetch(url)` يتبع التحويلات افتراضياً؛ رابط bstatic قد يُحوِّل لعنوان داخلي.

**الحل:** `fetch(url, { redirect: 'manual', signal: ... })` ورفض غير 200. (يختفي الموضوع تماماً عند الانتقال للمحتوى المرخّص — انظر قسم الفنادق).

### I-7 — CORS يعتمد على BASE_URL
**الموقع:** [`src/app.ts:40`](src/app.ts) — `cors({ origin: process.env.BASE_URL })`. لو غاب، السلوك غير محدّد.

**الحل:** تأكد أن `BASE_URL` مضبوط دائماً في الإنتاج، وأضِفه لفحص fail-fast (I-2).

---

## 🟡 مشاكل ثانوية وتحسينات الجودة

### Q-1 — صفر اختبارات آلية
لا يوجد test runner في [`package.json`](package.json). لنظام مالي، غياب اختبارات على منطق المحفظة والتسعير مخاطرة. **الحل:** أضِف Vitest واختبارات على: حساب الأسعار (`pricing.ts`)، خصم/استرجاع المحفظة (بعد إصلاح C-4)، عزل الشركات.

### Q-2 — ملفات HTML عملاقة
admin.html (304KB) و dashboard.html (211KB) ملف واحد لكل منهما. يعمل لكن صعب الصيانة وبطيء أول تحميل. **الحل (تدريجي):** فصل الـ JS لملفات `/assets/*.js` مع تقسيم منطقي بحسب الصفحة.

### Q-3 — ازدواج كود في الـ enrichment
[`enrichment.routes.ts`](src/modules/enrichment/enrichment.routes.ts) (744 سطراً) يكرّر `norm`/`similarity`/`collectPhotos` من [`apify.client.ts`](src/modules/enrichment/apify.client.ts). **الحل:** وحّد في مكان واحد (يختفي مع الانتقال للـ API).

### Q-4 — أزرار غير وظيفية
جرس الإشعارات و"نسيت كلمة المرور؟" ([`login.html:77`](public/login.html)) ديكور. **الحل:** فعّلها أو أخفِها لتجنّب إرباك المستخدم.

### Q-5 — لا monitoring مركزي
فقط `console.error`. **الحل:** أضِف Sentry (أو ما يماثله) لتتبّع الأخطاء في الإنتاج + تنبيهات.

---

## ✅ ما هو مبنيّ بشكل صحيح (حافظ عليه)

- **لا SQL injection** — Prisma فقط، صفر raw queries. ✓
- **XSS مُحصّن** — `escapeHtml` مستخدم 156 مرة (dashboard) + 230 مرة (admin). ✓
- **التسعير server-authoritative** — العميل لا يتلاعب بالمبالغ. ✓
- **عزل الشركات محكم** — كل endpoint يفلتر بـ companyId؛ company-admin مقيّد بـ AGENTs شركته. ✓
- **حظر دخول شركة معطّلة** — login + refresh يفحصان `company.isActive`. ✓
- **كلمات المرور** bcrypt بـ 12 rounds. ✓
- **idempotency** على الخصم (مفتاح DEBIT) والبواتشر. ✓
- **معاملات Prisma** على عمليات الأموال. ✓
- **FX** مع fallback متعدد الطبقات (memory → DB → آخر قيمة). ✓
- **refresh token** HttpOnly + sameSite:strict + يُحذف عند logout. ✓
- **`.env` غير متتبّع في git.** ✓
- **نظام تصميم نظيف** — CSS variables + focus-visible + RTL + i18n EN/AR. ✓

---

## 🏨 اقتراح بدائل جلب الفنادق والصور عبر API

### المشكلة في المنهجية الحالية (Apify + Booking.com scraping)

**الوضع:** actors من Apify (`powerai~booking-hotel-photos-scraper` ~0.09$ بدء + 0.005$/صورة، فندق واحد/تشغيل) + actor بحث لكل مدينة، مع مطابقة بتشابه الأسماء (عتبات 0.65/0.40)، والصور تُعرض عبر proxy يسمح بأي `*.bstatic.com`.

**ثلاث مشاكل جوهرية:**
1. **قانونياً (الأخطر):** سحب صور Booking.com واستضافتها عبر hotlink لـ `bstatic` CDN يخالف شروط Booking وحقوق الملكية. لمنتج تجاري = تعرّض قانوني حقيقي، والروابط تنكسر بلا إشعار.
2. **التكلفة:** مزامنة كاملة لـ ~199 فندق ≈ **28$+ لكل تشغيل** (pay-per-event)، متكرّرة.
3. **الدقة والهشاشة:** المطابقة بالاسم تُنتج مطابقات خاطئة، والـ actors تنكسر متى غيّرت Booking صفحاتها.

### الحل الموصى به: محتوى مرخّص + استضافة ذاتية + مطابقة بالإحداثيات

**مقارنة المزوّدين:**

| المزوّد | النوع | يعطي | ملاحظات | الأنسب لـ |
|---------|------|------|---------|-----------|
| **Hotelbeds APItude (Content API)** | Bedbank B2B | صور + أوصاف + مرافق + إحداثيات + IDs ثابتة | مرخّص بالكامل، يتطلب عقد/credentials | الإنتاج الجاد |
| **RateHawk / WorldOTA (ETG)** | B2B API | محتوى + أسعار حيّة | onboarding أسهل من Hotelbeds، قوي للوكالات | **التوصية الأولى** |
| **TBO Holidays** | B2B API | محتوى + أسعار | قوي في الشرق الأوسط، مناسب للسوق المصري/الخليجي | سوق MEA |
| **Amadeus Hotel Content** | GDS | محتوى + بعض الصور | فيه طبقة self-service بحصة تجريبية مجانية | البداية/الاختبار |
| **Google Places (Place Photos)** | خرائط | صور + تقييم + إحداثيات | مرخّص، **مطابقة بالإحداثيات أدق بكثير**؛ قيود على التخزين الدائم للصور | المطابقة + مكسب سريع |

**لماذا RateHawk/Hotelbeds هو الصحيح لك:** البكري **وكالة تتعاقد مع الفنادق مباشرة** — فالمنطق أن تأخذ المحتوى (صور/أوصاف/إحداثيات) من نفس مزوّد الأسعار B2B الذي ستتعاقد معه، مرخّصاً وبجودة ثابتة وبـ **معرّف فندق ثابت** يلغي الحاجة للمطابقة الضبابية أصلاً.

### البنية المقترحة

```
1) ربط مزوّد المحتوى (RateHawk/Hotelbeds Content API)
   → اسحب: الصور + الوصف + المرافق + الإحداثيات (lat/long) + hotelId الثابت
   → خزّن hotelId في Hotel.providerHotelId (حقل جديد) كربط دائم

2) المطابقة بالإحداثيات بدل الاسم (أدق 10×)
   → لو احتجت مطابقة مبدئية: Google Places "Find Place" بالاسم+المدينة
     يرجّع place_id + إحداثيات حتمياً، ثم طابق بالقرب الجغرافي

3) استضِف الصور عندك (R2/S3) — لا hotlink
   → نزّل صور المزوّد مرة واحدة، ارفعها لـ bucketك، خزّن روابطك
   → احذف proxy الـ bstatic (/media/hotel-image)

4) التحديث الدوري
   → cron أسبوعي/شهري يحدّث المحتوى من المزوّد (مش scraping)
```

**مكسب سريع لو لازم البقاء على غير مزوّد B2B الآن:**
- استخدم **Google Places Photos API** للصور + التقييم + الإحداثيات (قانوني، مُسعّر بوضوح).
- استبدل المطابقة بالاسم بمطابقة `place_id` (حتمية) → تختفي المطابقات الخاطئة.
- ملاحظة قانونية: شروط Google تقيّد التخزين الدائم لصور Places — للعرض الفوري ممتازة، وللتخزين الدائم يبقى مزوّد B2B هو الحل.

**الخلاصة:** المنهجية الحالية تعمل تقنياً لكنها **حل مؤقت بمخاطرة قانونية وتكلفة متغيّرة**. لمنتج بهذه القيمة: انتقل لمحتوى مرخّص من مزوّد B2B، استضِف الصور ذاتياً، وطابق بالإحداثيات. هذا يحل القانونية + الدقة + الهشاشة دفعة واحدة.

---

## 📋 خطة العمل بالترتيب

### المرحلة 1 — أمان حرج (قبل أي إطلاق · ~يوم عمل)
- [ ] **C-1** فصل الرفعات الحسّاسة + حذف التقديم العام لـ `/uploads` و`/generated` ← **ابدأ هنا**
- [ ] **C-3** إضافة `helmet` + `express-rate-limit`
- [ ] **C-4** تحويل خصم/استرجاع/شحن المحفظة إلى `updateMany + decrement` ذرّي
- [ ] **I-2** فحص fail-fast للأسرار عند الإقلاع

### المرحلة 2 — صلابة وحماية (الأسبوع الأول · ~2-3 أيام)
- [ ] **C-2** نقل التخزين إلى Cloudflare R2 (private + signed URLs)
- [ ] **C-5** تقصير عمر التوكن + تثبيت Lucide (**I-4**) + CSP
- [ ] **I-1** توحيد zod validation على نقاط الحجوزات
- [ ] **I-3** معالج 404 للـ API · **I-5** فحص magic-bytes · **I-6** redirect:manual · **I-7** تأكيد BASE_URL

### المرحلة 3 — جلب الفنادق (1-2 أسبوع)
- [ ] التعاقد/الربط مع مزوّد محتوى B2B (RateHawk/Hotelbeds) أو Google Places كمكسب سريع
- [ ] حقل `Hotel.providerHotelId` + ترحيل المطابقة للإحداثيات
- [ ] استضافة الصور ذاتياً + حذف proxy الـ bstatic

### المرحلة 4 — جودة (مستمر)
- [ ] **Q-1** اختبارات Vitest على المحفظة/التسعير/العزل
- [ ] **Q-5** Sentry · **Q-2** تقسيم HTML · **Q-3** توحيد كود enrichment · **Q-4** أزرار

> **القاعدة الذهبية:** المرحلة 1 (خصوصاً C-1) تغلق أخطر المخاطر في يوم واحد. لا تطلق للعملاء قبل إنهائها.

---

## 📦 ملحق: الحزم المطلوب تثبيتها

```bash
# أمان
npm i helmet express-rate-limit

# فحص نوع الملف
npm i file-type

# التخزين السحابي (R2/S3)
npm i @aws-sdk/client-s3 @aws-sdk/s3-request-presigner

# الاختبارات (dev)
npm i -D vitest

# مراقبة الأخطاء (اختياري)
npm i @sentry/node
```

**متغيّرات بيئة جديدة مطلوبة:**
```env
# Object Storage (Cloudflare R2)
R2_ENDPOINT=https://<account>.r2.cloudflarestorage.com
R2_BUCKET=elbakri-files
R2_KEY=...
R2_SECRET=...

# مزوّد محتوى الفنادق (حسب الاختيار)
RATEHAWK_KEY=...          # أو HOTELBEDS_API_KEY / HOTELBEDS_SECRET
GOOGLE_PLACES_API_KEY=... # لو استُخدم للمطابقة/الصور
```

---

*انتهى التقرير. كل ما سبق مراجعة وتوثيق — لم يُعدَّل أي كود في التطبيق. للبدء بالتنفيذ، ابدأ بـ C-1 ثم تابع خطة العمل بالترتيب.*
