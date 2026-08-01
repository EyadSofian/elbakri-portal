/**
 * Vercel serverless entry.
 *
 * Vercel's Node runtime invokes the default export as the request handler, and
 * an Express app is itself a (req, res) function — so the app is re-exported
 * unchanged. All routing, middleware and static serving stay in src/app.ts;
 * this file exists only to give the platform an entry point.
 *
 * src/app.ts skips app.listen() when VERCEL is set, so importing it here has
 * no side effect beyond building the app.
 */
export { default } from '../src/app';
