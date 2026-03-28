const COUNTRY_TO_ISO2: Record<string, string> = {
  "Austria": "AT", "Belgium": "BE", "Bulgaria": "BG", "Croatia": "HR",
  "Cyprus": "CY", "Czech Republic": "CZ", "Denmark": "DK", "Estonia": "EE",
  "Finland": "FI", "France": "FR", "Germany": "DE", "Greece": "GR",
  "Hungary": "HU", "Ireland": "IE", "Italy": "IT", "Latvia": "LV",
  "Lithuania": "LT", "Luxembourg": "LU", "Malta": "MT", "Netherlands": "NL",
  "Poland": "PL", "Portugal": "PT", "Romania": "RO", "Slovakia": "SK",
  "Slovenia": "SI", "Spain": "ES", "Sweden": "SE", "Norway": "NO",
  "Switzerland": "CH", "Iceland": "IS", "United Kingdom": "GB",
  "United States": "US", "Unknown": "",
};

/** Returns the emoji flag for a country name, or empty string if unknown. */
export function countryFlag(country: string): string {
  const iso2 = COUNTRY_TO_ISO2[country];
  if (!iso2) return "";
  return [...iso2.toUpperCase()]
    .map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65))
    .join("");
}

export function formatCurrency(value: number | null, currency: string) {
  if (value === null || Number.isNaN(value)) return "Not disclosed";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: currency || "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatDate(value: string | null) {
  if (!value) return "Unknown";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

export function formatDateTime(value: string | null, timeZone: string = "Europe/Madrid") {
  if (!value) return "Unknown";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(new Date(value));
}

export function formatDurationMs(value: number | null) {
  if (value === null || Number.isNaN(value)) return "Unknown";
  const totalSeconds = Math.max(0, Math.round(value / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

export function parseCsvList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function getScoreClass(score: number) {
  if (score >= 70) return "";
  if (score >= 45) return "medium";
  return "low";
}

export type DeadlineUrgency = {
  days: number;
  label: string;
  cssClass: "deadline-expired" | "deadline-critical" | "deadline-warning" | "deadline-soon";
};

export function deadlineUrgency(deadlineAt: string | null): DeadlineUrgency | null {
  if (!deadlineAt) return null;
  const days = Math.ceil((new Date(deadlineAt).getTime() - Date.now()) / 86400000);
  if (days < 0) return { days, label: "Expired", cssClass: "deadline-expired" };
  if (days <= 3) return { days, label: `${days}d left`, cssClass: "deadline-critical" };
  if (days <= 7) return { days, label: `${days}d left`, cssClass: "deadline-warning" };
  if (days <= 14) return { days, label: `${days}d left`, cssClass: "deadline-soon" };
  return null;
}
