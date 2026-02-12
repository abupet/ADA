// backend/src/seed.promogen.js
// PR 15: Brand search, web scraping, and product import for the promo seed engine.

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

// ---------------------------------------------------------------------------
// 1. KNOWN_BRAND_URLS map
// ---------------------------------------------------------------------------

const KNOWN_BRAND_URLS = {
  "royal canin": [
    {
      url: "https://www.royalcanin.com/it/dogs/products",
      name: "Royal Canin IT — Cani",
    },
    {
      url: "https://www.royalcanin.com/it/cats/products",
      name: "Royal Canin IT — Gatti",
    },
  ],
  "hill's": [
    {
      url: "https://www.hillspet.it/prodotti-cane",
      name: "Hill's IT — Cani",
    },
    {
      url: "https://www.hillspet.it/prodotti-gatto",
      name: "Hill's IT — Gatti",
    },
  ],
  purina: [
    {
      url: "https://www.purina.it/cane/prodotti",
      name: "Purina IT — Cani",
    },
    {
      url: "https://www.purina.it/gatto/prodotti",
      name: "Purina IT — Gatti",
    },
  ],
  monge: [
    {
      url: "https://www.monge.it/prodotti/cane",
      name: "Monge — Cani",
    },
    {
      url: "https://www.monge.it/prodotti/gatto",
      name: "Monge — Gatti",
    },
  ],
  farmina: [
    {
      url: "https://www.farmina.com/it/cane/",
      name: "Farmina — Cani",
    },
    {
      url: "https://www.farmina.com/it/gatto/",
      name: "Farmina — Gatti",
    },
  ],
  virbac: [
    {
      url: "https://it.virbac.com/prodotti",
      name: "Virbac IT — Prodotti",
    },
  ],
  bayer: [
    {
      url: "https://www.bfriendsanimalhealth.it/prodotti",
      name: "Bayer Animal Health IT",
    },
  ],
};

// ---------------------------------------------------------------------------
// 2. searchBrandSites(brands, openAiKey)
// ---------------------------------------------------------------------------

/**
 * Search for brand product-page URLs.
 *
 * Level 1 — instant lookup in KNOWN_BRAND_URLS.
 * Level 2 — if a brand is not in the map AND an OpenAI key is available,
 *            ask OpenAI for Italian veterinary product URLs.
 *
 * @param {string} brands  Comma-separated brand names, e.g. "Royal Canin, Hill's"
 * @param {string|null} openAiKey
 * @returns {Promise<{sites: Array<{url:string, name:string, description:string, source:string}>}>}
 */
async function searchBrandSites(brands, openAiKey) {
  const sites = [];

  const brandList = (brands || "")
    .split(",")
    .map((b) => b.trim().toLowerCase())
    .filter(Boolean);

  for (const brand of brandList) {
    // Level 1: known lookup
    const knownEntries = KNOWN_BRAND_URLS[brand];
    if (knownEntries) {
      for (const entry of knownEntries) {
        sites.push({
          url: entry.url,
          name: entry.name,
          description: `Pagina prodotti ${brand} (lookup locale)`,
          source: "known",
        });
      }
      continue;
    }

    // Level 2: OpenAI fallback
    if (!openAiKey) continue;

    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openAiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          temperature: 0.2,
          messages: [
            {
              role: "system",
              content:
                "Sei un assistente veterinario italiano. Rispondi SOLO con un JSON array di oggetti " +
                '{ "url": "...", "name": "..." } contenente le pagine prodotti italiane del brand richiesto. ' +
                "Se non conosci URL certi, rispondi con un array vuoto [].",
            },
            {
              role: "user",
              content: `Trova le pagine prodotti veterinari italiane per il brand "${brand}".`,
            },
          ],
        }),
      });

      if (!response.ok) {
        console.warn(
          `searchBrandSites: OpenAI request failed for "${brand}" — HTTP ${response.status}`
        );
        continue;
      }

      const data = await response.json();
      const text = (data.choices?.[0]?.message?.content || "").trim();

      // Attempt to parse the JSON array from the model response
      let parsed = [];
      try {
        // Strip potential markdown fences
        const cleaned = text.replace(/```json?\s*/gi, "").replace(/```/g, "").trim();
        parsed = JSON.parse(cleaned);
      } catch (_parseErr) {
        console.warn(
          `searchBrandSites: could not parse OpenAI response for "${brand}"`
        );
        continue;
      }

      if (Array.isArray(parsed)) {
        for (const entry of parsed) {
          if (entry && typeof entry.url === "string" && entry.url.startsWith("http")) {
            sites.push({
              url: entry.url,
              name: entry.name || brand,
              description: `Pagina prodotti ${brand} (via OpenAI)`,
              source: "openai",
            });
          }
        }
      }
    } catch (err) {
      console.warn(
        `searchBrandSites: OpenAI call error for "${brand}":`,
        err.message
      );
    }
  }

  return { sites };
}

// ---------------------------------------------------------------------------
// 3. scrapeProductsFromSites(siteUrls, openAiKey)
// ---------------------------------------------------------------------------

/**
 * Valid promo item categories.
 */
const VALID_CATEGORIES = [
  "food_general",
  "food_clinical",
  "supplement",
  "antiparasitic",
  "accessory",
  "service",
];

/**
 * Scrape product data from a list of site URLs.
 *
 * Strategy per URL:
 *   a) Fetch HTML.
 *   b) Parse JSON-LD and Open Graph structured data.
 *   c) Fall back to HTML structure (product cards / list items).
 *   d) If data is still thin and an OpenAI key is available, summarise the
 *      HTML and ask OpenAI to extract products.
 *
 * @param {string[]} siteUrls
 * @param {string|null} openAiKey
 * @returns {Promise<Array<Object>>}
 */
async function scrapeProductsFromSites(siteUrls, openAiKey) {
  const allProducts = [];

  for (const siteUrl of siteUrls) {
    // --- Crawl the URL and its child pages (BFS, max 50 pages, depth 2) ---
    console.log(`scrapeProductsFromSites: starting crawl from ${siteUrl}`);
    let pages;
    try {
      pages = await _crawlChildPages(siteUrl, 50, 2);
    } catch (crawlErr) {
      console.warn(
        `scrapeProductsFromSites: crawl error for ${siteUrl}:`,
        crawlErr.message
      );
      continue;
    }

    if (!pages || pages.length === 0) continue;

    console.log(
      `scrapeProductsFromSites: crawled ${pages.length} page(s) from ${siteUrl}`
    );

    // --- Extract products from each crawled page ---
    for (const page of pages) {
      const productsFromPage = _extractProductsFromPage(
        page.$,
        page.url,
        page.sourceSite
      );

      // --- OpenAI fallback if few products found on this page ---
      if (productsFromPage.length < 3 && openAiKey) {
        try {
          const bodyText = (page.$("main").text() || page.$("body").text() || "")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 6000);

          if (bodyText.length > 200) {
            const aiRes = await fetch(
              "https://api.openai.com/v1/chat/completions",
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${openAiKey}`,
                },
                body: JSON.stringify({
                  model: "gpt-4o-mini",
                  temperature: 0.1,
                  messages: [
                    {
                      role: "system",
                      content:
                        "Estrai i prodotti veterinari dal testo di una pagina web. " +
                        "Rispondi SOLO con un JSON array di oggetti con campi: " +
                        '"name", "category" (food_general|food_clinical|supplement|antiparasitic|accessory|service), ' +
                        '"species" (array: dog|cat), "lifecycle_target" (array: puppy|adult|senior), ' +
                        '"description". Se non trovi prodotti, rispondi con [].',
                    },
                    {
                      role: "user",
                      content: `URL: ${page.url}\n\nTesto pagina:\n${bodyText}`,
                    },
                  ],
                }),
              }
            );

            if (aiRes.ok) {
              const aiData = await aiRes.json();
              const aiText = (aiData.choices?.[0]?.message?.content || "").trim();
              let aiParsed = [];
              try {
                const cleaned = aiText
                  .replace(/```json?\s*/gi, "")
                  .replace(/```/g, "")
                  .trim();
                aiParsed = JSON.parse(cleaned);
              } catch (_pe) {
                // skip
              }

              if (Array.isArray(aiParsed)) {
                for (const item of aiParsed) {
                  if (item && item.name) {
                    productsFromPage.push(
                      _buildProduct({
                        name: item.name,
                        category: item.category,
                        species: item.species,
                        lifecycle_target: item.lifecycle_target,
                        description: item.description || "",
                        product_url: page.url,
                        image_url: "",
                        source_site: page.sourceSite,
                      })
                    );
                  }
                }
              }
            }
          }
        } catch (aiErr) {
          console.warn(
            `scrapeProductsFromSites: OpenAI fallback error for ${page.url}:`,
            aiErr.message
          );
        }
      }

      allProducts.push(...productsFromPage);
    }
  }

  return allProducts;
}

/**
 * Extract products from a single page using JSON-LD, Open Graph, and HTML selectors.
 *
 * @param {import('cheerio').CheerioAPI} $
 * @param {string} pageUrl
 * @param {string} sourceSite
 * @returns {Array<Object>}
 */
function _extractProductsFromPage($, pageUrl, sourceSite) {
  const products = [];

  // --- Strategy (b): JSON-LD ---
  try {
    $('script[type="application/ld+json"]').each((_i, el) => {
      try {
        const json = JSON.parse($(el).html());
        const items = Array.isArray(json) ? json : [json];
        for (const item of items) {
          if (item["@type"] === "Product" || item["@type"] === "IndividualProduct") {
            products.push(_jsonLdToProduct(item, pageUrl, sourceSite));
          }
          if (item["@type"] === "ItemList" && Array.isArray(item.itemListElement)) {
            for (const li of item.itemListElement) {
              const inner = li.item || li;
              if (
                inner["@type"] === "Product" ||
                inner["@type"] === "IndividualProduct"
              ) {
                products.push(_jsonLdToProduct(inner, pageUrl, sourceSite));
              }
            }
          }
        }
      } catch (_jsonErr) {
        // Skip individual script blocks that don't parse
      }
    });
  } catch (_ldErr) {
    // Non-fatal
  }

  // --- Strategy (b): Open Graph ---
  try {
    const ogTitle = $('meta[property="og:title"]').attr("content");
    const ogImage = $('meta[property="og:image"]').attr("content");
    const ogDesc = $('meta[property="og:description"]').attr("content");
    const ogUrl = $('meta[property="og:url"]').attr("content");

    if (
      ogTitle &&
      products.length === 0 &&
      (ogDesc || "").toLowerCase().match(/prodott|product|food|cibo|aliment/)
    ) {
      products.push(
        _buildProduct({
          name: ogTitle,
          description: ogDesc || "",
          product_url: ogUrl || pageUrl,
          image_url: ogImage || "",
          source_site: sourceSite,
        })
      );
    }
  } catch (_ogErr) {
    // Non-fatal
  }

  // --- Strategy (c): HTML structure ---
  if (products.length === 0) {
    try {
      const productSelectors = [
        ".product-card",
        ".product-item",
        ".product-tile",
        '[data-product]',
        ".card.product",
        "article.product",
        ".product-list-item",
        ".plp-product",
      ];

      for (const sel of productSelectors) {
        $(sel).each((_i, el) => {
          const $el = $(el);
          const name =
            $el.find("h2, h3, h4, .product-name, .product-title, .card-title").first().text().trim() ||
            $el.find("a[title]").attr("title") ||
            "";
          if (!name) return;

          const link =
            $el.find("a[href]").first().attr("href") || "";
          const img =
            $el.find("img").first().attr("src") ||
            $el.find("img").first().attr("data-src") ||
            "";
          const desc =
            $el.find(".product-description, .product-desc, .description, p").first().text().trim() ||
            "";

          products.push(
            _buildProduct({
              name,
              description: desc,
              product_url: _resolveUrl(link, pageUrl),
              image_url: _resolveUrl(img, pageUrl),
              source_site: sourceSite,
            })
          );
        });

        if (products.length > 0) break; // First matching selector wins
      }
    } catch (_htmlErr) {
      // Non-fatal
    }
  }

  return products;
}

// ---------------------------------------------------------------------------
// Child-page crawling helpers (recursive scraping)
// ---------------------------------------------------------------------------

/**
 * SSRF-safe HTML fetch.  Returns { html, sourceSite } or null on failure.
 */
async function _safeFetchHtml(url) {
  try {
    const urlObj = new URL(url);

    if (urlObj.protocol !== "https:") {
      console.warn(`_safeFetchHtml: blocked non-HTTPS URL: ${url}`);
      return null;
    }

    const hostname = urlObj.hostname.toLowerCase();
    if (
      hostname === "localhost" ||
      hostname === "[::1]" ||
      /^127\./.test(hostname) ||
      /^10\./.test(hostname) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) ||
      /^192\.168\./.test(hostname) ||
      /^169\.254\./.test(hostname) ||
      /^0\./.test(hostname) ||
      hostname.endsWith(".local") ||
      hostname.endsWith(".internal")
    ) {
      console.warn(`_safeFetchHtml: blocked private/reserved address: ${url}`);
      return null;
    }

    const sourceSite = urlObj.hostname.replace(/^www\./, "");

    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; ADA-VetSeedBot/1.0; +https://ada-vet.app)",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      console.warn(`_safeFetchHtml: HTTP ${res.status} for ${url}`);
      return null;
    }

    const html = await res.text();
    return { html, sourceSite };
  } catch (err) {
    console.warn(`_safeFetchHtml: fetch error for ${url}:`, err.message);
    return null;
  }
}

/**
 * Normalise a URL for comparison: remove trailing slash, fragment, optionally query string.
 */
function _normalizeUrlForCompare(url) {
  try {
    const u = new URL(url);
    u.hash = "";
    // Keep pathname, remove trailing slash (unless root "/")
    if (u.pathname.length > 1 && u.pathname.endsWith("/")) {
      u.pathname = u.pathname.slice(0, -1);
    }
    return u.href;
  } catch (_e) {
    return url;
  }
}

/**
 * Discover child URLs from an already-fetched page.
 *
 * A link is a "child" if its resolved URL starts with the parentUrl
 * (after normalisation — trailing slash removed).
 *
 * @param {string} parentUrl  The root/parent URL (used as prefix filter)
 * @param {string} _html      Raw HTML (unused — kept for signature clarity)
 * @param {import('cheerio').CheerioAPI} $  Cheerio instance of the page
 * @returns {string[]}  Array of unique child URLs
 */
function _discoverChildUrls(parentUrl, _html, $) {
  const normalizedParent = _normalizeUrlForCompare(parentUrl);
  const seen = new Set();
  const children = [];

  $("a[href]").each((_i, el) => {
    const href = $(el).attr("href");
    if (!href) return;

    const resolved = _resolveUrl(href, parentUrl);
    if (!resolved || !resolved.startsWith("http")) return;

    const normalized = _normalizeUrlForCompare(resolved);

    // Must be a strict child (starts with parent but is not the parent itself)
    if (normalized === normalizedParent) return;
    if (!normalized.startsWith(normalizedParent)) return;

    if (seen.has(normalized)) return;
    seen.add(normalized);
    children.push(normalized);
  });

  return children;
}

/**
 * Crawl child pages via BFS starting from rootUrl.
 *
 * @param {string} rootUrl     The starting URL
 * @param {number} maxPages    Maximum total pages to fetch (default 50)
 * @param {number} maxDepth    Maximum crawl depth (default 2)
 * @returns {Promise<Array<{url:string, html:string, $:import('cheerio').CheerioAPI, sourceSite:string}>>}
 */
async function _crawlChildPages(rootUrl, maxPages = 50, maxDepth = 2) {
  const cheerio = require("cheerio");
  const visited = new Set();
  const queue = [{ url: _normalizeUrlForCompare(rootUrl), depth: 0 }];
  const results = [];

  while (queue.length > 0 && results.length < maxPages) {
    const { url, depth } = queue.shift();

    if (visited.has(url)) continue;
    visited.add(url);

    console.log(
      `Crawling ${url} (depth ${depth}, page ${results.length + 1}/${maxPages})`
    );

    const fetched = await _safeFetchHtml(url);
    if (!fetched) continue;

    let $;
    try {
      $ = cheerio.load(fetched.html);
    } catch (cheerioErr) {
      console.warn(`_crawlChildPages: cheerio parse error for ${url}:`, cheerioErr.message);
      continue;
    }

    results.push({ url, html: fetched.html, $, sourceSite: fetched.sourceSite });

    if (depth < maxDepth) {
      const childUrls = _discoverChildUrls(rootUrl, fetched.html, $);
      for (const childUrl of childUrls) {
        if (!visited.has(childUrl) && results.length + queue.length < maxPages) {
          queue.push({ url: childUrl, depth: depth + 1 });
        }
      }
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Internal helpers for scraping
// ---------------------------------------------------------------------------

/**
 * Convert a JSON-LD Product object into our normalised product shape.
 */
function _jsonLdToProduct(ld, pageUrl, sourceSite) {
  const name = ld.name || "";
  const description = ld.description || "";
  const image =
    typeof ld.image === "string"
      ? ld.image
      : Array.isArray(ld.image)
        ? ld.image[0]
        : ld.image?.url || "";
  const productUrl = ld.url || ld["@id"] || pageUrl;

  let priceRange = "";
  if (ld.offers) {
    const offers = Array.isArray(ld.offers) ? ld.offers : [ld.offers];
    const prices = offers
      .map((o) => parseFloat(o.price))
      .filter((p) => !isNaN(p));
    if (prices.length === 1) {
      priceRange = `${prices[0].toFixed(2)} EUR`;
    } else if (prices.length > 1) {
      priceRange = `${Math.min(...prices).toFixed(2)}–${Math.max(...prices).toFixed(2)} EUR`;
    }
  }

  return _buildProduct({
    name,
    description,
    product_url: productUrl,
    image_url: image,
    price_range: priceRange,
    source_site: sourceSite,
  });
}

/**
 * Infer species from a URL or product name.
 */
function _inferSpecies(text) {
  const lower = (text || "").toLowerCase();
  const species = [];
  if (/\b(dog|dogs|cane|cani)\b/.test(lower)) species.push("dog");
  if (/\b(cat|cats|gatto|gatti)\b/.test(lower)) species.push("cat");
  return species.length > 0 ? species : ["dog", "cat"];
}

/**
 * Infer lifecycle target from a product name or description.
 */
function _inferLifecycle(text) {
  const lower = (text || "").toLowerCase();
  const targets = [];
  if (/\b(puppy|puppies|cucciolo|cuccioli|kitten|gattino)\b/.test(lower))
    targets.push("puppy");
  if (/\b(adult|adulto|adulti)\b/.test(lower)) targets.push("adult");
  if (/\b(senior|anziano|mature|ageing)\b/.test(lower)) targets.push("senior");
  return targets.length > 0 ? targets : ["adult"];
}

/**
 * Infer category from name/description.
 */
function _inferCategory(text) {
  const lower = (text || "").toLowerCase();
  if (/\b(clinical|veterinary diet|urinary|renal|hepatic|gastrointestinal|hypoallergenic|diabetic)\b/.test(lower))
    return "food_clinical";
  if (/\b(supplement|integratore|vitamins|glucosamine|omega|probiot)\b/.test(lower))
    return "supplement";
  if (/\b(antiparassitario|antiparasitic|flea|tick|pulci|zecche|filaria)\b/.test(lower))
    return "antiparasitic";
  if (/\b(accessory|accessorio|guinzaglio|cuccia|gioco|collare|trasportino)\b/.test(lower))
    return "accessory";
  if (/\b(servizio|service|assicurazione|insurance|checkup)\b/.test(lower))
    return "service";
  return "food_general";
}

/**
 * Build a normalised product object, filling in inferred fields where empty.
 */
function _buildProduct(raw) {
  const combinedText = `${raw.name || ""} ${raw.description || ""} ${raw.product_url || ""}`;
  const category =
    raw.category && VALID_CATEGORIES.includes(raw.category)
      ? raw.category
      : _inferCategory(combinedText);

  return {
    name: (raw.name || "").slice(0, 255),
    category,
    species: Array.isArray(raw.species) && raw.species.length > 0
      ? raw.species
      : _inferSpecies(combinedText),
    lifecycle_target: Array.isArray(raw.lifecycle_target) && raw.lifecycle_target.length > 0
      ? raw.lifecycle_target
      : _inferLifecycle(combinedText),
    description: (raw.description || "").slice(0, 1000),
    product_url: raw.product_url || "",
    image_url: raw.image_url || "",
    price_range: raw.price_range || "",
    tags_include: Array.isArray(raw.tags_include) ? raw.tags_include : [],
    tags_exclude: Array.isArray(raw.tags_exclude) ? raw.tags_exclude : [],
    source_site: raw.source_site || "",
  };
}

/**
 * Resolve a potentially relative URL against a base.
 */
function _resolveUrl(href, base) {
  if (!href) return "";
  try {
    return new URL(href, base).href;
  } catch (_e) {
    return href;
  }
}

// ---------------------------------------------------------------------------
// 4. importProductsToCatalog(pool, products, options)
// ---------------------------------------------------------------------------

/**
 * Import an array of scraped products into promo_items / promo_campaigns /
 * campaign_items.
 *
 * - promo_item_id = "seed-" + random 8-char hex
 * - tenant_id     = options.tenantId or first existing tenant or "seed-tenant"
 * - campaign       = one campaign per import run (utm_campaign = 'seed_import_YYYYMMDD')
 *
 * @param {import('pg').Pool} pool
 * @param {Array<Object>} products
 * @param {{tenantId?: string, mode?: string}} [options]
 * @returns {Promise<{imported: number, campaignId: string, deleted: number}>}
 */
async function importProductsToCatalog(pool, products, options) {
  if (!Array.isArray(products) || products.length === 0) {
    return { imported: 0, campaignId: null, deleted: 0 };
  }

  var opts = options || {};
  var mode = opts.mode === "replace" ? "replace" : "append";

  // --- Resolve tenant_id ---
  let tenantId = opts.tenantId || null;
  if (!tenantId) {
    tenantId = "seed-tenant";
    try {
      const tenantResult = await pool.query(
        "SELECT tenant_id FROM tenants ORDER BY created_at ASC LIMIT 1"
      );
      if (tenantResult.rows[0]) {
        tenantId = tenantResult.rows[0].tenant_id;
      }
    } catch (_e) {
      // Use fallback "seed-tenant"
    }
  }

  // --- Replace mode: delete existing seed items for this tenant ---
  let deleted = 0;
  if (mode === "replace") {
    try {
      // Delete campaign_items linked to seed promo_items for this tenant
      await pool.query(
        `DELETE FROM campaign_items WHERE promo_item_id IN (
           SELECT promo_item_id FROM promo_items
           WHERE tenant_id = $1 AND promo_item_id LIKE 'seed-%'
         )`,
        [tenantId]
      );
      // Delete seed promo_items
      const delResult = await pool.query(
        `DELETE FROM promo_items WHERE tenant_id = $1 AND promo_item_id LIKE 'seed-%'`,
        [tenantId]
      );
      deleted = delResult.rowCount || 0;
      console.log(`importProductsToCatalog: replace mode — deleted ${deleted} seed items for tenant ${tenantId}`);
    } catch (delErr) {
      console.warn("importProductsToCatalog: replace delete error:", delErr.message);
    }
  }

  // --- Create or reuse today's seed campaign ---
  const today = new Date();
  const yyyymmdd =
    today.getFullYear().toString() +
    String(today.getMonth() + 1).padStart(2, "0") +
    String(today.getDate()).padStart(2, "0");
  const utmCampaign = `seed_import_${yyyymmdd}`;
  const campaignId = `campaign-seed-${yyyymmdd}`;
  const campaignName = `Seed Import ${yyyymmdd}`;

  try {
    await pool.query(
      `INSERT INTO promo_campaigns
         (campaign_id, tenant_id, name, status, start_date, end_date, contexts, utm_campaign)
       VALUES ($1, $2, $3, 'active', CURRENT_DATE, CURRENT_DATE + INTERVAL '90 days',
               $4, $5)
       ON CONFLICT (campaign_id) DO UPDATE
         SET updated_at = NOW(),
             status = 'active'`,
      [
        campaignId,
        tenantId,
        campaignName,
        ["home_feed", "pet_profile"],
        utmCampaign,
      ]
    );
  } catch (campaignErr) {
    console.warn(
      "importProductsToCatalog: campaign upsert error:",
      campaignErr.message
    );
    // Continue anyway — items can still be inserted without campaign linkage
  }

  // --- Insert products ---
  let imported = 0;
  for (const product of products) {
    const promoItemId = "seed-" + crypto.randomUUID().slice(0, 8);

    try {
      await pool.query(
        `INSERT INTO promo_items
           (promo_item_id, tenant_id, name, category, species, lifecycle_target,
            description, image_url, product_url, tags_include, tags_exclude,
            priority, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'published')`,
        [
          promoItemId,
          tenantId,
          (product.name || "Unknown Product").slice(0, 255),
          VALID_CATEGORIES.includes(product.category)
            ? product.category
            : "food_general",
          product.species || [],
          product.lifecycle_target || [],
          (product.description || "").slice(0, 1000),
          product.image_url || null,
          product.product_url || null,
          product.tags_include || [],
          product.tags_exclude || [],
          0, // default priority
        ]
      );

      // Link to campaign
      try {
        await pool.query(
          `INSERT INTO campaign_items (campaign_id, promo_item_id)
           VALUES ($1, $2)
           ON CONFLICT (campaign_id, promo_item_id) DO NOTHING`,
          [campaignId, promoItemId]
        );
      } catch (_linkErr) {
        // Non-fatal: the item is still in the catalog, just not linked
      }

      // Auto-cache local placeholder images during seed
      if (product.image_url && product.image_url.startsWith('/api/seed-assets/')) {
        try {
          const imgPath = path.join(__dirname, product.image_url.replace('/api/seed-assets/', 'seed-assets/'));
          if (fs.existsSync(imgPath)) {
            const buf = fs.readFileSync(imgPath);
            const ext = path.extname(imgPath).toLowerCase();
            const mimeMap = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };
            const mime = mimeMap[ext] || 'image/png';
            const hash = crypto.createHash("sha256").update(buf).digest("hex");
            await pool.query(
              `UPDATE promo_items SET image_cached = $2, image_cached_mime = $3,
               image_cached_at = NOW(), image_cached_hash = $4 WHERE promo_item_id = $1`,
              [promoItemId, buf, mime, hash]
            );
          }
        } catch (_e) { /* non-blocking */ }
      }

      imported++;
    } catch (insertErr) {
      console.warn(
        `importProductsToCatalog: insert error for "${product.name}":`,
        insertErr.message
      );
    }
  }

  return { imported, campaignId, deleted };
}

// ---------------------------------------------------------------------------
// 5. Export
// ---------------------------------------------------------------------------

module.exports = { searchBrandSites, scrapeProductsFromSites, importProductsToCatalog };
