import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import path from 'path';

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
import activitiesRouter from './modules/activities/activities.routes';
import visaRouter from './modules/visa/visa.routes';
import receptionRouter from './modules/airport-reception/reception.routes';
import adminRouter from './admin/admin.routes';
import { entitySheetsRouter } from './modules/sheets-sync/sheets-sync.routes';
import masterDataRouter from './modules/master-data/master-data.routes';

const app = express();
const PORT = parseInt(process.env.PORT ?? '3000');

app.use(cors({ origin: process.env.BASE_URL, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());

// Static files
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));
app.use('/generated', express.static(path.join(__dirname, '..', 'generated')));

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
app.use('/api', authenticate, activitiesRouter);
app.use('/api/visa-applications', authenticate, visaRouter);
app.use('/api/airport-receptions', authenticate, receptionRouter);
app.use('/api/admin', authenticate, adminRouter);

// SPA fallback
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
