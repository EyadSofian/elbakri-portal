const fs = require("node:fs");
const path = require("node:path");

const ACTOR_ID = "brilliant_gum~booking-pro-full-data-scraper";
const API_BASE = `https://api.apify.com/v2/acts/${ACTOR_ID}/run-sync-get-dataset-items`;
const DEFAULT_INPUT = "C:\\Users\\asus\\Downloads\\Elbakri_Hotels_VERIFIED_ALL_COMPLETE - Verified_Hotels.csv";
const DEFAULT_OUT_DIR = path.join(process.cwd(), "outputs", "apify-booking-enrichment");

const CITY_MAP = {
  "الغردقة": "Hurghada",
  "سهل حشيش": "Sahl Hasheesh",
  "شرم الشيخ": "Sharm El Sheikh",
  "شرم": "Sharm El Sheikh",
  "مرسى علم": "Marsa Alam",
  "دهب": "Dahab",
  "القاهرة": "Cairo",
  "القاهرة الكبرى": "Cairo",
  "الإسكندرية": "Alexandria",
  "العين السخنة": "Ain Sokhna",
  "مكادي": "Makadi Bay",
  "سفاجا": "Safaga",
  "الجونة": "El Gouna",
  "نويبع": "Nuweiba",
  "الأقصر": "Luxor",
  "أسوان": "Aswan",
  "الساحل الشمالي": "North Coast",
};

const CITY_ALIASES = {
  sharm: ["شرم", "sharm"],
  hurghada: ["الغردقة", "hurghada"],
  "marsa-alam": ["مرسى علم", "marsa alam"],
  dahab: ["دهب", "dahab"],
  cairo: ["القاهرة", "القاهرة الكبرى", "cairo"],
  all: ["all"],
};

function parseArgs(argv) {
  const args = {
    input: DEFAULT_INPUT,
    outDir: DEFAULT_OUT_DIR,
    city: "hurghada",
    limit: Number(process.env.LIMIT || 999),
    dryRun: false,
    start: 0,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--input") {
      args.input = next;
      i += 1;
    } else if (arg === "--out") {
      args.outDir = next;
      i += 1;
    } else if (arg === "--city") {
      args.city = next;
      i += 1;
    } else if (arg === "--limit") {
      args.limit = Number(next);
      i += 1;
    } else if (arg === "--start") {
      args.start = Number(next);
      i += 1;
    } else if (arg === "--dry-run") {
      args.dryRun = true;
    }
  }
  return args;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];
    if (quoted && ch === '"' && next === '"') {
      value += '"';
      i += 1;
    } else if (ch === '"') {
      quoted = !quoted;
    } else if (!quoted && ch === ",") {
      row.push(value);
      value = "";
    } else if (!quoted && (ch === "\n" || ch === "\r")) {
      if (ch === "\r" && next === "\n") i += 1;
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
    } else {
      value += ch;
    }
  }
  if (value || row.length) {
    row.push(value);
    rows.push(row);
  }

  const headers = rows.shift().map((header, index) => header.trim().replace(/^\uFEFF/, "") || `H${index + 1}`);
  return rows
    .filter((cells) => cells.some((cell) => String(cell || "").trim()))
    .map((cells) => Object.fromEntries(headers.map((header, index) => [header, cells[index] || ""])));
}

function csvEscape(value) {
  const str = value == null ? "" : String(value);
  if (/[",\n\r]/.test(str)) return `"${str.replaceAll('"', '""')}"`;
  return str;
}

function writeCsv(filePath, rows) {
  const headers = [
    "source_hotel_name",
    "source_city",
    "query",
    "name",
    "location",
    "url",
    "rating",
    "stars",
    "type",
    "description",
    "amenities",
    "mainPhoto",
    "photos",
    "room_types",
    "policies",
    "match_confidence",
    "needs_manual_review",
    "review_reason",
  ];
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((header) => csvEscape(row[header])).join(","));
  }
  fs.writeFileSync(filePath, `\uFEFF${lines.join("\n")}`, "utf8");
}

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\+/g, " plus ")
    .replace(/\b(hotel|resort|spa|beach|the|and)\b/g, " ")
    .replace(/[^a-z0-9\u0600-\u06ff]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function similarity(a, b) {
  const aa = normalize(a);
  const bb = normalize(b);
  if (!aa || !bb) return 0;
  const aParts = new Set(aa.split(" "));
  const bParts = new Set(bb.split(" "));
  let overlap = 0;
  for (const part of aParts) {
    if (bParts.has(part)) overlap += 1;
  }
  return overlap / Math.max(aParts.size, bParts.size);
}

function cityToEnglish(city) {
  const trimmed = String(city || "").trim();
  return CITY_MAP[trimmed] || trimmed;
}

function matchesCity(row, cityArg) {
  const rawCity = String(row.city || "").toLowerCase();
  const enCity = cityToEnglish(row.city).toLowerCase();
  const wanted = String(cityArg || "").toLowerCase();
  if (wanted === "all") return true;
  const aliases = CITY_ALIASES[wanted] || [wanted];
  return aliases.some((alias) => {
    const a = alias.toLowerCase();
    return rawCity.includes(a) || enCity.includes(a);
  });
}

function slug(value) {
  return normalize(value).replace(/\s+/g, "-").slice(0, 80) || "hotel";
}

function collectIndexed(item, prefix) {
  return Object.keys(item)
    .filter((key) => key.startsWith(`${prefix}/`))
    .sort((a, b) => Number(a.split("/")[1]) - Number(b.split("/")[1]))
    .map((key) => item[key])
    .filter(Boolean);
}

function collectAmenities(item) {
  const values = [];
  if (Array.isArray(item.amenities)) values.push(...item.amenities);
  if (Array.isArray(item.facilities)) values.push(...item.facilities);
  values.push(...collectIndexed(item, "amenities"));
  values.push(...collectIndexed(item, "facilities"));
  return [...new Set(values.map((v) => String(v).trim()).filter(Boolean))].join(" | ");
}

function collectPhotos(item) {
  const values = [];
  if (item.mainPhoto) values.push(item.mainPhoto);
  if (Array.isArray(item.photos)) values.push(...item.photos);
  if (Array.isArray(item.images)) values.push(...item.images);
  values.push(...collectIndexed(item, "photos"));
  values.push(...collectIndexed(item, "images"));
  return [...new Set(values.map((v) => String(v).trim()).filter(Boolean))].slice(0, 30).join(" | ");
}

function collectRooms(item) {
  const rooms = Array.isArray(item.rooms) ? item.rooms : [];
  return rooms
    .map((room) => {
      if (typeof room === "string") return room;
      return room.roomType || room.name || room.title || "";
    })
    .filter(Boolean)
    .join(" | ");
}

function collectPolicies(item) {
  const parts = [];
  if (item.cancellation) parts.push(`Cancellation: ${item.cancellation}`);
  if (item.finePrint) parts.push(`Fine print: ${item.finePrint}`);
  if (item.policies) parts.push(`Policies: ${JSON.stringify(item.policies)}`);
  if (item.houseRules) parts.push(`House rules: ${JSON.stringify(item.houseRules)}`);
  for (const key of Object.keys(item).filter((k) => k.startsWith("houseRules/"))) {
    parts.push(`${key}: ${item[key]}`);
  }
  return parts.join(" | ");
}

function flatten(source, query, item, error) {
  if (!item) {
    return {
      source_hotel_name: source.hotel_name,
      source_city: cityToEnglish(source.city),
      query,
      name: "",
      location: "",
      url: "",
      rating: "",
      stars: "",
      type: "",
      description: "",
      amenities: "",
      mainPhoto: "",
      photos: "",
      room_types: "",
      policies: "",
      match_confidence: "0.00",
      needs_manual_review: "TRUE",
      review_reason: error || "no_result",
    };
  }

  const confidence = similarity(source.hotel_name, item.name);
  const reviewReasons = [];
  if (confidence < 0.45) reviewReasons.push("low_name_match");
  if (!item.url) reviewReasons.push("missing_booking_url");
  if (!item.mainPhoto && !collectPhotos(item)) reviewReasons.push("missing_photos");
  if (!collectAmenities(item)) reviewReasons.push("missing_amenities");

  return {
    source_hotel_name: source.hotel_name,
    source_city: cityToEnglish(source.city),
    query,
    name: item.name || "",
    location: item.location || item.address || "",
    url: item.url || item.bookingUrl || item.source_url || "",
    rating: item.rating || "",
    stars: item.stars || "",
    type: item.type || "",
    description: item.description || "",
    amenities: collectAmenities(item),
    mainPhoto: item.mainPhoto || item.image || item.photoUrl || "",
    photos: collectPhotos(item),
    room_types: collectRooms(item),
    policies: collectPolicies(item),
    match_confidence: confidence.toFixed(2),
    needs_manual_review: reviewReasons.length ? "TRUE" : "FALSE",
    review_reason: reviewReasons.join(" | "),
  };
}

async function runActor(input, token) {
  const response = await fetch(`${API_BASE}?token=${encodeURIComponent(token)}&timeout=300`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Apify HTTP ${response.status}: ${text.slice(0, 800)}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Could not parse Apify JSON response: ${text.slice(0, 500)}`);
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const token = process.env.APIFY_TOKEN;
  const citySlug = slug(args.city || "hotels");
  const outputCsv = path.join(args.outDir, `${citySlug}_booking_enriched_hotels.csv`);

  if (!args.dryRun && !token) {
    throw new Error("APIFY_TOKEN is missing. Set it in PowerShell before running the script.");
  }

  const sourceText = fs.readFileSync(args.input, "utf8").replace(/^\uFEFF/, "");
  const allRows = parseCsv(sourceText);
  const hotels = allRows
    .filter((row) => row.hotel_name && matchesCity(row, args.city))
    .slice(args.start, args.start + args.limit);

  console.log(`Source rows: ${allRows.length}`);
  console.log(`Selected hotels: ${hotels.length}`);
  hotels.forEach((hotel, index) => {
    console.log(`${index + 1}. ${hotel.hotel_name} - ${cityToEnglish(hotel.city)}`);
  });

  fs.mkdirSync(args.outDir, { recursive: true });

  if (args.dryRun) {
    console.log("Dry run only. No Apify calls were made.");
    console.log(`Output would be: ${outputCsv}`);
    return;
  }

  const enriched = [];
  for (let i = 0; i < hotels.length; i += 1) {
    const hotel = hotels[i];
    const city = cityToEnglish(hotel.city);
    const query = `${hotel.hotel_name} ${city} Egypt`;
    const input = {
      destination: query,
      checkIn: "2026-07-01",
      checkOut: "2026-07-04",
      adults: 2,
      children: 0,
      rooms: 1,
      currency: "USD",
      maxResults: 1,
      scrapingMode: "detailed",
      includeAmenities: true,
      includeCoordinates: true,
      includeDescription: true,
      includeHouseRules: true,
      includePhotos: true,
      includeRoomDetails: true,
      includeReviews: false,
      maxReviewsPerHotel: 1,
      minRating: 0,
      minStars: 0,
      photoMode: "all",
      propertyType: "all",
    };

    console.log(`\n[${i + 1}/${hotels.length}] ${query}`);
    const rawFile = path.join(args.outDir, `${citySlug}-${String(args.start + i + 1).padStart(3, "0")}-${slug(hotel.hotel_name)}.json`);
    try {
      const items = await runActor(input, token);
      fs.writeFileSync(rawFile, JSON.stringify({ input, items }, null, 2), "utf8");
      const first = Array.isArray(items) ? items[0] : items;
      enriched.push(flatten(hotel, query, first));
      console.log(`OK: ${first?.name || "no name"} (${first?.rating || "no rating"})`);
    } catch (error) {
      fs.writeFileSync(rawFile, JSON.stringify({ input, error: error.message }, null, 2), "utf8");
      enriched.push(flatten(hotel, query, null, error.message));
      console.log(`ERROR: ${error.message}`);
    }

    writeCsv(outputCsv, enriched);
  }

  console.log(`\nDone. Output: ${outputCsv}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
