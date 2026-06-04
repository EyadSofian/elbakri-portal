/**
 * Applies researched hotel hero images (from MEA_Hotel_Images_Research.xlsx) to the catalog
 * so the owner can review them in Admin → Hotels and then edit / add more in the hotel form.
 *
 * Only verified, resolving property photos are included (the QA-rejected cityscape and brand-logo
 * graphics are intentionally excluded). Non-destructive: a hotel keeps any image it already has.
 * Idempotent: re-running makes no further changes.
 *
 * Run:  npm run db:apply:images
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const norm = (v: string) => String(v || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// tokens must ALL appear in the hotel name; optional city scopes the match.
type Img = { tokens: string[]; city?: string; not?: string[]; url: string };
const IMAGES: Img[] = [
  { tokens: ['regency', 'pyramids'], city: 'Cairo', url: 'https://www.regencypyramidshotel.com/sites/regencypyramidshotel/files/1.jpg' },
  { tokens: ['safir'], city: 'Cairo', url: 'https://opengraph.b-cdn.net/production/images/5bb2ddea-4516-4fe4-9dd8-ea491c40ef46.jpg?token=Icw0a1mcSwwBwoAyQQ5xCB14QWxbaB9DrjmH6Fq-Ctc&height=630&width=1200&expires=33263373956' },
  { tokens: ['casa', 'cook'], url: 'https://casacook.com/wp-content/uploads/2025/03/drz_casa-cook-north-coast_1466-1-1.jpg' },
  { tokens: ['porto', 'marina'], url: 'https://lirp.cdn-website.com/52d4fe1d/dms3rep/multi/opt/Landing+Page+Cover+Photo-1920w.jpg' },
  { tokens: ['rixos', 'alamein'], url: 'https://www.ahstatic.com/photos/c320_ho_00_p_1024x768.jpg' },
  { tokens: ['rixos', 'seagate'], url: 'https://www.ahstatic.com/photos/b1j8_ho_00_p_1024x768.jpg' },
  { tokens: ['rixos', 'radmis'], url: 'https://www.ahstatic.com/photos/c158_ho_00_p_1024x768.jpg' },
  { tokens: ['rixos', 'sharm'], not: ['radmis', 'seagate', 'premium', 'alamein'], url: 'https://www.ahstatic.com/photos/b1j0_ho_00_p_1024x768.jpg' },
  { tokens: ['novotel', 'ssh'], url: 'https://www.ahstatic.com/photos/1715_ho_00_p_1024x768.jpg' },
  { tokens: ['naama', 'bay', 'promenade'], url: 'https://www.ahstatic.com/photos/b6t1_ho_00_p_1024x768.jpg' },
  { tokens: ['swissotel'], url: 'https://www.swissotel.com/assets/0/92/2119/7910/7953/7955/7981/2a21f22a-246b-40bc-98c7-df7c9b0ac395.jpg' },
  { tokens: ['sultan', 'gardens'], url: 'https://lirp.cdn-website.com/cfc540a7/dms3rep/multi/opt/Al+Shalal+Pool-+-+08-1920w.jpg' },
  { tokens: ['sunrise', 'arabian'], url: 'https://d1wo7kaelp5eck.cloudfront.net/sunrise-resorts.com-1611976553/cms/cache/v2/64be6253f344c.jpg/1200x630/fit/80/2ea5e3c96027438fcd5efa23dd6f9285.jpg' },
  { tokens: ['concorde', 'salam'], city: 'Sharm El Sheikh', url: 'https://media.iceportal.com/25831/photos/75224765_L.jpg' },
  { tokens: ['cleopatra', 'luxury'], not: ['adult'], url: 'https://www.cleopatraluxuryhotels.com/wp-content/uploads/sites/55/2023/07/Exterior-13-2400x1200.jpg' },
  { tokens: ['cleopatra', 'luxury', 'adult'], url: 'https://www.cleopatraluxuryhotels.com/wp-content/uploads/sites/55/2023/07/Cleopatra-adults-only-2.jpg' },
  { tokens: ['charmillion', 'club', 'resort'], not: ['aqua'], url: 'https://charmillionresorts.com/wp-content/uploads/elementor/thumbs/Overview-Text-Image-qbtbcw8q0xv4ujovaq9uxpant9rrw46q6v3k385on4.jpg' },
  { tokens: ['charmillion', 'club', 'aqua'], url: 'https://charmillionresorts.com/wp-content/uploads/elementor/thumbs/Overview-text-qbt1lk4fi8wt9m0yuv1yyd06ghgqsxekjwpyfx36dc.jpg' },
  { tokens: ['hilton', 'grand', 'nile'], city: 'Cairo', url: 'https://upload.wikimedia.org/wikipedia/commons/a/a5/Cairo_-_Garden_City_-_Hyatt_from_the_Nile.JPG' },
];

async function main() {
  const hotels = await prisma.hotel.findMany({ select: { id: true, name: true, city: true, imageUrl: true } });
  let applied = 0, alreadyHadImage = 0, unmatched = 0;
  const usedHotelIds = new Set<string>();

  for (const img of IMAGES) {
    const match = hotels.find(h => {
      if (usedHotelIds.has(h.id)) return false;
      if (img.city && img.city.toLowerCase() !== String(h.city).toLowerCase()) return false;
      const nn = norm(h.name);
      if (img.not && img.not.some(x => nn.includes(x))) return false;
      return img.tokens.every(tok => nn.includes(tok));
    });
    if (!match) { unmatched++; console.log(`· no hotel for [${img.tokens.join(' ')}]${img.city ? ' @ ' + img.city : ''}`); continue; }
    usedHotelIds.add(match.id);
    if (match.imageUrl && match.imageUrl.trim()) { alreadyHadImage++; console.log(`= "${match.name}" already has an image — left unchanged`); continue; }
    await prisma.hotel.update({ where: { id: match.id }, data: { imageUrl: img.url } });
    applied++;
    console.log(`✓ "${match.name}" → image set`);
  }

  const totalWithImage = await prisma.hotel.count({ where: { NOT: [{ imageUrl: null }, { imageUrl: '' }] } });
  console.log(`\n──────── SUMMARY ────────`);
  console.log(`  Images applied (were empty) : ${applied}`);
  console.log(`  Left unchanged (had image)  : ${alreadyHadImage}`);
  console.log(`  No matching hotel found     : ${unmatched}`);
  console.log(`  Hotels with an image now    : ${totalWithImage}`);
  console.log(`\nReview them in Admin → Hotels (open a hotel to edit the image or add gallery images).`);
}

main().catch(e => { console.error('❌', e); process.exit(1); }).finally(() => prisma.$disconnect());
