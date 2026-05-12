const FLAG_MAP: Record<string, string> = {
  "عُمان": "🇴🇲",
  "عمان": "🇴🇲",
  "سلطنة عُمان": "🇴🇲",
  "سلطنة عمان": "🇴🇲",
  "Oman": "🇴🇲",
  "السعودية": "🇸🇦",
  "المملكة العربية السعودية": "🇸🇦",
  "Saudi Arabia": "🇸🇦",
  "الإمارات": "🇦🇪",
  "الإمارات العربية المتحدة": "🇦🇪",
  "UAE": "🇦🇪",
  "United Arab Emirates": "🇦🇪",
  "الكويت": "🇰🇼",
  "Kuwait": "🇰🇼",
  "قطر": "🇶🇦",
  "Qatar": "🇶🇦",
  "البحرين": "🇧🇭",
  "Bahrain": "🇧🇭",
  "اليمن": "🇾🇪",
  "Yemen": "🇾🇪",
  "الأردن": "🇯🇴",
  "Jordan": "🇯🇴",
  "مصر": "🇪🇬",
  "Egypt": "🇪🇬",
  "العراق": "🇮🇶",
  "Iraq": "🇮🇶",
  "سوريا": "🇸🇾",
  "Syria": "🇸🇾",
  "لبنان": "🇱🇧",
  "Lebanon": "🇱🇧",
  "فلسطين": "🇵🇸",
  "Palestine": "🇵🇸",
  "المغرب": "🇲🇦",
  "Morocco": "🇲🇦",
  "تونس": "🇹🇳",
  "Tunisia": "🇹🇳",
  "الجزائر": "🇩🇿",
  "Algeria": "🇩🇿",
  "ليبيا": "🇱🇾",
  "Libya": "🇱🇾",
  "السودان": "🇸🇩",
  "Sudan": "🇸🇩",
  "الصومال": "🇸🇴",
  "Somalia": "🇸🇴",
  "جيبوتي": "🇩🇯",
  "Djibouti": "🇩🇯",
  "موريتانيا": "🇲🇷",
  "Mauritania": "🇲🇷",
  "مصر": "🇪🇬",
};

export function getCountryFlag(country: string): string {
  if (!country) return "";
  const trimmed = country.trim();
  if (FLAG_MAP[trimmed]) return FLAG_MAP[trimmed];
  const lower = trimmed.toLowerCase();
  for (const [key, flag] of Object.entries(FLAG_MAP)) {
    if (key.toLowerCase() === lower) return flag;
  }
  return "";
}
