// packages/api/src/utils/i18n.ts
import i18n from "i18next";
import Backend from "i18next-fs-backend";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const localesPath = join(__dirname, "../../locales/{{lng}}/{{ns}}.json");

export async function initI18n() {
  await i18n.use(Backend).init({
    fallbackLng: "en",
    supportedLngs: ["en", "fr"],
    defaultNS: "notifications",
    ns: ["notifications"],
    backend: {
      loadPath: localesPath,
    },
    interpolation: {
      escapeValue: false,
    },
  });
  return i18n;
}

/**
 * Helper pour obtenir une fonction de traduction pour une langue spécifique
 */
export function getFixedT(locale: string = "en") {
  return i18n.getFixedT(locale, "notifications");
}

export default i18n;
