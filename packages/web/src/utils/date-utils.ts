import { formatDistanceToNow } from "date-fns";
import { fr, enUS } from "date-fns/locale";

/**
 * Get date-fns locale object based on i18next language string
 */
export function getDateLocale(lang: string) {
  return lang === "fr" ? fr : enUS;
}

/**
 * Localized version of formatDistanceToNow
 */
export function formatDistanceToNowLocalized(
  date: Date | number,
  lang: string,
) {
  return formatDistanceToNow(date, {
    addSuffix: true,
    locale: getDateLocale(lang),
  });
}
