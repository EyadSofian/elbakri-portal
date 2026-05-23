import fs from "node:fs/promises";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const outputDir = "C:/Users/asus/Desktop/elbakri-portal/outputs/google-sheets-template";
const workbook = Workbook.create();

const brand = "#0F1B47";
const navy = "#1B2B6B";
const gold = "#C4920A";
const headerFill = "#0F1B47";
const subFill = "#EDF2F7";
const border = "#D8DEEA";

function colName(n) {
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - m) / 26);
  }
  return s;
}

function safeName(name) {
  return name.replace(/[^A-Za-z0-9]/g, "");
}

function writeSheet(name, headers, rows, options = {}) {
  const sheet = workbook.worksheets.add(name);
  sheet.showGridLines = false;

  const endCol = colName(headers.length);
  sheet.getRange(`A1:${endCol}1`).values = [headers];
  sheet.getRange(`A2:${endCol}${rows.length + 1}`).values = rows;

  const title = sheet.getRange(`A1:${endCol}1`);
  title.format = {
    fill: headerFill,
    font: { bold: true, color: "#FFFFFF" },
    wrapText: true,
    horizontalAlignment: "center",
    verticalAlignment: "center",
  };
  title.format.rowHeightPx = 34;

  const body = sheet.getRange(`A2:${endCol}${Math.max(rows.length + 1, 2)}`);
  body.format = {
    verticalAlignment: "top",
    wrapText: true,
  };

  const widths = options.widths || {};
  headers.forEach((header, index) => {
    const col = colName(index + 1);
    const width = widths[header] || (header.length > 18 ? 150 : 120);
    sheet.getRange(`${col}:${col}`).format.columnWidthPx = width;
  });

  sheet.freezePanes.freezeRows(1);

  return sheet;
}

const readme = workbook.worksheets.add("README");
readme.showGridLines = false;
readme.getRange("A1:H1").merge();
readme.getRange("A1").values = [["Elbakri Portal - Google Sheets Master Data"]];
readme.getRange("A1").format = {
  fill: brand,
  font: { bold: true, color: "#FFFFFF", size: 16 },
  horizontalAlignment: "center",
};
readme.getRange("A3:H12").values = [
  ["How to use", "", "", "", "", "", "", ""],
  ["1", "Upload this workbook to Google Sheets: File -> Import -> Upload -> Replace spreadsheet.", "", "", "", "", "", ""],
  ["2", "Share the Google Sheet with: elbakri-portal@elbakri-portal.iam.gserviceaccount.com", "", "", "", "", "", ""],
  ["3", "Copy the Google Sheet ID into Railway as GOOGLE_SHEETS_ID.", "", "", "", "", "", ""],
  ["4", "In Admin -> Sheets Config, click Test Connection, then Sync from Sheets.", "", "", "", "", "", ""],
  ["Important", "Keep sheetsRowId stable. The portal upserts by sheetsRowId.", "", "", "", "", "", ""],
  ["Required tab names", "Hotels, Hotel Pricing, Cruises, Activities, Transport Rates, Visa Fees, Reception Services", "", "", "", "", "", ""],
  ["Currency", "Use ISO codes such as USD, EGP, EUR, SAR, AED, GBP.", "", "", "", "", "", ""],
  ["Boolean values", "Use TRUE/FALSE or active/inactive.", "", "", "", "", "", ""],
  ["Lists", "Separate multi-value lists with semicolons, commas, or pipes.", "", "", "", "", "", ""],
];
readme.getRange("A3:H3").format = { fill: gold, font: { bold: true, color: brand } };
readme.getRange("A4:A12").format = { font: { bold: true, color: navy } };
readme.getRange("B4:B12").format = { wrapText: true };
readme.getRange("A:A").format.columnWidthPx = 130;
readme.getRange("B:B").format.columnWidthPx = 640;
readme.getRange("C:H").format.columnWidthPx = 40;

writeSheet("Hotels", [
  "sheetsRowId", "name", "nameAr", "city", "cityAr", "country", "stars", "address",
  "description", "descriptionAr", "amenities", "pricePerNight", "currency", "imageUrl", "isActive",
], [
  ["HOT-CAI-001", "Nile Ritz-Carlton Cairo", "نايل ريتز كارلتون القاهرة", "Cairo", "القاهرة", "EG", 5, "1113 Corniche El Nil, Cairo", "Luxury hotel on the banks of the Nile", "فندق فاخر على النيل", "Pool;Spa;Restaurant;Gym", 250, "USD", "https://images.unsplash.com/photo-1566073771259-6a8506099945", true],
  ["HOT-CAI-002", "Fairmont Nile City", "فيرمونت نايل سيتي", "Cairo", "القاهرة", "EG", 5, "2005B Corniche El Nil, Cairo", "Premium city hotel with Nile views", "فندق مميز بإطلالات النيل", "Pool;Spa;Business Center", 180, "USD", "https://images.unsplash.com/photo-1551882547-ff40c63fe5fa", true],
  ["HOT-SHR-001", "Kempinski Hotel Soma Bay", "كمبينسكي سوما باي", "Hurghada", "الغردقة", "EG", 5, "Soma Bay, Red Sea", "Luxury Red Sea resort", "منتجع فاخر على البحر الأحمر", "Private Beach;Diving;Pool", 150, "USD", "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4", true],
], {
  widths: { sheetsRowId: 130, name: 220, nameAr: 190, address: 250, description: 260, descriptionAr: 240, amenities: 190, imageUrl: 260 },
});

writeSheet("Hotel Pricing", [
  "sheetsRowId", "hotelSheetsRowId", "hotelId", "hotelName", "roomType", "season",
  "pricePerNight", "currency", "validFrom", "validTo", "isActive",
], [
  ["HPR-CAI-001-STD-REG", "HOT-CAI-001", "", "Nile Ritz-Carlton Cairo", "STANDARD", "REGULAR", 250, "USD", "2026-01-01", "2026-12-31", true],
  ["HPR-CAI-001-DLX-HIGH", "HOT-CAI-001", "", "Nile Ritz-Carlton Cairo", "DELUXE", "HIGH", 360, "USD", "2026-06-01", "2026-09-30", true],
  ["HPR-CAI-002-STE-PEAK", "HOT-CAI-002", "", "Fairmont Nile City", "SUITE", "PEAK", 420, "USD", "2026-12-20", "2027-01-10", true],
], {
  widths: { sheetsRowId: 170, hotelSheetsRowId: 150, hotelName: 220, roomType: 120, season: 110 },
});

writeSheet("Cruises", [
  "sheetsRowId", "name", "nameAr", "shipType", "operator", "cabins", "route",
  "departureDays", "duration", "description", "descriptionAr", "priceFrom", "currency", "imageUrl", "isActive",
], [
  ["CRZ-001", "MS Nile Premium", "نايل بريميوم", "CRUISE", "Elbakri Cruises", 60, "LUXOR_ASWAN", "Mon;Thu", 4, "Classic Nile cruise from Luxor to Aswan", "رحلة نيلية من الأقصر إلى أسوان", 520, "USD", "https://images.unsplash.com/photo-1544551763-46a013bb70d5", true],
  ["CRZ-002", "Dahabiya Royal", "ذهبية رويال", "DAHABIYA", "Royal Nile", 12, "ASWAN_LUXOR", "Sat", 5, "Boutique dahabiya experience", "تجربة ذهبية فاخرة", 980, "USD", "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee", true],
], {
  widths: { sheetsRowId: 120, name: 190, nameAr: 180, departureDays: 140, description: 260, descriptionAr: 240, imageUrl: 260 },
});

writeSheet("Activities", [
  "sheetsRowId", "name", "nameAr", "city", "category", "duration", "description", "descriptionAr",
  "includes", "excludes", "priceAdult", "priceChild", "currency", "minPax", "maxPax", "imageUrl", "isActive",
], [
  ["ACT-CAI-001", "Pyramids and Sphinx Half Day", "الأهرامات وأبو الهول نصف يوم", "CAIRO", "SIGHTSEEING", "4 hours", "Guided half-day tour of Giza", "جولة نصف يوم في الجيزة", "Guide;Transfers;Entry tickets", "Meals;Tips", 65, 35, "USD", 1, 20, "https://images.unsplash.com/photo-1503177119275-0aa32b3a9368", true],
  ["ACT-HRG-001", "Red Sea Snorkeling Trip", "رحلة سنوركلينج البحر الأحمر", "HURGHADA", "SNORKELING", "6 hours", "Boat trip with snorkeling stops", "رحلة بحرية مع سنوركلينج", "Boat;Lunch;Equipment", "Hotel extras", 55, 30, "USD", 2, 30, "https://images.unsplash.com/photo-1544551763-77ef2d0cfc6c", true],
], {
  widths: { sheetsRowId: 130, name: 220, nameAr: 220, description: 260, descriptionAr: 240, includes: 210, excludes: 160, imageUrl: 260 },
});

writeSheet("Transport Rates", [
  "sheetsRowId", "type", "vehicleType", "city", "fromLocation", "toLocation", "rate", "currency", "notes", "isActive",
], [
  ["TRN-CAI-APT-SEDAN", "AIRPORT_TRANSFER", "SEDAN", "Cairo", "Cairo Airport", "Downtown Cairo", 35, "USD", "One way airport transfer", true],
  ["TRN-CAI-GIZA-SUV", "PRIVATE_TRANSFER", "SUV", "Cairo", "Downtown Cairo", "Giza Pyramids", 55, "USD", "Private SUV transfer", true],
  ["TRN-LXR-ASW-VAN", "INTERCITY", "VAN_6", "Luxor", "Luxor", "Aswan", 180, "USD", "Intercity van transfer", true],
], {
  widths: { sheetsRowId: 170, type: 170, vehicleType: 130, fromLocation: 180, toLocation: 180, notes: 230 },
});

writeSheet("Visa Fees", [
  "sheetsRowId", "visaType", "destinationCountry", "processingType", "fee", "currency", "notes", "isActive",
], [
  ["VIS-EG-TOURIST-NORMAL", "TOURIST", "Egypt", "NORMAL", 45, "USD", "Standard tourist visa processing", true],
  ["VIS-UAE-BUSINESS-EXPRESS", "BUSINESS", "United Arab Emirates", "EXPRESS", 180, "USD", "Express business visa", true],
  ["VIS-SAU-UMRAH-NORMAL", "UMRAH", "Saudi Arabia", "NORMAL", 120, "USD", "Umrah visa service fee", true],
], {
  widths: { sheetsRowId: 190, destinationCountry: 190, processingType: 140, notes: 240 },
});

writeSheet("Reception Services", [
  "sheetsRowId", "serviceType", "airport", "rate", "currency", "notes", "isActive",
], [
  ["RCP-CAI-MEET", "MEET_AND_GREET", "CAI", 45, "USD", "Standard meet and greet at Cairo Airport", true],
  ["RCP-CAI-AHLAN", "AHLAN_SERVICE", "CAI", 95, "USD", "Ahlan arrival service", true],
  ["RCP-HRG-VIP", "VIP_LOUNGE", "HRG", 110, "USD", "VIP lounge access", true],
], {
  widths: { sheetsRowId: 160, serviceType: 180, notes: 260 },
});

for (const sheetName of ["Hotels", "Hotel Pricing", "Cruises", "Activities", "Transport Rates", "Visa Fees", "Reception Services"]) {
  const sheet = workbook.worksheets.getItem(sheetName);
  const used = sheet.getUsedRange();
  used.format.wrapText = true;
}

await fs.mkdir(outputDir, { recursive: true });
const overview = await workbook.inspect({
  kind: "sheet",
  include: "name",
  maxChars: 2000,
});
console.log(overview.ndjson);

const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 100 },
  maxChars: 2000,
});
console.log(errors.ndjson);

for (const sheetName of ["README", "Hotels", "Hotel Pricing", "Cruises", "Activities", "Transport Rates", "Visa Fees", "Reception Services"]) {
  const preview = await workbook.render({ sheetName, autoCrop: "all", scale: 1, format: "png" });
  await fs.writeFile(`${outputDir}/${safeName(sheetName)}.png`, new Uint8Array(await preview.arrayBuffer()));
}

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(`${outputDir}/Elbakri_Google_Sheets_Template.xlsx`);
console.log(`${outputDir}/Elbakri_Google_Sheets_Template.xlsx`);
