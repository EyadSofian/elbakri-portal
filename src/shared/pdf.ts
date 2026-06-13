/**
 * Shared PDF helpers — Arabic-capable font registration for PDFKit.
 *
 * The bundled Tajawal font (OFL, public/assets/fonts) covers Latin + Arabic.
 * PDFKit/fontkit applies Arabic contextual shaping AND right-to-left bidi
 * ordering automatically, so Arabic text just needs the right font + alignment.
 */
import fs from 'fs';
import path from 'path';
import type PDFDocument from 'pdfkit';

const FONT_DIR = path.join(process.cwd(), 'public', 'assets', 'fonts');

export const PDF_FONTS = {
  regular: path.join(FONT_DIR, 'Tajawal-Regular.ttf'),
  medium: path.join(FONT_DIR, 'Tajawal-Medium.ttf'),
  bold: path.join(FONT_DIR, 'Tajawal-Bold.ttf'),
};

const ARABIC_RE = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;

/** True when the string contains any Arabic-script characters. */
export function hasArabic(s?: string | null): boolean {
  return !!s && ARABIC_RE.test(s);
}

/** Pick text alignment based on script (Arabic → right, default → given/ltr). */
export function alignFor(value: string | null | undefined, fallback: 'left' | 'center' | 'right' = 'left') {
  return hasArabic(value) ? 'right' : fallback;
}

let fontsAvailable: boolean | null = null;
function fontsExist(): boolean {
  if (fontsAvailable === null) {
    fontsAvailable = fs.existsSync(PDF_FONTS.regular) && fs.existsSync(PDF_FONTS.bold);
  }
  return fontsAvailable;
}

/**
 * Register the body/heading fonts on a PDFKit document under stable aliases:
 *   'body', 'body-medium', 'body-bold'.
 * Falls back to the built-in Helvetica (no Arabic) only if the font files are
 * missing, so generation never crashes.
 */
export function registerPdfFonts(doc: InstanceType<typeof PDFDocument>): void {
  if (fontsExist()) {
    doc.registerFont('body', PDF_FONTS.regular);
    doc.registerFont('body-medium', PDF_FONTS.medium);
    doc.registerFont('body-bold', PDF_FONTS.bold);
  } else {
    doc.registerFont('body', 'Helvetica');
    doc.registerFont('body-medium', 'Helvetica');
    doc.registerFont('body-bold', 'Helvetica-Bold');
  }
  doc.font('body');
}
