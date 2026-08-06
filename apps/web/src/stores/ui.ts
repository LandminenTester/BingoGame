import { defineStore } from 'pinia';
import { resolveLocale, type Locale } from '../i18n';

export const useUiStore = defineStore('ui', {
  state: () => ({
    locale: resolveLocale(localStorage.getItem('bingo-locale')) as Locale,
    theme: ((localStorage.getItem('bingo-theme') as 'dark' | 'light') || 'dark') as 'dark' | 'light',
  }),
  actions: {
    setLocale(locale: Locale) {
      this.locale = locale;
      localStorage.setItem('bingo-locale', locale);
    },
    setTheme(theme: 'dark' | 'light') {
      this.theme = theme;
      localStorage.setItem('bingo-theme', theme);
      document.documentElement.dataset.theme = theme;
    },
    toggleTheme() {
      this.setTheme(this.theme === 'dark' ? 'light' : 'dark');
    },
    applyTheme() {
      document.documentElement.dataset.theme = this.theme;
    },
  },
});
