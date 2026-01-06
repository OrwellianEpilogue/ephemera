// Filter constants for search

export const SORT_OPTIONS = [
  { value: "relevant", label: "Most relevant" },
  { value: "newest", label: "Newest (publication year)" },
  { value: "oldest", label: "Oldest (publication year)" },
  { value: "largest", label: "Largest (filesize)" },
  { value: "smallest", label: "Smallest (filesize)" },
  { value: "newest_added", label: "Newest (open sourced)" },
  { value: "oldest_added", label: "Oldest (open sourced)" },
  { value: "random", label: "Random" },
] as const;

export const FILE_FORMATS = [
  { value: "pdf", label: "PDF" },
  { value: "epub", label: "EPUB" },
  { value: "zip", label: "ZIP" },
  { value: "mobi", label: "MOBI" },
  { value: "fb2", label: "FB2" },
  { value: "azw3", label: "AZW3" },
  { value: "djvu", label: "DJVU" },
  { value: "txt", label: "TXT" },
  { value: "cbr", label: "CBR" },
  { value: "cbz", label: "CBZ" },
  { value: "doc", label: "DOC" },
  { value: "docx", label: "DOCX" },
  { value: "rtf", label: "RTF" },
  { value: "chm", label: "CHM" },
] as const;

export const CONTENT_TYPES = [
  { value: "book_nonfiction", label: "📘 Book (non-fiction)" },
  { value: "book_fiction", label: "📕 Book (fiction)" },
  { value: "book_unknown", label: "📗 Book (unknown)" },
  { value: "magazine", label: "📰 Magazine" },
  { value: "book_comic", label: "💬 Comic book" },
  { value: "standards_document", label: "📝 Standards document" },
  { value: "musical_score", label: "🎶 Musical score" },
  { value: "other", label: "🤨 Other" },
] as const;

export const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "am", label: "Amharic (አማርኛ)" },
  { value: "ar", label: "Arabic (العربية)" },
  { value: "ast", label: "Asturian (asturianu)" },
  { value: "az", label: "Azerbaijani (azərbaycan)" },
  { value: "be", label: "Belarusian (беларуская)" },
  { value: "bg", label: "Bulgarian (български)" },
  { value: "bn", label: "Bangla (বাংলা)" },
  { value: "br", label: "Portuguese (Brazil)" },
  { value: "ca", label: "Catalan (català)" },
  { value: "ckb", label: "Central Kurdish (کوردیی ناوەندی)" },
  { value: "cs", label: "Czech (čeština)" },
  { value: "da", label: "Danish (dansk)" },
  { value: "de", label: "German (Deutsch)" },
  { value: "el", label: "Greek (Ελληνικά)" },
  { value: "eo", label: "Esperanto" },
  { value: "es", label: "Spanish (español)" },
  { value: "et", label: "Estonian (eesti)" },
  { value: "fa", label: "Persian (فارسی)" },
  { value: "fi", label: "Finnish (suomi)" },
  { value: "fil", label: "Filipino" },
  { value: "fr", label: "French (français)" },
  { value: "gl", label: "Galician (galego)" },
  { value: "gu", label: "Gujarati (ગુજરાતી)" },
  { value: "ha", label: "Hausa" },
  { value: "he", label: "Hebrew (עברית)" },
  { value: "hi", label: "Hindi (हिन्दी)" },
  { value: "hr", label: "Croatian (hrvatski)" },
  { value: "hu", label: "Hungarian (magyar)" },
  { value: "hy", label: "Armenian (հայերեն)" },
  { value: "id", label: "Indonesian (Indonesia)" },
  { value: "it", label: "Italian (italiano)" },
  { value: "ja", label: "Japanese (日本語)" },
  { value: "jv", label: "Javanese (Jawa)" },
  { value: "ka", label: "Georgian (ქართული)" },
  { value: "ko", label: "Korean (한국어)" },
  { value: "lt", label: "Lithuanian (lietuvių)" },
  { value: "ml", label: "Malayalam (മലയാളം)" },
  { value: "mr", label: "Marathi (मराठी)" },
  { value: "ms", label: "Malay (Melayu)" },
  { value: "ne", label: "Nepali (नेपाली)" },
  { value: "nl", label: "Dutch (Nederlands)" },
  { value: "no", label: "Norwegian Bokmål (norsk bokmål)" },
  { value: "or", label: "Odia (ଓଡ଼ିଆ)" },
  { value: "pl", label: "Polish (polski)" },
  { value: "ps", label: "Pashto (پښتو)" },
  { value: "pt", label: "Portuguese (Portugal)" },
  { value: "ro", label: "Romanian (română)" },
  { value: "ru", label: "Russian (русский)" },
  { value: "sk", label: "Slovak (slovenčina)" },
  { value: "sl", label: "Slovenian (slovenščina)" },
  { value: "sq", label: "Albanian (shqip)" },
  { value: "sr", label: "Serbian (српски)" },
  { value: "sv", label: "Swedish (svenska)" },
  { value: "ta", label: "Tamil (தமிழ்)" },
  { value: "te", label: "Telugu (తెలుగు)" },
  { value: "th", label: "Thai (ไทย)" },
  { value: "tr", label: "Turkish (Türkçe)" },
  { value: "tw", label: "Chinese Traditional (中文 繁體)" },
  { value: "uk", label: "Ukrainian (українська)" },
  { value: "ur", label: "Urdu (اردو)" },
  { value: "vec", label: "Venetian (veneto)" },
  { value: "vi", label: "Vietnamese (Tiếng Việt)" },
  { value: "yue", label: "Cantonese (粵語)" },
  { value: "zh", label: "Chinese (中文)" },
] as const;

// List import sources configuration
export const LIST_SOURCES = [
  {
    id: "goodreads",
    name: "Goodreads",
    icon: "GR",
    color: "#B7AD98",
    textColor: "#000",
    description: "Import from Goodreads shelves via RSS",
    requiresApiKey: false,
    requiresFlareSolverr: false,
  },
  {
    id: "storygraph",
    name: "StoryGraph",
    icon: "SG",
    color: "#14919B",
    textColor: "#fff",
    description: "Import from StoryGraph to-read list",
    requiresApiKey: false,
    requiresFlareSolverr: true,
  },
  {
    id: "hardcover",
    name: "Hardcover",
    icon: "HC",
    color: "#6466F1",
    textColor: "#fff",
    description: "Import from Hardcover lists via API",
    requiresApiKey: true,
    requiresFlareSolverr: false,
  },
  {
    id: "openlibrary",
    name: "Open Library",
    icon: "OL",
    color: "#E1DCC5",
    textColor: "#5189BE",
    description: "Import from Open Library reading lists",
    requiresApiKey: false,
    requiresFlareSolverr: false,
  },
  {
    id: "babelio",
    name: "Babelio",
    icon: "BB",
    color: "#F5A623",
    textColor: "#fff",
    description: "Import depuis les listes publiques Babelio",
    requiresApiKey: false,
    requiresFlareSolverr: false,
  },
] as const;

export type ListSourceId = (typeof LIST_SOURCES)[number]["id"];

// Derived color lookup for components
export const SOURCE_COLORS: Record<string, { bg: string; text: string }> =
  Object.fromEntries(
    LIST_SOURCES.map((s) => [s.id, { bg: s.color, text: s.textColor }]),
  ) as Record<string, { bg: string; text: string }>;

// Full source config for UI components
export const SOURCE_CONFIG: Record<
  ListSourceId,
  { color: string; textColor: string; label: string; icon: string }
> = Object.fromEntries(
  LIST_SOURCES.map((s) => [
    s.id,
    { color: s.color, textColor: s.textColor, label: s.name, icon: s.icon },
  ]),
) as Record<
  ListSourceId,
  { color: string; textColor: string; label: string; icon: string }
>;
