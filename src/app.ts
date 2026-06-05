import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import path from 'path';
import { Readable } from 'stream';

import { authenticate } from './middleware/auth';

import authRouter from './modules/auth/auth.routes';
import usersRouter from './modules/users/users.routes';
import hotelsRouter from './modules/hotels/hotels.routes';
import bookingsRouter from './modules/bookings/bookings.routes';
import invoicesRouter from './modules/invoices/invoices.routes';
import walletRouter from './modules/wallet/wallet.routes';
import reportsRouter from './modules/reports/reports.routes';
import cruiseRouter from './modules/nile-cruise/cruise.routes';
import transportRouter from './modules/transport/transport.routes';
import { transportRatesRouter } from './modules/transport/transport.routes';
import activitiesRouter from './modules/activities/activities.routes';
import visaRouter from './modules/visa/visa.routes';
import receptionRouter from './modules/airport-reception/reception.routes';
import adminRouter from './admin/admin.routes';
import { entitySheetsRouter } from './modules/sheets-sync/sheets-sync.routes';
import masterDataRouter from './modules/master-data/master-data.routes';
import destinationsRouter from './modules/destinations/destinations.routes';
import quoteRequestsRouter from './modules/quote-requests/quote-requests.routes';
import offersRouter from './modules/offers/offers.routes';
import simCardRouter from './modules/sim-card/sim-card.routes';
import uploadRouter from './modules/upload/upload.routes';
import { adminUiTemplatesRouter, userUiTemplatesRouter } from './modules/ui-templates/ui-templates.routes';
import { enrichRouter } from './modules/enrichment/enrichment.routes';

const app = express();
const PORT = parseInt(process.env.PORT ?? '3000');

app.use(cors({ origin: process.env.BASE_URL, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());

// Static files
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));
app.use('/generated', express.static(path.join(__dirname, '..', 'generated')));

app.get('/media/hotel-image', async (req, res) => {
  try {
    const rawUrl = String(req.query.url ?? '');
    const url = new URL(rawUrl);
    const allowedHosts = ['cf.bstatic.com', 'q-xx.bstatic.com'];
    if (url.protocol !== 'https:' || !allowedHosts.includes(url.hostname)) {
      res.status(400).send('Unsupported image source');
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    const upstream = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 ElbakriPortal/1.0',
        Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      },
    });
    clearTimeout(timer);

    if (!upstream.ok) {
      res.status(upstream.status).send('Image unavailable');
      return;
    }

    const contentType = upstream.headers.get('content-type') ?? 'image/jpeg';
    if (!contentType.startsWith('image/')) {
      res.status(415).send('Unsupported media type');
      return;
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
    const length = upstream.headers.get('content-length');
    if (length) res.setHeader('Content-Length', length);
    if (!upstream.body) {
      res.status(502).send('Image body unavailable');
      return;
    }
    Readable.fromWeb(upstream.body).pipe(res);
  } catch {
    res.status(502).send('Image proxy failed');
  }
});

// Auth (no JWT required)
app.use('/api/auth', authRouter);

// Protected routes
app.use('/api/users', authenticate, usersRouter);
app.use('/api/hotels', authenticate, hotelsRouter);
app.use('/api/bookings', authenticate, bookingsRouter);
app.use('/api/invoices', authenticate, invoicesRouter);
app.use('/api/wallet', authenticate, walletRouter);
app.use('/api/reports', authenticate, reportsRouter);
app.use('/api', authenticate, entitySheetsRouter);
app.use('/api', authenticate, masterDataRouter);
app.use('/api', authenticate, cruiseRouter);
app.use('/api/transport-bookings', authenticate, transportRouter);
app.use('/api/transport-rates', authenticate, transportRatesRouter);
app.use('/api', authenticate, activitiesRouter);
app.use('/api/visa-applications', authenticate, visaRouter);
app.use('/api/airport-receptions', authenticate, receptionRouter);
app.use('/api/destinations', authenticate, destinationsRouter);
app.use('/api/quote-requests', authenticate, quoteRequestsRouter);
app.use('/api/offers', authenticate, offersRouter);
app.use('/api/sim-card', authenticate, simCardRouter);
app.use('/api/upload', authenticate, uploadRouter);
app.use('/api/ui-templates', authenticate, userUiTemplatesRouter);
app.use('/api/admin/ui-templates', authenticate, adminUiTemplatesRouter);
app.use('/api/admin/enrich', authenticate, enrichRouter);
app.use('/api/admin', authenticate, adminRouter);

// SPA fallback — serve admin for /admin, dashboard for everything else
app.get('/admin*', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'admin.html'));
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'dashboard.html'));
});

// Global error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ success: false, error: 'INTERNAL_ERROR', message: err.message });
});

app.listen(PORT, () => {
  console.log(`🚀 Elbakri Portal running at http://localhost:${PORT}`);
});

export default app;
