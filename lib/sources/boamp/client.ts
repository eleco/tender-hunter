// BOAMP (Bulletin Officiel des Annonces des Marchés Publics)
// France's official public procurement bulletin.
// Free Socrata API — no authentication required.
// Docs: https://www.boamp.fr/api/explore/v2.1/console

export type BoampRecord = {
  idweb?: string;           // notice ID (e.g. "26-22415")
  id?: string;              // alternative ID (underscore format)
  objet?: string;           // tender title/subject
  nomacheteur?: string;     // buyer name (flat string, not nested)
  dateparution?: string;    // publication date
  datelimitereponse?: string; // response deadline
  nature?: string;          // notice type (APPEL_OFFRE, MAPA, etc.)
  type_procedure?: string;  // procedure type (OUVERT, RESTREINT, etc.)
  code_departement?: string[]; // French department code(s)
  url_avis?: string;        // canonical notice URL
  donnees?: string;         // full eForms/UBL notice as JSON string
  // BOAMP uses its own descripteur_code classification (not CPV)
  descripteur_code?: string[];
  descripteur_libelle?: string[];
};

export type BoampResponse = {
  results?: BoampRecord[];
  total_count?: number;
};

const BOAMP_API = "https://www.boamp.fr/api/explore/v2.1/catalog/datasets/boamp/records";

/** Returns BOAMP call-for-tender notices published in the last 60 days. */
export async function searchBoampNotices(offset = 0, limit = 100): Promise<BoampResponse> {
  const since = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];

  // IT-related descripteur codes:
  //   162 = Informatique (matériel), 163 = Informatique (prestations de services)
  //   171 = Site internet, 186 = Logiciel, 453 = Informatique (assistance)
  //   454 = Informatique (maintenance serveurs et réseaux)
  const params = new URLSearchParams({
    where: `nature IN ("APPEL_OFFRE","MAPA") AND dateparution >= date'${since}' AND descripteur_code IN ("162","163","171","186","453","454")`,
    order_by: "dateparution DESC",
    limit: String(limit),
    offset: String(offset),
  });

  const response = await fetch(`${BOAMP_API}?${params}`, {
    headers: { accept: "application/json" },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`BOAMP fetch failed (${response.status}): ${await response.text()}`);
  }

  return response.json() as Promise<BoampResponse>;
}
