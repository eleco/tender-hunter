const KEYWORD_TRANSLATION_GROUPS = [
  ["software", "logiciel", "software"],
  ["software development", "developpement logiciel", "desarrollo de software"],
  ["development", "developpement", "desarrollo"],
  ["integration", "integration", "integracion"],
  ["application", "application", "aplicacion"],
  ["application support", "support applicatif", "soporte de aplicaciones"],
  ["support", "support", "soporte"],
  ["maintenance", "maintenance", "mantenimiento"],
  ["cloud", "cloud", "nube"],
  ["cloud migration", "migration cloud", "migracion a la nube"],
  ["migration", "migration", "migracion"],
  ["cloud review", "revue cloud", "revision cloud"],
  ["assessment", "evaluation", "evaluacion"],
  ["architecture", "architecture", "arquitectura"],
  ["architect", "architecte", "arquitecto"],
  ["expert", "expert", "experto"],
  ["senior expert", "expert senior", "experto senior"],
  ["consultant", "consultant", "consultor"],
  ["advisory", "conseil", "asesoria"],
  ["framework", "accord cadre", "acuerdo marco"],
  ["framework agreement", "accord cadre", "acuerdo marco"],
  ["lot", "lot", "lote"],
  ["subcontracting", "sous traitance", "subcontratacion"],
  ["subcontractor", "sous traitant", "subcontratista"],
  ["cybersecurity", "cybersecurite", "ciberseguridad"],
  ["security", "securite", "seguridad"],
  ["monitoring", "supervision", "monitorizacion"],
  ["furniture", "mobilier", "mobiliario"],
  ["construction", "construction", "construccion"],
  ["staffing", "recrutement", "contratacion"],
];

const keywordVariantIndex = new Map<string, string[]>();

function stripAccents(value: string) {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

export function normalizeKeywordText(value: string) {
  return stripAccents(value)
    .toLowerCase()
    .replace(/['’]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

for (const group of KEYWORD_TRANSLATION_GROUPS) {
  const normalizedGroup = [...new Set(group.map(normalizeKeywordText).filter(Boolean))];
  for (const term of normalizedGroup) {
    keywordVariantIndex.set(term, normalizedGroup);
  }
}

export function getKeywordVariants(keyword: string) {
  const normalized = normalizeKeywordText(keyword);
  return keywordVariantIndex.get(normalized) ?? (normalized ? [normalized] : []);
}

export function findKeywordMatchInNormalizedText(normalizedText: string, keyword: string) {
  for (const variant of getKeywordVariants(keyword)) {
    if (variant && normalizedText.includes(variant)) {
      return variant;
    }
  }

  return undefined;
}

export function findKeywordMatch(text: string, keyword: string) {
  return findKeywordMatchInNormalizedText(normalizeKeywordText(text), keyword);
}
