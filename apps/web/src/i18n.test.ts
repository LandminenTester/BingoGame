import { describe, expect, it } from 'vitest';
import { fallbackLocale, locales, resolveLocale, translate } from './i18n';

describe('interface locales', () => {
  it('uses German as the fallback for unknown locales', () => {
    expect(fallbackLocale).toBe('de');
    expect(resolveLocale('missing')).toBe('de');
    expect(translate('missing', 'dashboard')).toBe('Regieraum');
  });

  it('discovers locale files with their native labels', () => {
    expect(locales.find((locale) => locale.code === 'de')?.meta.nativeName).toBe('Deutsch');
  });
});
