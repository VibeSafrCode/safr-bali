import type {Plugin} from 'vite';
type Source = {schemaVersion?: unknown; entries: Record<string, {ru?: string; en?: string}>};
export const canonicalPublicI18n: string;
export function yogaCatalogTranslations(source: Source): {schemaVersion: unknown; locales: string[]; entries: Record<string, {ru: string; en: string}>};
export function yogaCatalogI18nPlugin(): Plugin;
