/**
 * Fixture data for preview mode.
 *
 * Entirely invented — no real agency, client, price or balance appears here.
 * The shapes mirror what the Prisma queries return so the frontend renders
 * exactly as it would against a live database.
 */

export const DEMO_COMPANIES = [
  {
    id: 'c1', name: 'Nile Star Travel', nameAr: 'نجمة النيل للسفر',
    email: 'ops@nilestar.example', phone: '+20 100 000 0001', country: 'Egypt', city: 'Cairo',
    address: '12 Corniche El Nil, Garden City', tier: 'PLATINUM', market: 'EGYPTIAN', currency: 'EGP',
    walletBalance: 412300.5, creditLimit: 500000, isActive: true, logoUrl: null,
    contactPerson: 'Mona Adel', taxId: 'EG-000-000-001', createdAt: '2024-03-11T09:00:00.000Z',
  },
  {
    id: 'c2', name: 'Horizon Voyages', nameAr: 'آفاق للرحلات',
    email: 'book@horizonvoyages.example', phone: '+971 50 000 0002', country: 'UAE', city: 'Dubai',
    address: 'Sheikh Zayed Rd, Business Bay', tier: 'GOLD', market: 'GULF', currency: 'USD',
    walletBalance: 18240.75, creditLimit: 40000, isActive: true, logoUrl: null,
    contactPerson: 'Rami Habib', taxId: 'AE-000-000-002', createdAt: '2024-06-02T09:00:00.000Z',
  },
  {
    id: 'c3', name: 'Atlas Reisen GmbH', nameAr: 'أطلس',
    email: 'kontakt@atlasreisen.example', phone: '+49 30 000 0003', country: 'Germany', city: 'Berlin',
    address: 'Friedrichstrasse 100', tier: 'SILVER', market: 'EUROPEAN', currency: 'USD',
    walletBalance: 6120, creditLimit: 15000, isActive: true, logoUrl: null,
    contactPerson: 'Klaus Berger', taxId: 'DE-000-000-003', createdAt: '2025-01-20T09:00:00.000Z',
  },
  {
    id: 'c4', name: 'Cedar Gate Tours', nameAr: 'بوابة الأرز',
    email: 'hello@cedargate.example', phone: '+961 3 000 004', country: 'Lebanon', city: 'Beirut',
    address: 'Hamra Street 44', tier: 'STANDARD', market: 'OTHER', currency: 'USD',
    walletBalance: 940.2, creditLimit: 5000, isActive: false, logoUrl: null,
    contactPerson: 'Layla Haddad', taxId: 'LB-000-000-004', createdAt: '2025-04-14T09:00:00.000Z',
  },
  {
    id: 'c5', name: 'Red Sea Holidays', nameAr: 'عطلات البحر الأحمر',
    email: 'res@redseaholidays.example', phone: '+20 122 000 0005', country: 'Egypt', city: 'Hurghada',
    address: 'Village Road, Sakkala', tier: 'GOLD', market: 'EGYPTIAN', currency: 'EGP',
    walletBalance: 98450, creditLimit: 250000, isActive: true, logoUrl: null,
    contactPerson: 'Ahmed Nabil', taxId: 'EG-000-000-005', createdAt: '2024-11-05T09:00:00.000Z',
  },
];

export const DEMO_USERS = [
  { id: 'u1', name: 'Portal Administrator', email: 'admin@elbakri.com', role: 'SUPERADMIN', isActive: true, phone: '+20 100 000 0000', companyId: null, company: null, lastLogin: '2026-08-01T06:40:00.000Z', createdAt: '2024-01-01T00:00:00.000Z' },
  { id: 'u2', name: 'Mona Adel', email: 'admin@niletravel.com', role: 'COMPANY_ADMIN', isActive: true, phone: '+20 100 111 2233', companyId: 'c1', company: DEMO_COMPANIES[0], lastLogin: '2026-07-31T18:12:00.000Z', createdAt: '2024-03-11T09:00:00.000Z' },
  { id: 'u3', name: 'Rami Habib', email: 'admin@pyramidstours.com', role: 'COMPANY_ADMIN', isActive: true, phone: '+971 50 887 1200', companyId: 'c2', company: DEMO_COMPANIES[1], lastLogin: '2026-07-30T11:02:00.000Z', createdAt: '2024-06-02T09:00:00.000Z' },
  { id: 'u4', name: 'Klaus Berger', email: 'agent1@niletravel.com', role: 'AGENT', isActive: true, phone: '+49 30 555 0198', companyId: 'c1', company: DEMO_COMPANIES[0], lastLogin: '2026-07-29T08:55:00.000Z', createdAt: '2025-01-20T09:00:00.000Z' },
];

/** email → password. Mirrors prisma/seed.ts so the same logins work either way. */
export const DEMO_LOGINS: Record<string, string> = {
  'admin@elbakri.com': 'Admin@1982',
  'admin@niletravel.com': 'NileAdmin@2024',
  'admin@pyramidstours.com': 'PyramidsAdmin@2024',
  'agent1@niletravel.com': 'Agent@12345',
};

export const DEMO_DESTINATIONS = [
  { id: 'd1', name: 'Cairo', nameAr: 'القاهرة', type: 'CITY', country: 'Egypt', imageUrl: null, isActive: true, hotelCount: 42, description: 'Pyramids, the Egyptian Museum and Old Cairo.' },
  { id: 'd2', name: 'Hurghada', nameAr: 'الغردقة', type: 'RESORT', country: 'Egypt', imageUrl: null, isActive: true, hotelCount: 68, description: 'Red Sea resorts and diving.' },
  { id: 'd3', name: 'Sharm El Sheikh', nameAr: 'شرم الشيخ', type: 'RESORT', country: 'Egypt', imageUrl: null, isActive: true, hotelCount: 57, description: 'Naama Bay, Ras Mohammed, Nabq.' },
  { id: 'd4', name: 'Luxor', nameAr: 'الأقصر', type: 'CITY', country: 'Egypt', imageUrl: null, isActive: true, hotelCount: 23, description: 'Karnak, Valley of the Kings.' },
  { id: 'd5', name: 'Aswan', nameAr: 'أسوان', type: 'CITY', country: 'Egypt', imageUrl: null, isActive: true, hotelCount: 16, description: 'Philae, Abu Simbel, Nubian villages.' },
  { id: 'd6', name: 'Marsa Alam', nameAr: 'مرسى علم', type: 'RESORT', country: 'Egypt', imageUrl: null, isActive: true, hotelCount: 19, description: 'Quiet Red Sea coast, reef diving.' },
];

const AMENITIES = ['Private beach', 'Spa', 'Free Wi-Fi', 'Pool', 'All inclusive', 'Aquapark', 'Diving centre', 'Nile view', 'Airport transfer', 'Gym'];

export const DEMO_HOTELS = [
  { id: 'h1', name: 'Steigenberger Al Dau Beach', nameAr: 'شتيجنبرجر الدو بيتش', city: 'Hurghada', area: 'Yussif Afifi Rd', rating: 5, source: 'MANUAL', basePrice: 210, currency: 'USD', isActive: true, mainImage: null, images: [], destinationId: 'd2', destination: DEMO_DESTINATIONS[1], amenities: [AMENITIES[0], AMENITIES[1], AMENITIES[2], AMENITIES[3]], checkInTime: '14:00', checkOutTime: '12:00', showPrice: true },
  { id: 'h2', name: 'Four Seasons Nile Plaza', nameAr: 'فورسيزونز نايل بلازا', city: 'Cairo', area: 'Garden City', rating: 5, source: 'MANUAL', basePrice: 395, currency: 'USD', isActive: true, mainImage: null, images: [], destinationId: 'd1', destination: DEMO_DESTINATIONS[0], amenities: [AMENITIES[7], AMENITIES[1], AMENITIES[8]], checkInTime: '15:00', checkOutTime: '12:00', showPrice: true },
  { id: 'h3', name: 'Rixos Premium Seagate', nameAr: 'ريكسوس بريميوم سي جيت', city: 'Sharm El Sheikh', area: 'Nabq Bay', rating: 5, source: 'SHEETS', basePrice: 265, currency: 'USD', isActive: true, mainImage: null, images: [], destinationId: 'd3', destination: DEMO_DESTINATIONS[2], amenities: [AMENITIES[4], AMENITIES[5], AMENITIES[6]], checkInTime: '14:00', checkOutTime: '12:00', showPrice: true },
  { id: 'h4', name: 'Sonesta St. George', nameAr: 'سونستا سانت جورج', city: 'Luxor', area: 'Corniche El Nil', rating: 5, source: 'MANUAL', basePrice: 140, currency: 'USD', isActive: true, mainImage: null, images: [], destinationId: 'd4', destination: DEMO_DESTINATIONS[3], amenities: [AMENITIES[7], AMENITIES[3]], checkInTime: '14:00', checkOutTime: '12:00', showPrice: true },
  { id: 'h5', name: 'Movenpick Resort Aswan', nameAr: 'موفنبيك أسوان', city: 'Aswan', area: 'Elephantine Island', rating: 5, source: 'SHEETS', basePrice: 165, currency: 'USD', isActive: false, mainImage: null, images: [], destinationId: 'd5', destination: DEMO_DESTINATIONS[4], amenities: [AMENITIES[3], AMENITIES[1]], checkInTime: '14:00', checkOutTime: '12:00', showPrice: false },
  { id: 'h6', name: 'Jaz Maraya Resort', nameAr: 'جاز مرايا', city: 'Marsa Alam', area: 'Coraya Bay', rating: 5, source: 'MANUAL', basePrice: 155, currency: 'USD', isActive: true, mainImage: null, images: [], destinationId: 'd6', destination: DEMO_DESTINATIONS[5], amenities: [AMENITIES[4], AMENITIES[6], AMENITIES[0]], checkInTime: '14:00', checkOutTime: '12:00', showPrice: true },
];

export const DEMO_BOOKINGS = [
  { id: 'b1', bookingRef: 'ELB-2026-004811', type: 'HOTEL', status: 'CONFIRMED', clientName: 'Youssef Kamal', clientEmail: 'y.kamal@example.com', clientPhone: '+20 100 555 0001', totalAmount: 1840, currency: 'USD', checkIn: '2026-08-14', checkOut: '2026-08-19', adults: 2, children: 0, nights: 5, roomType: 'DOUBLE', mealPlan: 'BB', companyId: 'c1', company: DEMO_COMPANIES[0], hotelId: 'h1', hotel: DEMO_HOTELS[0], createdAt: '2026-07-28T11:04:00.000Z', notes: '' },
  { id: 'b2', bookingRef: 'ELB-2026-004812', type: 'CRUISE', status: 'PENDING', clientName: 'Marta Vogel', clientEmail: 'm.vogel@example.com', clientPhone: '+49 170 555 0002', totalAmount: 3260, currency: 'USD', checkIn: '2026-09-02', checkOut: '2026-09-06', adults: 4, children: 0, nights: 4, roomType: 'DOUBLE', mealPlan: 'FB', companyId: 'c3', company: DEMO_COMPANIES[2], hotelId: null, hotel: { name: 'MS Nile Dawn — Luxor → Aswan' }, createdAt: '2026-07-29T08:22:00.000Z', notes: '' },
  { id: 'b3', bookingRef: 'ELB-2026-004813', type: 'TRANSPORT', status: 'CONFIRMED', clientName: 'Ahmed Nabil', clientEmail: 'a.nabil@example.com', clientPhone: '+20 122 555 0003', totalAmount: 4200, currency: 'EGP', checkIn: '2026-08-03', checkOut: '2026-08-03', adults: 6, children: 0, nights: 0, roomType: null, mealPlan: null, companyId: 'c5', company: DEMO_COMPANIES[4], hotelId: null, hotel: { name: 'CAI → Giza — Hiace' }, createdAt: '2026-07-30T14:41:00.000Z', notes: '' },
  { id: 'b4', bookingRef: 'ELB-2026-004814', type: 'ACTIVITY', status: 'CANCELLED', clientName: 'Layla Haddad', clientEmail: 'l.haddad@example.com', clientPhone: '+961 3 555 004', totalAmount: 610, currency: 'USD', checkIn: '2026-08-11', checkOut: '2026-08-11', adults: 2, children: 0, nights: 0, roomType: null, mealPlan: null, companyId: 'c4', company: DEMO_COMPANIES[3], hotelId: null, hotel: { name: 'Hot Air Balloon — Luxor' }, createdAt: '2026-07-30T16:02:00.000Z', notes: 'Cancelled by client.' },
  { id: 'b5', bookingRef: 'ELB-2026-004815', type: 'HOTEL', status: 'COMPLETED', clientName: 'Omar Farouk', clientEmail: 'o.farouk@example.com', clientPhone: '+971 50 555 0005', totalAmount: 9750, currency: 'USD', checkIn: '2026-07-10', checkOut: '2026-07-18', adults: 3, children: 1, nights: 8, roomType: 'TRIPLE', mealPlan: 'HB', companyId: 'c2', company: DEMO_COMPANIES[1], hotelId: 'h2', hotel: DEMO_HOTELS[1], createdAt: '2026-06-30T10:15:00.000Z', notes: '' },
  { id: 'b6', bookingRef: 'ELB-2026-004816', type: 'VISA', status: 'PENDING', clientName: 'Sara Mansour', clientEmail: 's.mansour@example.com', clientPhone: '+971 50 555 0006', totalAmount: 320, currency: 'USD', checkIn: '2026-08-20', checkOut: '2026-08-20', adults: 1, children: 0, nights: 0, roomType: null, mealPlan: null, companyId: 'c2', company: DEMO_COMPANIES[1], hotelId: null, hotel: { name: 'Egypt e-Visa — single entry' }, createdAt: '2026-08-01T07:30:00.000Z', notes: '' },
  { id: 'b7', bookingRef: 'ELB-2026-004817', type: 'HOTEL', status: 'CONFIRMED', clientName: 'Dina Fouad', clientEmail: 'd.fouad@example.com', clientPhone: '+20 111 555 0007', totalAmount: 2650, currency: 'EGP', checkIn: '2026-08-22', checkOut: '2026-08-26', adults: 2, children: 2, nights: 4, roomType: 'DOUBLE', mealPlan: 'AI', companyId: 'c5', company: DEMO_COMPANIES[4], hotelId: 'h3', hotel: DEMO_HOTELS[2], createdAt: '2026-07-31T12:00:00.000Z', notes: '' },
];

export const DEMO_INVOICES = [
  { id: 'i1', invoiceNumber: 'INV-2026-002204', status: 'PAID', totalAmount: 1840, subtotal: 1840, tax: 0, currency: 'USD', issueDate: '2026-07-28', dueDate: '2026-08-07', paidAt: '2026-07-29T10:00:00.000Z', companyId: 'c1', company: DEMO_COMPANIES[0], bookingId: 'b1', booking: DEMO_BOOKINGS[0] },
  { id: 'i2', invoiceNumber: 'INV-2026-002205', status: 'UNPAID', totalAmount: 3260, subtotal: 3260, tax: 0, currency: 'USD', issueDate: '2026-07-29', dueDate: '2026-08-08', paidAt: null, companyId: 'c3', company: DEMO_COMPANIES[2], bookingId: 'b2', booking: DEMO_BOOKINGS[1] },
  { id: 'i3', invoiceNumber: 'INV-2026-002206', status: 'OVERDUE', totalAmount: 610, subtotal: 610, tax: 0, currency: 'USD', issueDate: '2026-06-30', dueDate: '2026-07-10', paidAt: null, companyId: 'c4', company: DEMO_COMPANIES[3], bookingId: 'b4', booking: DEMO_BOOKINGS[3] },
  { id: 'i4', invoiceNumber: 'INV-2026-002207', status: 'PAID', totalAmount: 9750, subtotal: 9750, tax: 0, currency: 'USD', issueDate: '2026-06-30', dueDate: '2026-07-10', paidAt: '2026-07-02T09:00:00.000Z', companyId: 'c2', company: DEMO_COMPANIES[1], bookingId: 'b5', booking: DEMO_BOOKINGS[4] },
  { id: 'i5', invoiceNumber: 'INV-2026-002208', status: 'UNPAID', totalAmount: 4200, subtotal: 4200, tax: 0, currency: 'EGP', issueDate: '2026-07-30', dueDate: '2026-08-09', paidAt: null, companyId: 'c5', company: DEMO_COMPANIES[4], bookingId: 'b3', booking: DEMO_BOOKINGS[2] },
];

export const DEMO_TRANSACTIONS = [
  { id: 't1', type: 'CREDIT', amount: 50000, currency: 'EGP', balanceAfter: 412300.5, description: 'Top-up — bank transfer', reference: 'TOPUP-8821', companyId: 'c1', company: DEMO_COMPANIES[0], createdAt: '2026-07-30T09:00:00.000Z' },
  { id: 't2', type: 'DEBIT', amount: 4200, currency: 'EGP', balanceAfter: 362300.5, description: 'Transport ELB-2026-004813', reference: 'ELB-2026-004813', companyId: 'c5', company: DEMO_COMPANIES[4], createdAt: '2026-07-30T14:41:00.000Z' },
  { id: 't3', type: 'DEBIT', amount: 1840, currency: 'USD', balanceAfter: 16400.75, description: 'Hotel ELB-2026-004811', reference: 'ELB-2026-004811', companyId: 'c1', company: DEMO_COMPANIES[0], createdAt: '2026-07-28T11:04:00.000Z' },
  { id: 't4', type: 'REFUND', amount: 610, currency: 'USD', balanceAfter: 1550.2, description: 'Cancelled activity ELB-2026-004814', reference: 'ELB-2026-004814', companyId: 'c4', company: DEMO_COMPANIES[3], createdAt: '2026-07-31T09:12:00.000Z' },
  { id: 't5', type: 'CREDIT', amount: 25000, currency: 'EGP', balanceAfter: 98450, description: 'Top-up — Instapay', reference: 'TOPUP-8834', companyId: 'c5', company: DEMO_COMPANIES[4], createdAt: '2026-07-27T08:30:00.000Z' },
];

export const DEMO_QUOTES = [
  { id: 'q1', requestNumber: 'QR-2026-000312', status: 'PENDING', serviceType: 'HOTEL', clientName: 'Nadia Saleh', companyId: 'c1', company: DEMO_COMPANIES[0], createdAt: '2026-07-31T10:00:00.000Z', details: { destination: 'Hurghada', nights: 5, pax: 2 }, quotedAmount: null, currency: 'USD' },
  { id: 'q2', requestNumber: 'QR-2026-000313', status: 'QUOTED', serviceType: 'TRANSPORT', clientName: 'Peter Lang', companyId: 'c3', company: DEMO_COMPANIES[2], createdAt: '2026-07-30T13:20:00.000Z', details: { from: 'CAI', to: 'Alexandria', pax: 8 }, quotedAmount: 3400, currency: 'EGP' },
  { id: 'q3', requestNumber: 'QR-2026-000314', status: 'CONFIRMED', serviceType: 'ACTIVITY', clientName: 'Hala Zaki', companyId: 'c2', company: DEMO_COMPANIES[1], createdAt: '2026-07-29T09:45:00.000Z', details: { activity: 'Luxor day tour', pax: 4 }, quotedAmount: 480, currency: 'USD' },
];

export const DEMO_OFFERS = [
  { id: 'o1', title: 'Red Sea — 20% off August', titleAr: 'البحر الأحمر — خصم ٢٠٪', description: 'Selected 5-star resorts in Hurghada and Marsa Alam.', descriptionAr: 'منتجعات ٥ نجوم مختارة في الغردقة ومرسى علم.', imageUrl: null, validFrom: '2026-08-01', validTo: '2026-08-31', isActive: true, ctaLabel: 'Browse hotels', ctaAction: 'hotels' },
  { id: 'o2', title: 'Nile cruise early booking', titleAr: 'حجز مبكر لرحلات النيل', description: 'Book 60 days ahead for a free cabin upgrade.', descriptionAr: 'احجز قبل ٦٠ يوم واحصل على ترقية كابينة مجانية.', imageUrl: null, validFrom: '2026-08-01', validTo: '2026-10-31', isActive: true, ctaLabel: 'See cruises', ctaAction: 'cruises' },
];

export const DEMO_CRUISES = [
  { id: 'cr1', name: 'MS Nile Dawn', nameAr: 'إم إس نايل داون', shipType: 'DELUXE', route: 'LUXOR_ASWAN', nights: 4, basePrice: 815, currency: 'USD', isActive: true, cabins: 62, description: 'Luxor to Aswan, four nights.' },
  { id: 'cr2', name: 'MS Royal Lotus', nameAr: 'إم إس رويال لوتس', shipType: 'LUXURY', route: 'ASWAN_LUXOR', nights: 3, basePrice: 690, currency: 'USD', isActive: true, cabins: 48, description: 'Aswan to Luxor, three nights.' },
  { id: 'cr3', name: 'MS Sun Ray', nameAr: 'إم إس صن راي', shipType: 'STANDARD', route: 'LUXOR_ASWAN', nights: 4, basePrice: 540, currency: 'USD', isActive: true, cabins: 54, description: 'Value option, four nights.' },
];

export const DEMO_ACTIVITIES = [
  { id: 'ac1', name: 'Hot Air Balloon — Luxor', nameAr: 'البالون الطائر — الأقصر', category: 'ADVENTURE', basePrice: 95, currency: 'USD', isActive: true, durationHours: 3, destinationId: 'd4', destination: DEMO_DESTINATIONS[3], transferIncluded: true },
  { id: 'ac2', name: 'Pyramids & Sphinx half day', nameAr: 'الأهرامات وأبو الهول', category: 'CULTURAL', basePrice: 55, currency: 'USD', isActive: true, durationHours: 5, destinationId: 'd1', destination: DEMO_DESTINATIONS[0], transferIncluded: true },
  { id: 'ac3', name: 'Red Sea snorkelling trip', nameAr: 'رحلة سنوركلينج', category: 'WATER_SPORTS', basePrice: 40, currency: 'USD', isActive: true, durationHours: 6, destinationId: 'd2', destination: DEMO_DESTINATIONS[1], transferIncluded: true },
  // Mirrors the production SAFARI price shape so preview/browser QA exercises
  // the exact bug that was reported: every enabled basis is selectable, zero
  // child price stays free, and Double/Triple grow with the passenger count.
  {
    id: 'ac4', name: 'SAFARI', nameAr: 'ســفـارى', city: 'SHARM EL SHEIKH',
    category: 'DESERT_SAFARI', basePrice: 20, priceAdult: 20, priceChild: 0,
    priceSingle: 20, priceDouble: 25, priceTriple: 55, currency: 'USD',
    isActive: true, isConfirmableInApp: true, duration: '3 hours', durationHours: 3,
    timeSlots: ['04:00 AM', '01:00 PM', '03:00 PM'], returnTime: '18:00',
    destinationId: 'd3', destination: DEMO_DESTINATIONS[2], transferIncluded: false,
    inclusions: [
      { label: 'Quad bike', labelAr: 'بيتش باجي', included: true },
      { label: 'Transfer', labelAr: 'الانتقالات', included: false },
    ],
    includes: ['Quad bike'], excludes: ['Transfer'], galleryUrls: [],
    description: 'Sharm El Sheikh desert safari with flexible departure times.',
    descriptionAr: 'رحلة سفاري في صحراء شرم الشيخ بمواعيد تحرك مرنة.',
  },
];

export const DEMO_AIRPORTS = [
  { id: 'a1', code: 'CAI', name: 'Cairo International', nameAr: 'مطار القاهرة الدولي', isActive: true },
  { id: 'a2', code: 'HRG', name: 'Hurghada International', nameAr: 'مطار الغردقة الدولي', isActive: true },
  { id: 'a3', code: 'SSH', name: 'Sharm El Sheikh International', nameAr: 'مطار شرم الشيخ الدولي', isActive: true },
  { id: 'a4', code: 'LXR', name: 'Luxor International', nameAr: 'مطار الأقصر الدولي', isActive: true },
];

export const DEMO_SIM_PACKAGES = [
  { id: 's1', name: 'Tourist 15GB / 14 days', nameAr: 'سياحي ١٥ جيجا / ١٤ يوم', dataGb: 15, validityDays: 14, price: 12, currency: 'USD', isActive: true, operator: 'Vodafone' },
  { id: 's2', name: 'Tourist 30GB / 30 days', nameAr: 'سياحي ٣٠ جيجا / ٣٠ يوم', dataGb: 30, validityDays: 30, price: 20, currency: 'USD', isActive: true, operator: 'Orange' },
];

export const DEMO_REPORT_OVERVIEW = {
  totalBookings: 1284,
  pendingBookings: 37,
  confirmedBookings: 1103,
  cancelledBookings: 144,
  completedBookings: 962,
  totalRevenue: 4820550,
  currency: 'USD',
  totalCompanies: 58,
  activeCompanies: 51,
  totalUsers: 137,
  totalHotels: 6,
  totalInvoices: 2204,
  paidInvoices: 2141,
  unpaidInvoices: 63,
  overdueInvoices: 11,
  walletExposure: 738120,
  platformWalletBalance: 2841900,
  monthly: [
    { month: '2026-03', bookings: 178, revenue: 612400 },
    { month: '2026-04', bookings: 195, revenue: 701250 },
    { month: '2026-05', bookings: 231, revenue: 845900 },
    { month: '2026-06', bookings: 244, revenue: 902100 },
    { month: '2026-07', bookings: 268, revenue: 988700 },
    { month: '2026-08', bookings: 168, revenue: 770200 },
  ],
  byType: [
    { type: 'HOTEL', count: 612, revenue: 2410000 },
    { type: 'CRUISE', count: 188, revenue: 1120000 },
    { type: 'TRANSPORT', count: 274, revenue: 480000 },
    { type: 'ACTIVITY', count: 142, revenue: 390550 },
    { type: 'VISA', count: 68, revenue: 420000 },
  ],
};
