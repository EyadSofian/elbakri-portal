/**
 * Every field the admin forms send, checked against the Zod schema guarding
 * the route they post to.
 *
 * `validate()` does `req.body = schema.parse(req.body)`, and `z.object()` drops
 * keys it does not declare. So a form field the schema never declares is
 * silently discarded: the request succeeds, the form says "saved", and the
 * value is simply not there. Nothing errors, nothing logs.
 *
 * That shipped twice. This reads the form definitions out of admin.html and the
 * field lists out of the real compiled Zod shapes — not by grepping either —
 * and reports fields that would be thrown away.
 */
require('ts-node/register/transpile-only');
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test:test@127.0.0.1:1/disabled';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const admin = fs.readFileSync(path.join(ROOT, 'public/admin.html'), 'utf8');

/** The keys a Zod object actually declares. */
function shapeKeys(schema) {
  const def = schema?._def;
  const shape = typeof def?.shape === 'function' ? def.shape() : def?.shape;
  return shape ? Object.keys(shape) : null;
}

/** Field names one masterConfigs entity's form posts. */
function masterConfigFields(entity) {
  const block = new RegExp(`\\n  ${entity}:\\s*\\{([\\s\\S]*?)\\n  \\},\\n`).exec(admin);
  if (!block) return null;
  return [...block[1].matchAll(/\{\s*name:\s*"([^"]+)"/g)].map((m) => m[1]);
}

/** Keys an object literal assigned to `const payload = {` posts. */
function payloadKeys(fnName) {
  const fn = new RegExp(`function ${fnName}\\b[\\s\\S]*?const payload = \\{([\\s\\S]*?)\\n  \\};`).exec(admin);
  if (!fn) return null;
  return [...fn[1].matchAll(/(?:^|\n)\s*(?:\.\.\.\w+,\s*)?([A-Za-z_$][\w$]*)\s*:/g)].map((m) => m[1]);
}

const { createActivitySchema, updateActivitySchema } = require('../src/modules/activities/activities.schema');
const { createHotelSchema, updateHotelSchema } = require('../src/modules/hotels/hotels.schema');
const { transportRateSchema, visaFeeSchema, receptionRateSchema } = require('../src/modules/master-data/master-data.schema');
const { createCompanySchema, updateCompanySchema } = require('../src/modules/companies/companies.schema');
const { createCruiseSchema, updateCruiseSchema } = require('../src/modules/nile-cruise/cruise.schema');

const CHECKS = [
  { label: 'activities form → createActivitySchema', fields: masterConfigFields('activities'), schema: createActivitySchema },
  { label: 'activities form → updateActivitySchema', fields: masterConfigFields('activities'), schema: updateActivitySchema },
  { label: 'cruise form → createCruiseSchema', fields: masterConfigFields('cruises'), schema: createCruiseSchema },
  { label: 'cruise form → updateCruiseSchema', fields: masterConfigFields('cruises'), schema: updateCruiseSchema },
  { label: 'transport form → transportRateSchema', fields: masterConfigFields('transport'), schema: transportRateSchema },
  { label: 'visa fee form → visaFeeSchema', fields: masterConfigFields('visa'), schema: visaFeeSchema },
  { label: 'reception form → receptionRateSchema', fields: masterConfigFields('reception'), schema: receptionRateSchema },
  { label: 'hotel editor → createHotelSchema', fields: payloadKeys('heSave'), schema: createHotelSchema },
  { label: 'hotel editor → updateHotelSchema', fields: payloadKeys('heSave'), schema: updateHotelSchema },
  { label: 'company form → createCompanySchema', fields: payloadKeys('saveCompany'), schema: createCompanySchema },
  { label: 'company form → updateCompanySchema', fields: payloadKeys('saveCompany'), schema: updateCompanySchema },
];

let failed = false;
for (const { label, fields, schema } of CHECKS) {
  if (!fields) { console.log(`?  ${label}: could not read the form fields`); failed = true; continue; }
  if (!schema) { console.log(`–  ${label}: ${fields.length} fields, nothing to check`); continue; }
  const declared = shapeKeys(schema);
  if (!declared) { console.log(`?  ${label}: could not read the schema shape`); failed = true; continue; }
  const dropped = fields.filter((f) => !declared.includes(f));
  if (dropped.length) {
    failed = true;
    console.log(`✗  ${label}`);
    console.log(`     DROPPED SILENTLY: ${dropped.join(', ')}`);
  } else {
    console.log(`✓  ${label}  (${fields.length} fields, all declared)`);
  }
}
process.exit(failed ? 1 : 0);
