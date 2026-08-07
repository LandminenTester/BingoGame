<script setup lang="ts">
import { RouterLink } from 'vue-router';
import { useUiStore } from '../stores/ui';
import { translate, type TranslationKey } from '../i18n';

const ui = useUiStore();
const t = (key: TranslationKey) => translate(ui.locale, key);
const isGerman = ui.locale === 'de';
</script>

<template>
  <main class="legal-view">
    <p class="eyebrow">{{ t('imprint') }}</p>
    <h1>{{ t('imprint') }}</h1>
    <div class="notice">{{ t('imprintNotice') }}</div>

    <template v-if="isGerman">
      <h2>Angaben gemäß § 5 TMG</h2>
      <p>
        Johannes Markwordt<br />
        c/o Block Services<br />
        Stuttgarter Str. 106<br />
        70736 Fellbach
      </p>
      <h2>Kontakt</h2>
      <p>E-Mail: vinewoodlegacy@gmail.com</p>
      <h2>Verantwortlich für den Inhalt nach § 55 Abs. 2 RStV</h2>
      <p>Johannes Markwordt</p>
      <h2>Streitschlichtung</h2>
      <p>
        Die Europäische Kommission stellt eine Plattform zur Online-Streitbeilegung (OS) bereit.
        Wir sind nicht verpflichtet und nicht bereit, an einem Streitbeilegungsverfahren vor einer
        Verbraucherschlichtungsstelle teilzunehmen.
      </p>
    </template>
    <template v-else>
      <h2>Information according to § 5 TMG</h2>
      <p>
        Johannes Markwordt<br />
        c/o Block Services<br />
        Stuttgarter Str. 106<br />
        70736 Fellbach
      </p>
      <h2>Contact</h2>
      <p>E-Mail: vinewoodlegacy@gmail.com</p>
      <h2>Responsible for content according to § 55 Abs. 2 RStV</h2>
      <p>TODO: Name and address of the responsible person</p>
      <h2>Dispute resolution</h2>
      <p>
        The European Commission provides a platform for online dispute resolution (ODR). We are
        neither obliged nor willing to participate in dispute resolution proceedings before a
        consumer arbitration board.
      </p>
    </template>

    <RouterLink :to="{ name: 'landing' }" class="button secondary legal-back">{{
      isGerman ? 'Zurück' : 'Back'
      }}</RouterLink>
  </main>
</template>
