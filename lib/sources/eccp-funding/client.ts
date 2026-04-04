const ECCP_BASE_URL = "https://www.clustercollaboration.eu";
const ECCP_SITEMAP_PAGES = [1, 2];

export type EccpSitemapEntry = {
  url: string;
  lastmod: string | null;
};

export type EccpPage = {
  url: string;
  html: string;
};

function normalizeEccpUrl(url: string) {
  return url.replace(/^http:\/\/default/, ECCP_BASE_URL).replace(/^http:\/\//, "https://");
}

export function parseEccpSitemap(xml: string): EccpSitemapEntry[] {
  const entries: EccpSitemapEntry[] = [];
  const entryRegex = /<url>\s*<loc>([^<]+)<\/loc>(?:<lastmod>([^<]+)<\/lastmod>)?/g;

  for (const match of xml.matchAll(entryRegex)) {
    const url = normalizeEccpUrl(match[1].trim());
    if (!url.startsWith(`${ECCP_BASE_URL}/content/`)) continue;

    entries.push({
      url,
      lastmod: match[2]?.trim() ?? null,
    });
  }

  return entries;
}

export async function fetchEccpSitemapEntries(): Promise<EccpSitemapEntry[]> {
  const pages = await Promise.all(
    ECCP_SITEMAP_PAGES.map(async (page) => {
      const response = await fetch(`${ECCP_BASE_URL}/sitemap.xml?page=${page}`, {
        headers: {
          accept: "application/xml, text/xml;q=0.9, */*;q=0.8",
          "user-agent": "Mozilla/5.0 (compatible; TenderHunter/1.0; +https://example.com/bot)",
        },
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`ECCP sitemap fetch failed (${response.status}) for page ${page}.`);
      }

      return parseEccpSitemap(await response.text());
    }),
  );

  return pages.flat();
}

export async function fetchEccpPage(url: string): Promise<EccpPage | null> {
  const response = await fetch(url, {
    headers: {
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "user-agent": "Mozilla/5.0 (compatible; TenderHunter/1.0; +https://example.com/bot)",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    return null;
  }

  const html = await response.text();
  const finalUrl = response.url || url;
  if (finalUrl.includes("/user/login") || /<title>\s*Log in\s*\|/i.test(html)) {
    return null;
  }

  return {
    url: normalizeEccpUrl(finalUrl),
    html,
  };
}
