// S28 · PR 1031 — what the wizard sends to the server: each step saves by itself through the same routes as the product screen.
import type { WizardSpecPatch } from '@extas/catalogue';
import { call, type Answer } from '../../api';

const base = (id: string) => `/api/admin/catalogue/products/${id}`;

export const patchProduct = (id: string, body: Record<string, unknown>): Promise<Answer> => call('PATCH', base(id), body);
export const patchNaming = (id: string, body: Record<string, unknown>): Promise<Answer> => call('PATCH', `${base(id)}/naming`, body);
export const postSpec = (id: string, body: WizardSpecPatch): Promise<Answer> => call('POST', `${base(id)}/spec`, body);
export const putTags = (id: string, tagIds: string[]): Promise<Answer> => call('PUT', `${base(id)}/tags`, { tagIds });
export const rememberStep = (id: string, step: number): Promise<Answer> => call('POST', `/api/admin/products/${id}/wizard`, { step });
export const postPrice = (id: string, body: { priceMinor: number; compareAtMinor: number | null; pin?: string }): Promise<Answer> => call('POST', `${base(id)}/spec`, { action: 'price', ...body });
export const addFaq = (productId: string, questionEn: string, answerEn: string): Promise<Answer> => call('POST', '/api/admin/faqs', { scope: 'PRODUCT', productId, questionEn, answerEn });
export const removeFaq = (id: string): Promise<Answer> => call('DELETE', `/api/admin/faqs/${id}`);
export const postColourName = (id: string, colourId: string, name: string): Promise<Answer> => call('POST', `${base(id)}/spec`, { action: 'colourName', colourId, name });
export const publishWizard = (id: string, mode: 'now' | 'schedule', at?: string): Promise<Answer> => call('POST', `${base(id)}/spec`, { action: 'publish', mode, ...(at ? { at } : {}) });
export const unschedule = (id: string): Promise<Answer> => call('POST', `${base(id)}/spec`, { action: 'unschedule' });
