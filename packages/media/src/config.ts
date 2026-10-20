// The media settings of one store, read once per job or request through the settings resolver (PR 492). Nothing
// here has a value of its own: every number comes from the registry (packages/settings/src/registry-media.ts).
import type { Registry, SettingsResolver, Value } from '@extas/settings';

export type Settings = Pick<SettingsResolver<Registry>, 'value'>;

export type ImageFormat = Value<'media.image.formats'>[number];
export type Preset = Value<'media.image.presets'>[number];
export type Ratio = Value<'media.image.aspectRatio'>;
export type Slots = Value<'media.image.slots'>;
export type PhotoRole = Value<'media.photos.requiredRoles'>[number];
export type WatermarkPosition = Value<'media.watermark.position'>;

/** What the rendition job needs. */
export interface RenderConfig {
  presets: Preset[];
  ratio: Ratio;
  formats: ImageFormat[];
  quality: number;
  avifEffort: number;
  fit: Value<'media.image.fit'>;
  background: string;
}

export interface UploadRules {
  maxBytes: number;
  minWidth: number;
  acceptedTypes: string[];
  processing: Value<'media.processing.mode'>;
}

export interface DeliveryConfig {
  presets: Preset[];
  ratio: Ratio;
  formats: ImageFormat[];
  slots: Slots;
  phoneMaxWidth: number;
  publicBaseUrl: string | null;
}

export interface PhotoRules {
  minimum: number;
  requiredRoles: PhotoRole[];
  frontPerColour: boolean;
}

export interface WatermarkConfig {
  enabled: boolean;
  text: string | null;
  position: WatermarkPosition;
  opacity: number;
  scale: number;
  preset: string;
  quality: number;
}

const at = (storeId: number) => ({ storeId });

export async function renderConfig(settings: Settings, storeId: number): Promise<RenderConfig> {
  const o = at(storeId);
  const [presets, ratio, formats, quality, avifEffort, fit, background] = await Promise.all([
    settings.value('media.image.presets', o),
    settings.value('media.image.aspectRatio', o),
    settings.value('media.image.formats', o),
    settings.value('media.image.quality', o),
    settings.value('media.image.avifEffort', o),
    settings.value('media.image.fit', o),
    settings.value('media.image.background', o),
  ]);
  return { presets, ratio, formats, quality, avifEffort, fit, background };
}

export async function uploadRules(settings: Settings, storeId: number): Promise<UploadRules> {
  const o = at(storeId);
  const [maxBytes, minWidth, acceptedTypes, processing] = await Promise.all([
    settings.value('media.upload.maxBytes', o),
    settings.value('media.upload.minWidth', o),
    settings.value('media.upload.acceptedTypes', o),
    settings.value('media.processing.mode', o),
  ]);
  return { maxBytes, minWidth, acceptedTypes, processing };
}

export async function deliveryConfig(settings: Settings, storeId: number): Promise<DeliveryConfig> {
  const o = at(storeId);
  const [presets, ratio, formats, slots, phoneMaxWidth, publicBaseUrl] = await Promise.all([
    settings.value('media.image.presets', o),
    settings.value('media.image.aspectRatio', o),
    settings.value('media.image.formats', o),
    settings.value('media.image.slots', o),
    settings.value('media.image.phoneMaxWidth', o),
    settings.value('media.publicBaseUrl', o),
  ]);
  return { presets, ratio, formats, slots, phoneMaxWidth, publicBaseUrl };
}

export async function photoRules(settings: Settings, storeId: number): Promise<PhotoRules> {
  const o = at(storeId);
  const [minimum, requiredRoles, frontPerColour] = await Promise.all([
    settings.value('media.photos.minimum', o),
    settings.value('media.photos.requiredRoles', o),
    settings.value('media.photos.frontPerColour', o),
  ]);
  return { minimum, requiredRoles, frontPerColour };
}

export async function watermarkConfig(settings: Settings, storeId: number): Promise<WatermarkConfig> {
  const o = at(storeId);
  const [enabled, text, storeName, position, opacity, scale, preset, quality] = await Promise.all([
    settings.value('media.watermark.enabled', o),
    settings.value('media.watermark.text', o),
    settings.value('store.name', o),
    settings.value('media.watermark.position', o),
    settings.value('media.watermark.opacity', o),
    settings.value('media.watermark.scale', o),
    settings.value('media.watermark.preset', o),
    settings.value('media.image.quality', o),
  ]);
  return { enabled, text: text ?? storeName ?? null, position, opacity, scale, preset, quality };
}

/** The height of a rendition `width` px wide at the ratio (rounded to whole pixels). */
export function heightFor(width: number, ratio: Ratio): number {
  return Math.round((width * ratio.height) / ratio.width);
}
