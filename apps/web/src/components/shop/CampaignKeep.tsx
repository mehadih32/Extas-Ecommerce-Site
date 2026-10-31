'use client';
// S06 · PR 556 — keeps the campaign of this visit (utm_* of the landing address) in this tab, while the owner's in-transit
// duplicate notice is on (lib/shop/campaign). Draws nothing.
import { useEffect } from 'react';
import { keepCampaign } from '@/lib/shop/campaign';

export function CampaignKeep() {
  useEffect(() => {
    keepCampaign(window.location.search);
  }, []);
  return null;
}
