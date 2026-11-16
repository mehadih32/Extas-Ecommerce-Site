// S28 · PR 1031 — what every wizard step is handed: the draft as read, the lists to pick from, the live values the phone shows, and
// the few things a step may do (say it saved, show a refusal, reload, move on).
import type { ProductPhoto } from '@extas/media';
import type { ImageSource } from '@extas/media';
import type { Dict } from '@/lib/i18n';
import type { WizardData, WizardLists } from '@/lib/admin-wizard';
import type { Lang, Money } from '../model';
import type { PhotoNotes } from '../PhotoManager';
import type { Answer } from '../../api';

export interface Live {
  name: string;
  brandId: string | null;
  priceMinor: number | null;
  compareAtMinor: number | null;
  keyPoints: string;
  modelHeight: string;
  modelWeightKg: string;
  modelWears: string;
  colourNames: Record<string, string>;
  hiddenColourIds: string[];
  hiddenSizeIds: string[];
  /** Photos per colour id, as the step 4 manager changes them (the server's count until then). */
  photos: Record<string, number>;
  front: Record<string, boolean>;
  description: string;
  slug: string;
  title: string;
  metaDescription: string;
  keyword: string;
  confirmed: boolean;
  setKind: 'SINGLE' | 'SET';
  bottomId: string | null;
  categoryId: string | null;
  forWho: string | null;
}

export interface PhotoProps {
  gallery: ProductPhoto[];
  images: Record<string, ImageSource>;
  notes: PhotoNotes;
  video: { on: boolean; allowUpload: boolean; maxUploadMb: number; current: { source: string; provider: string; url: string | null; durationSec: number | null; titleEn: string | null } | null };
}

export interface Can {
  write: boolean;
  prices: boolean;
  publish: boolean;
  upload: boolean;
}

export interface Ctx {
  d: Dict;
  lang: Lang;
  money: Money;
  data: WizardData;
  lists: WizardLists;
  can: Can;
  requirePin: boolean;
  /** The shop's own brand (the brand left out of the name). */
  ownBrandId: string | null;
  live: Live;
  setLive: (p: Partial<Live>) => void;
  /** The step says it saved (the "Saved just now" line). */
  saved: () => void;
  /** Shows a refusal as a toast. */
  refuse: (a: Answer) => void;
  refresh: () => void;
  go: (step: number) => void;
  photos: PhotoProps;
  /** The pattern that says a text names the place (the Google check). */
  place: RegExp;
  /** Sample products in this product's category that the shop shows now (step 8's question). */
  demoCount: number;
  settingsHref: string;
}

/** What "Next" does before it moves on: true goes on, false stays on the step. */
export type Guard = () => Promise<boolean>;
