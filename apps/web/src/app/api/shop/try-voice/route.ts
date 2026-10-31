// CN-020 (4) · SIM-F-047 — test servers only (EXTAS_SHOP_TEST_PAGES=1): the sample bag, and this browser's checkout
// draws the address box's mic (lib/shop/try-voice.ts).
import { tryVoiceHandler } from '@/lib/shop/try-voice';

export const dynamic = 'force-dynamic';

export function POST(request: Request) {
  return tryVoiceHandler(request);
}
