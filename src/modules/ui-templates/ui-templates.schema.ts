import { z } from 'zod';

// ─── Whitelists — anything outside these is rejected ──────────────────────────

export const ALLOWED_TARGETS = [
  'company_dashboard',
  'hotel_request',
  'activity_request',
  'transport_booking',
  'security_approval',
  'airport_assist',
  'sim_card',
  'offer_popup',
] as const;

export const ALLOWED_BLOCK_TYPES = [
  'stat_card',
  'action_card',
  'promo_card',
  'info_panel',
  'form_section',
  'table_summary',
  'price_summary',
  'upload_field',
] as const;

export const ALLOWED_ICONS = [
  'wallet', 'hotel', 'map-pin', 'bus', 'plane', 'plane-landing', 'plane-takeoff',
  'shield-check', 'credit-card', 'users', 'baby', 'calendar', 'calendar-check',
  'clock', 'file', 'file-text', 'phone', 'brand-whatsapp', 'ticket', 'star', 'tag',
  'briefcase-business', 'circle-x', 'receipt', 'arrow-right', 'info', 'percent',
] as const;

export const ALLOWED_DATA_SOURCES = [
  'wallet.balance',
  'wallet.deducted',
  'wallet.remainingBalance',
  'wallet.totalDeposited',
  'company.tier',
  'company.name',
  'bookings.pendingCount',
  'bookings.totalCount',
  'quotes.pendingCount',
  'offers.activeCount',
] as const;

export const ALLOWED_FIELD_TYPES = [
  'text', 'textarea', 'number', 'date', 'time', 'datetime',
  'select', 'searchable-select', 'checkbox', 'toggle',
  'file-upload', 'image-upload', 'repeater', 'hidden',
  'readonly-price', 'nationality-select', 'pax-counter', 'room-counter', 'meal-plan-select',
] as const;

// ─── Field schema ─────────────────────────────────────────────────────────────

const baseField = z.object({
  key: z.string().min(1).max(64).regex(/^[a-zA-Z0-9_]+$/, 'key must be alphanumeric/underscore'),
  type: z.enum(ALLOWED_FIELD_TYPES),
  label: z.string().max(120).optional(),
  labelAr: z.string().max(120).optional(),
  icon: z.enum(ALLOWED_ICONS).optional(),
  required: z.boolean().optional(),
  placeholder: z.string().max(160).optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  step: z.number().optional(),
  defaultValue: z.union([z.string(), z.number(), z.boolean()]).optional(),
  order: z.number().int().optional(),
  // select options
  options: z.array(z.object({
    value: z.string().max(120),
    label: z.string().max(120),
    labelAr: z.string().max(120).optional(),
  })).max(200).optional(),
  // conditional rendering
  dependsOn: z.string().max(64).optional(),
  showWhen: z.object({
    field: z.string().max(64),
    op: z.enum(['gt', 'gte', 'lt', 'lte', 'eq', 'ne', 'truthy']),
    value: z.union([z.string(), z.number(), z.boolean()]).optional(),
  }).optional(),
  // repeater
  repeatCountFrom: z.string().max(64).optional(),
  itemLabel: z.string().max(120).optional(),
  itemType: z.enum(ALLOWED_FIELD_TYPES).optional(),
});

// ─── Block schema ─────────────────────────────────────────────────────────────

const blockSchema = z.object({
  type: z.enum(ALLOWED_BLOCK_TYPES),
  key: z.string().min(1).max(64).regex(/^[a-zA-Z0-9_]+$/),
  title: z.string().max(160).optional(),
  titleAr: z.string().max(160).optional(),
  subtitle: z.string().max(240).optional(),
  subtitleAr: z.string().max(240).optional(),
  icon: z.enum(ALLOWED_ICONS).optional(),
  dataSource: z.enum(ALLOWED_DATA_SOURCES).optional(),
  visible: z.boolean().optional(),
  order: z.number().int().optional(),
  // optional CTA for promo/action cards
  ctaLabel: z.string().max(80).optional(),
  ctaLabelAr: z.string().max(80).optional(),
  ctaTarget: z.string().max(64).optional(),
  imageUrl: z.string().url().max(500).optional().or(z.literal('')),
  fields: z.array(baseField).max(60).optional(),
});

// ─── Top-level config schema ──────────────────────────────────────────────────

export const templateConfigSchema = z.object({
  layout: z.enum(['compact_b2b', 'spacious', 'grid']).optional(),
  theme: z.object({
    glass: z.boolean().optional(),
    accent: z.enum(['navy_gold', 'navy_blue', 'slate']).optional(),
    density: z.enum(['compact', 'comfortable']).optional(),
  }).optional(),
  // offer_popup specific
  display: z.enum(['modal', 'banner', 'card']).optional(),
  blocks: z.array(blockSchema).max(40),
});

export const createTemplateSchema = z.object({
  key: z.string().min(1).max(64).regex(/^[a-z0-9_-]+$/i, 'key must be alphanumeric/underscore/hyphen'),
  name: z.string().min(1).max(120),
  target: z.enum(ALLOWED_TARGETS),
  serviceType: z.string().max(64).nullable().optional(),
  langMode: z.enum(['en', 'ar', 'both']).optional(),
  isActive: z.boolean().optional(),
  config: templateConfigSchema,
});

export const updateTemplateSchema = createTemplateSchema.partial();

export type TemplateConfig = z.infer<typeof templateConfigSchema>;
