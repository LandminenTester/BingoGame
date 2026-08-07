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
    <p class="eyebrow">{{ t('privacyPolicy') }}</p>
    <h1>{{ t('privacyPolicy') }}</h1>
    <div class="notice">{{ t('imprintNotice') }}</div>

    <template v-if="isGerman">
      <h2>Verantwortlicher</h2>
      <p>
        TODO: Vollständiger Name / Firmenname, Anschrift und E-Mail-Adresse des Verantwortlichen
        im Sinne der DSGVO.
      </p>
      <h2>Twitch-Anmeldung (OAuth)</h2>
      <p>
        Zur Anmeldung als Streamer nutzen wir die OAuth-Schnittstelle von Twitch. Dabei werden
        deine Twitch-ID, dein Anzeigename, dein Login-Name sowie dein Profilbild verarbeitet und
        in unserer Datenbank gespeichert, um dein Konto zuzuordnen. Rechtsgrundlage ist Art. 6
        Abs. 1 lit. b DSGVO (Vertragserfüllung).
      </p>
      <h2>Cookies &amp; lokale Speicherung</h2>
      <p>
        Wir setzen ausschließlich technisch notwendige Cookies ein (Sitzungs-Cookie nach
        Anmeldung, Gast-Token beim Lobby-Beitritt). Zusätzlich speichert dein Browser
        Spracheinstellung, Theme und deine Cookie-Bestätigung im LocalStorage. Es findet kein
        Tracking und keine Auswertung durch Dritte statt.
      </p>
      <h2>Speicherdauer</h2>
      <p>
        Session-Daten werden bis zum Logout bzw. Ablauf der Sitzung gespeichert. Session- und
        Bingo-Verlaufsdaten kannst du jederzeit über die Kontolöschung bzw. den Verlauf entfernen.
      </p>
      <h2>Deine Rechte</h2>
      <p>
        Du hast das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung,
        Datenübertragbarkeit sowie Widerspruch. Wende dich hierzu an die im Impressum genannte
        Kontaktadresse.
      </p>
    </template>
    <template v-else>
      <h2>Data controller</h2>
      <p>
        TODO: Full name / company name, address, and email address of the data controller under
        the GDPR.
      </p>
      <h2>Twitch sign-in (OAuth)</h2>
      <p>
        To sign in as a streamer we use Twitch's OAuth interface. Your Twitch ID, display name,
        login name, and profile picture are processed and stored in our database to link your
        account. The legal basis is Art. 6(1)(b) GDPR (performance of a contract).
      </p>
      <h2>Cookies &amp; local storage</h2>
      <p>
        We only use technically necessary cookies (a session cookie after sign-in, a guest token
        when joining a lobby). Your browser additionally stores your language, theme, and cookie
        acknowledgement in local storage. No third-party tracking or analytics take place.
      </p>
      <h2>Retention</h2>
      <p>
        Session data is kept until logout or session expiry. You can remove session and Bingo
        history data at any time via account deletion or the history view.
      </p>
      <h2>Your rights</h2>
      <p>
        You have the right to access, rectification, erasure, restriction of processing, data
        portability, and objection. Please contact the address listed in the imprint.
      </p>
    </template>

    <RouterLink :to="{ name: 'landing' }" class="button secondary legal-back">{{
      isGerman ? 'Zurück' : 'Back'
    }}</RouterLink>
  </main>
</template>
