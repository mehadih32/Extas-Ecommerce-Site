// Labels of the permissions, their groups and the seeded owner role, as {en, bn} pairs (admin in simple English with
// a Bengali switch, D11). The sync copies them into Permission.labelEn/labelBn and Role.nameEn/nameBn.
import { pair, type SettingsMessages } from '@extas/settings';
import bn from '../messages/auth.bn.json';
import en from '../messages/auth.en.json';

export const authMessages: SettingsMessages = { en, bn };

export const authLabel = (key: string) => pair(authMessages, key);
