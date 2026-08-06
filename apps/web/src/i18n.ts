import de from './locales/de';

type LocaleModule = { default: { meta: { nativeName: string }; messages: Record<string, string> } };

const modules = import.meta.glob<LocaleModule>('./locales/*.ts', { eager: true });

export const fallbackLocale = 'de';
export const locales = Object.entries(modules)
  .map(([path, module]) => ({ code: path.match(/\/([^/]+)\.ts$/)?.[1] ?? '', ...module.default }))
  .filter((locale) => locale.code);

export const messages = Object.fromEntries(locales.map((locale) => [locale.code, locale.messages]));
export type Locale = string;
export type TranslationKey = keyof typeof de.messages;

export function resolveLocale(value: string | null): Locale {
  return locales.some((locale) => locale.code === value) ? value! : fallbackLocale;
}

export function translate(locale: Locale, key: TranslationKey): string {
  return messages[locale]?.[key] ?? messages[fallbackLocale][key] ?? key;
}
