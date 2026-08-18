# النشر على Railway — Elbakri Portal

دليل النشر الحالي والمعتمد. المشروع يعمل على **Node + Express + Prisma** مع قاعدة
بيانات **PostgreSQL**، والملفات المرفوعة تحتاج **Volume** لأن قرص الحاوية بيتمسح
مع كل نشر.

> **الحالة:** أنت ربطت الريبو بـ Railway بالفعل. الباقي: إضافة قاعدة البيانات،
> ضبط المتغيرات، إضافة Volume، ثم تشغيل السييد مرة واحدة.

---

## المحتويات

1. [المطلوب تجهيزه (ملخص سريع)](#1-المطلوب-تجهيزه-ملخص-سريع)
2. [إضافة قاعدة بيانات PostgreSQL](#2-إضافة-قاعدة-بيانات-postgresql)
3. [متغيرات البيئة](#3-متغيرات-البيئة)
4. [Volume للملفات المرفوعة (مهم جدًا)](#4-volume-للملفات-المرفوعة-مهم-جدًا)
5. [أوامر البناء والتشغيل](#5-أوامر-البناء-والتشغيل)
6. [الدومين](#6-الدومين)
7. [تشغيل السييد أول مرة](#7-تشغيل-السييد-أول-مرة)
8. [التأكد إن كل حاجة شغالة](#8-التأكد-إن-كل-حاجة-شغالة)
9. [مشاكل شائعة](#9-مشاكل-شائعة)
10. [التطوير المحلي](#10-التطوير-المحلي)
11. [English quick reference](#11-english-quick-reference)

---

## 1. المطلوب تجهيزه (ملخص سريع)

| # | الحاجة | مين بيعملها |
|---|---|---|
| 1 | خدمة **PostgreSQL** جوه نفس المشروع | إنت، من Railway |
| 2 | **6 متغيرات إجبارية** + المتغيرات الاختيارية | إنت، من Variables |
| 3 | **Volume** متركب على `/data` | إنت، من Railway |
| 4 | أوامر build/start/migrate | ✅ متظبطة في `railway.json` |
| 5 | Health check | ✅ متظبط على `/api/health` |
| 6 | الـ migrations | ✅ جاهزة في `prisma/migrations/` |
| 7 | تشغيل السييد أول مرة | إنت، أمر واحد بعد أول نشر |

النقاط اللي عليها ✅ اتظبطت في الريبو، مش محتاج تعملها.

---

## 2. إضافة قاعدة بيانات PostgreSQL

من داخل مشروعك على Railway:

**New → Database → Add PostgreSQL**

هيتعمل سيرفس اسمه `Postgres` جنب سيرفس التطبيق. Railway بيولّد له `DATABASE_URL`
أوتوماتيك.

> **مهم:** متنسخش رابط الاتصال كنص ثابت. اربطه بالمرجع `${{Postgres.DATABASE_URL}}`
> زي ما موضح تحت — كده لو Railway غيّر الباسورد، التطبيق يفضل شغال. ولو نسخته
> يدوي هيقع عند أول تدوير للباسورد.

الاسم الافتراضي للسيرفس هو `Postgres`. لو سمّيته باسم تاني، بدّل الاسم جوه
`${{...}}` بنفس الاسم اللي اخترته.

---

## 3. متغيرات البيئة

من سيرفس **التطبيق** (مش سيرفس Postgres) → تبويب **Variables**.

### إجباري — التطبيق مش هيقوم من غيرهم

| المتغير | القيمة |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
| `NODE_ENV` | `production` |
| `BASE_URL` | `https://${{RAILWAY_PUBLIC_DOMAIN}}` |
| `JWT_SECRET` | قيمة عشوائية طويلة (شوف تحت) |
| `REFRESH_TOKEN_SECRET` | قيمة عشوائية طويلة **مختلفة** عن اللي فوق |
| `JWT_EXPIRES_IN` | `1h` |
| `REFRESH_TOKEN_EXPIRES_IN` | `30d` |

الكود بيتحقق من دول عند الإقلاع (`src/config/env.ts`) وبيرفض يشتغل في الإنتاج لو:

- أي واحد منهم ناقص،
- أو السر لسه القيمة الافتراضية بتاعة `.env.example`،
- أو `JWT_SECRET` و `REFRESH_TOKEN_SECRET` نفس القيمة،
- أو `BASE_URL` بيشاور على `localhost`.

**توليد الأسرار** — شغّل الأمر ده مرتين على جهازك وخد ناتج مختلف لكل واحد:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

### مسارات التخزين — إجباري مع الـ Volume

| المتغير | القيمة |
|---|---|
| `UPLOAD_DIR` | `/data/uploads` |
| `PRIVATE_UPLOAD_DIR` | `/data/uploads-private` |
| `PDF_DIR` | `/data/generated` |

تفاصيل السبب في [القسم 4](#4-volume-للملفات-المرفوعة-مهم-جدًا).

### الإيميل — اختياري، بس من غيره مفيش إشعارات

من غير دول الحجوزات هتشتغل عادي لكن الإيميلات هتتخطى (تحذير في اللوج بس).

| المتغير | مثال |
|---|---|
| `SMTP_HOST` | `smtp.gmail.com` |
| `SMTP_PORT` | `587` |
| `SMTP_USER` | `bookings@elbakri.com` |
| `SMTP_PASS` | App Password (مش باسورد الإيميل العادي) |
| `FROM_EMAIL` | `Elbakri Overseas <bookings@elbakri.com>` |
| `INTERNAL_TEAM_EMAIL` | `team@elbakri.com` |
| `RECEPTION_NOTIFY_EMAIL` | إيميل إشعارات الاستقبال (لو مختلف) |
| `TRANSPORT_NOTIFY_EMAIL` | إيميل إشعارات النقل (لو مختلف) |

### باقي الاختياري

| المتغير | بيستخدم في |
|---|---|
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` / `GOOGLE_PRIVATE_KEY` / `GOOGLE_SHEETS_ID` | مزامنة Google Sheets |
| `INVOICE_BANK_NAME` / `INVOICE_BANK_ACCOUNT` / `INVOICE_BANK_IBAN` / `INVOICE_BANK_SWIFT` | بيانات البنك في الفواتير PDF |
| `COMPANY_PHONE` / `COMPANY_EMAIL` / `COMPANY_CONTACT_LINE` / `ELBAKRI_VOUCHER_CONTACT` | بيانات التواصل في الفاوتشرات |
| `FX_API_URL` | مصدر أسعار الصرف |
| `APIFY_TOKEN` | إثراء بيانات الفنادق من Booking |

### متغيرات **متحطهاش**

| المتغير | ليه |
|---|---|
| `PORT` | Railway بيحقنه لوحده والتطبيق بيقراه. لو كتبته غلط، الـ health check هيفشل والنشر هيترجع. |
| `DEMO_MODE` | ده وضع المعاينة بالبيانات الوهمية — أي حاجة تتكتب فيه بتضيع. سيبه فاضي في الإنتاج. |

---

## 4. Volume للملفات المرفوعة (مهم جدًا)

قرص الحاوية على Railway **بيتمسح مع كل نشر وكل إعادة تشغيل**. من غير Volume،
صور الفنادق وصور جوازات السفر والفواتير المولدة هتختفي أول ما تعمل deploy تاني.

**الخطوات:** سيرفس التطبيق → **Settings → Volumes → New Volume** → المسار: `/data`

بعدها اضبط `UPLOAD_DIR` و `PRIVATE_UPLOAD_DIR` و `PDF_DIR` زي جدول القسم 3.

الكود (`src/config/paths.ts`) بيقبل مسارات مطلقة وبينشئ المجلدات لوحده أول ما
يقوم، فمش محتاج تعمل حاجة جوه الـ volume يدوي.

> الملفات الخاصة (الجوازات والتذاكر) بتتخزن في مجلد **شقيق** لمجلد الصور العامة،
> مش جواه — عشان الـ static mount على `/uploads` عمره ما يقدر يسرّبها. التحميل
> بيمر على `GET /api/files/private/:filename` اللي بيتحقق إن الملف تبع شركة
> المستخدم. خلّي المسارات التلاتة تحت `/data` زي ما هي عشان الفصل ده يفضل قايم.

---

## 5. أوامر البناء والتشغيل

**مش محتاج تكتب حاجة في إعدادات Railway** — الملف [`railway.json`](railway.json)
في جذر الريبو بيحدد كل ده وRailway بيقراه لوحده:

| الإعداد | القيمة |
|---|---|
| Build | `npm run build` (= `prisma generate && tsc`) |
| Pre-deploy | `npx prisma migrate deploy` |
| Start | `node dist/app.js` |
| Health check | `/api/health` (مهلة 300 ثانية) |
| Restart policy | `ON_FAILURE` بحد أقصى 10 محاولات |

الـ **pre-deploy** بيشتغل مرة واحدة قبل ما الحاوية الجديدة تستقبل ترافيك، فالـ
migrations بتتطبق مرة واحدة لكل نشر — مش مع كل إعادة تشغيل.

> لو حسابك مش بيدعم خطوة pre-deploy، غيّر الـ Start Command لـ
> `npm run start:migrate` (بيعمل migrate بعدين يشغّل) وسيب الباقي زي ما هو.

نسخة Node متحددة في `.nvmrc` (نسخة 20) و`engines` في `package.json`.

---

## 6. الدومين

سيرفس التطبيق → **Settings → Networking → Generate Domain**
هتاخد دومين شكله `xxx.up.railway.app`.

`BASE_URL` المضبوط على `https://${{RAILWAY_PUBLIC_DOMAIN}}` بيتحدّث لوحده مع
الدومين ده.

**لو هتربط دومين خاص بيك** (مثلاً `portal.elbakri.com`): ضيفه من **Custom Domain**،
اعمل الـ CNAME المطلوب عند مزود الدومين، وبعدين **غيّر `BASE_URL` للدومين الجديد
يدوي**:

```
BASE_URL=https://portal.elbakri.com
```

ده مهم لأن `BASE_URL` مش بس للعرض — هو أصل الـ **CORS** في `src/app.ts`. لو ساب
دومين Railway بينما المستخدمين داخلين من الدومين الخاص، طلبات الـ API هتترفض.

---

## 7. تشغيل السييد أول مرة

الـ migrations بتتطبق أوتوماتيك، لكن **البيانات الأولية لأ**. بعد أول نشر ناجح،
شغّل السييد **مرة واحدة**.

### الطريقة الأسهل — Railway CLI من جهازك

```bash
npm i -g @railway/cli
railway login
railway link                      # اختار المشروع وسيرفس التطبيق

railway run npm run db:seed       # سوبر أدمن + شركتين تجريبيتين + حجوزات
railway run npm run db:seed:mea   # أسعار 2026: 10 وجهات، فنادق بمواسم، 45 نشاط، 102 سعر نقل
railway run npm run db:seed:hotels # كتالوج 199 فندق (من غير أسعار — طلب عرض سعر)
railway run npm run db:seed:airports # المطارات
```

`railway run` بيشغّل الأمر على جهازك بمتغيرات بيئة السيرفس — يعني بيتكلم مع نفس
قاعدة البيانات.

### بدون CLI

من سيرفس Postgres انسخ **Public** connection URL (مش الداخلي — الداخلي شغال جوه
شبكة Railway بس)، وشغّل من جهازك:

```bash
DATABASE_URL="<public-postgres-url>" npm run db:seed
DATABASE_URL="<public-postgres-url>" npm run db:seed:mea
```

### بيانات الدخول بعد السييد

| الدور | الإيميل | الباسورد |
|---|---|---|
| Super Admin | `admin@elbakri.com` | `Admin@1982` |
| أدمن شركة | `admin@niletravel.com` | `NileAdmin@2024` |
| أدمن شركة | `admin@pyramidstours.com` | `PyramidsAdmin@2024` |

> **غيّر باسورد الـ Super Admin فورًا بعد أول دخول.** الباسوردات دي مكتوبة في كود
> السييد المرفوع على الريبو.

سييد `db:seed:mea` **idempotent** — تقدر تعيد تشغيله بعد تحديث الأسعار وهيحدّث
الموجود من غير تكرار. المصدر: [`prisma/seed-mea.ts`](prisma/seed-mea.ts).

---

## 8. التأكد إن كل حاجة شغالة

```bash
# 1) التطبيق قايم
curl https://<your-domain>/api/health
# {"status":"ok","uptime":12,"env":"production","demoMode":false}

# 2) التطبيق شايف قاعدة البيانات
curl "https://<your-domain>/api/health?db=1"
# {"status":"ok",...,"database":"up"}

# 3) تسجيل الدخول شغال
curl -X POST https://<your-domain>/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@elbakri.com","password":"Admin@1982"}'
```

بعدها افتح الدومين في المتصفح واعمل تسجيل دخول من الواجهة.

> الـ health check اللي Railway بيستخدمه هو `/api/health` **من غير** `?db=1` — عن
> قصد. لو ربطناه بقاعدة البيانات، أي تقطيعة بسيطة في الـ DB كانت هترجّع نشر سليم.
> استخدم `?db=1` بنفسك وقت التشخيص.

---

## 9. مشاكل شائعة

| العرض | السبب | الحل |
|---|---|---|
| النشر بيفشل عند الـ health check | `PORT` متحطة يدوي، أو التطبيق وقع عند الإقلاع | امسح `PORT` من Variables، وشوف Deploy Logs |
| `Refusing to start with an invalid production configuration` | متغير إجباري ناقص أو سر لسه بالقيمة الافتراضية | راجع جدول الإجباري في القسم 3 — اللوج بيقول اسم المتغير بالظبط |
| البحث في الفنادق مش بيرجّع نتايج بحروف صغيرة | نسخة قديمة من الكود قبل تحويل PostgreSQL | اتصلح: البحث بيمر على `contains()` في `src/shared/search.ts` |
| الصور والمرفقات بتختفي بعد كل نشر | مفيش Volume، أو مسارات التخزين مش متظبطة عليه | القسم 4 |
| CORS بيرفض طلبات الـ API | `BASE_URL` مش مطابق للدومين اللي المستخدم داخل منه | ظبّط `BASE_URL` على الدومين الفعلي (القسم 6) |
| `P1001: Can't reach database server` | استخدام الرابط الداخلي من برة شبكة Railway | جوه Railway استخدم `${{Postgres.DATABASE_URL}}`، ومن برة استخدم الرابط العام |
| السييد بيقول إن البيانات موجودة | السييد اتشغّل قبل كده | ده طبيعي — السييد `upsert`، مش بيكرر |
| `npm ci` بيفشل عند تحميل `xlsx` | الباكدج بيتسحب من `cdn.sheetjs.com` مش من npm | لو حصل، اعمل إعادة نشر — CDN بتاعهم بيقطع أحيانًا |

**اللوجز:** سيرفس التطبيق → تبويب **Deployments** → اختار النشر → **View Logs**.
رسايل الإقلاع كلها مبدوءة بـ `⚠️  [env]` أو `❌ [env]` وبتسمي المتغير الناقص.

---

## 10. التطوير المحلي

```bash
cp .env.example .env          # املا DATABASE_URL والأسرار
npm install
npm run db:migrate            # يطبّق الـ migrations على قاعدة محلية
npm run db:seed               # مرة واحدة
npm run db:seed:mea           # أسعار 2026
npm run dev                   # تشغيل مع إعادة تحميل تلقائي
```

عايز تشوف الواجهة من غير أي قاعدة بيانات؟ `DEMO_MODE=1 npm run dev` — كل الـ API
بيرد من بيانات وهمية ومفيش أي حاجة بتتحفظ.

---

## 11. English quick reference

**Add:** a PostgreSQL service, the variables below, and a Volume mounted at `/data`.
Build, start, migrate and health-check commands are already declared in `railway.json`.

Required variables on the **app** service:

```
DATABASE_URL=${{Postgres.DATABASE_URL}}
NODE_ENV=production
BASE_URL=https://${{RAILWAY_PUBLIC_DOMAIN}}
JWT_SECRET=<random, 48 bytes>
REFRESH_TOKEN_SECRET=<different random, 48 bytes>
JWT_EXPIRES_IN=1h
REFRESH_TOKEN_EXPIRES_IN=30d
UPLOAD_DIR=/data/uploads
PRIVATE_UPLOAD_DIR=/data/uploads-private
PDF_DIR=/data/generated
```

Never set `PORT` (Railway injects it) or `DEMO_MODE` (fixtures, nothing persists).

Seed once after the first successful deploy:

```bash
railway run npm run db:seed
railway run npm run db:seed:mea
railway run npm run db:seed:hotels
railway run npm run db:seed:airports
```

Verify: `curl https://<domain>/api/health?db=1` → `{"status":"ok","database":"up"}`.

### Script roles

```
npm run build          → prisma generate + compile TypeScript to dist/
npm run db:deploy      → prisma migrate deploy (pre-deploy step)
npm run start          → node dist/app.js (start command)
npm run start:migrate  → migrate then start, for hosts without a pre-deploy hook
```
