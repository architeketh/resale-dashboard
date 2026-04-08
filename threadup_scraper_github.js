(function() {
  const FUNCTION_URL = 'https://fuhphebvnstgszapvitz.supabase.co/functions/v1/resale-sync';
  function cleanText(value) {
    return String(value || '')
      .replace(/\s+/g, ' ')
      .replace(/\u00a0/g, ' ')
      .trim();
  }

  function parseMoney(value) {
    const match = cleanText(value).match(/\$[\d,]+(?:\.\d+)?/);
    return match ? Number(match[0].replace(/[$,]/g, '')) : 0;
  }

  function parseAltText(altText) {
    const cleanAlt = cleanText((altText || '').replace(/\(view \d+\)/gi, ''));
    if (!cleanAlt) return { brand: '', description: '' };

    const words = cleanAlt.split(' ');
    for (let i = 1; i < words.length; i += 1) {
      const candidateBrand = words.slice(0, i).join(' ');
      const remaining = words.slice(i).join(' ');
      if (remaining.toLowerCase().startsWith(candidateBrand.toLowerCase() + ' ')) {
        return {
          brand: candidateBrand,
          description: cleanText(remaining.slice(candidateBrand.length))
        };
      }
    }

    return {
      brand: words.slice(0, Math.min(3, words.length)).join(' '),
      description: words.slice(Math.min(3, words.length)).join(' ')
    };
  }

  function buildOverlay() {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:20px;right:20px;z-index:2147483647;max-width:360px;padding:18px 20px;border-radius:16px;background:#111827;color:#f8fafc;box-shadow:0 20px 40px rgba(15,23,42,.35);font:14px/1.5 Arial,sans-serif';
    overlay.innerHTML = '<strong style="display:block;font-size:15px;margin-bottom:8px;">ThreadUp Sync</strong><div id="resale-sync-status">Starting scrape...</div>';
    document.body.appendChild(overlay);
    return overlay;
  }

  function setStatus(message) {
    const target = document.getElementById('resale-sync-status');
    if (target) target.innerHTML = message;
  }

  function normalizeForMatch(value) {
    return cleanText(value).toLowerCase();
  }

  function stripBrandFromText(brand, text) {
    const cleanBrand = cleanText(brand);
    const cleanValue = cleanText(text);
    if (!cleanBrand || !cleanValue) return cleanValue;

    const lowerBrand = cleanBrand.toLowerCase();
    const lowerValue = cleanValue.toLowerCase();

    if (lowerValue === lowerBrand) return '';
    if (lowerValue.startsWith(lowerBrand + ' ')) return cleanText(cleanValue.slice(cleanBrand.length));
    if (lowerValue.startsWith(lowerBrand + ' - ')) return cleanText(cleanValue.slice(cleanBrand.length + 3));
    if (lowerValue.startsWith(lowerBrand + ': ')) return cleanText(cleanValue.slice(cleanBrand.length + 2));

    return cleanValue;
  }

  function findContainers() {
    const cards = Array.from(document.querySelectorAll('[class*="item-card"]'));
    const containers = [];

    cards.forEach((card) => {
      let parent = card.parentElement;
      while (parent && parent !== document.body) {
        const hasImage = parent.querySelector('[class*="item-card-image"]');
        const hasBody = parent.querySelector('[class*="item-card-body"]');
        if (hasImage && hasBody) {
          if (!containers.includes(parent)) containers.push(parent);
          break;
        }
        parent = parent.parentElement;
      }
    });

    if (!containers.length) return [];

    const firstContainer = containers[0];
    let primaryGrid = firstContainer.parentElement;

    while (primaryGrid && primaryGrid !== document.body) {
      const siblingMatches = Array.from(primaryGrid.children).filter((child) => containers.includes(child));
      if (siblingMatches.length >= 4) {
        return siblingMatches;
      }
      primaryGrid = primaryGrid.parentElement;
    }

    return containers;
  }

  function dedupeItems(items) {
    const seen = new Set();
    return items.filter((item) => {
      const key = [
        cleanText(item.url).toLowerCase(),
        cleanText(item.brand).toLowerCase(),
        cleanText(item.description).toLowerCase(),
        Number(item.price || 0),
        item.status
      ].join('||');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function dedupeByUrl(items) {
    const seen = new Set();
    return items.filter((item) => {
      const key = cleanText(item.url).toLowerCase() || [
        cleanText(item.brand).toLowerCase(),
        cleanText(item.description).toLowerCase(),
        Number(item.price || 0),
        item.status
      ].join('||');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function getContainerCandidates(container) {
    const candidates = [];
    const nodes = container.querySelectorAll(
      '[class*="item-card-body"] *,' +
      '[class*="item-card-title"],' +
      '[class*="item-card-brand"],' +
      '[class*="item-card-description"],' +
      'h1,h2,h3,h4,p,span,div'
    );

    nodes.forEach((node) => {
      const text = cleanText(node.textContent);
      if (!text) return;
      if (/^\$[\d,]+(?:\.\d+)?$/.test(text)) return;
      if (/^(just listed|sold|like new|new with tags)$/i.test(text)) return;
      if (/^\d+$/.test(text)) return;
      if (text.length < 2 || text.length > 140) return;
      if (!candidates.includes(text)) candidates.push(text);
    });

    return candidates;
  }

  function extractProductFromContainer(container) {
    let fallback = { brand: '', description: '' };

    const image = container.querySelector('img[alt]');
    if (image?.alt) fallback = parseAltText(image.alt);

    const candidates = getContainerCandidates(container);
    if (!fallback.brand && candidates.length) fallback.brand = candidates[0];

    if (!fallback.description) {
      for (const candidate of candidates) {
        if (normalizeForMatch(candidate) === normalizeForMatch(fallback.brand)) continue;
        if (fallback.brand && normalizeForMatch(candidate).startsWith(normalizeForMatch(fallback.brand))) {
          fallback.description = stripBrandFromText(fallback.brand, candidate);
          if (fallback.description) break;
        }
      }
    }

    return {
      brand: cleanText(fallback.brand),
      description: cleanText(fallback.description)
    };
  }

  function parseJson(text) {
    try {
      return JSON.parse(text);
    } catch (error) {
      return null;
    }
  }

  function extractProductFromDocument(doc) {
    const result = { brand: '', description: '' };
    const scripts = doc.querySelectorAll('script[type="application/ld+json"]');

    for (const script of scripts) {
      const parsed = parseJson(script.textContent);
      const entries = Array.isArray(parsed) ? parsed : [parsed];

      for (const entry of entries) {
        if (!entry || typeof entry !== 'object') continue;
        const type = entry['@type'];
        const isProduct = Array.isArray(type) ? type.includes('Product') : type === 'Product';
        if (!isProduct) continue;

        let brand = '';
        if (typeof entry.brand === 'string') brand = entry.brand;
        else if (entry.brand && typeof entry.brand === 'object') brand = entry.brand.name || '';

        const name = cleanText(entry.name || '');
        const description = cleanText(entry.description || '');

        result.brand = cleanText(brand);
        result.description = stripBrandFromText(result.brand, name) || stripBrandFromText(result.brand, description);
        if (result.brand || result.description) return result;
      }
    }

    const metaTitle = doc.querySelector('meta[property="og:title"], meta[name="twitter:title"]');
    if (metaTitle?.content) {
      const parsedTitle = parseAltText(metaTitle.content);
      if (parsedTitle.brand || parsedTitle.description) return parsedTitle;
    }

    const heading = doc.querySelector('h1');
    if (heading) {
      const parsedHeading = parseAltText(heading.textContent);
      if (parsedHeading.brand || parsedHeading.description) return parsedHeading;
    }

    const image = doc.querySelector('img[alt]');
    if (image?.alt) {
      const parsedImage = parseAltText(image.alt);
      if (parsedImage.brand || parsedImage.description) return parsedImage;
    }

    return result;
  }

  async function fetchProductPageDetails(url) {
    try {
      const response = await fetch(url, { credentials: 'include' });
      if (!response.ok) return { brand: '', description: '' };

      const html = await response.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      return extractProductFromDocument(doc);
    } catch (error) {
      return { brand: '', description: '' };
    }
  }

  function chooseBetterProductInfo(primary, secondary) {
    let brand = cleanText(primary.brand || secondary.brand);
    let description = cleanText(primary.description);

    if (!description || (secondary.description && secondary.description.length > description.length)) {
      description = cleanText(secondary.description);
    }

    if (!brand) brand = cleanText(secondary.brand);
    return { brand, description };
  }

  function isSimilarRecommendation(container, href) {
    const text = cleanText(container.textContent).toLowerCase();
    const url = cleanText(href).toLowerCase();

    return text.includes('items similar to') || url.includes('/similar/');
  }

  function inferFilterName() {
    const url = window.location.href.toLowerCase();
    if (url.includes('filter=sold') || url.includes('/sold')) return 'sold';
    if (url.includes('filter=available') || url.includes('filter=all') || url.includes('/available')) return 'available';

    const text = cleanText(document.body.textContent).toLowerCase();
    if (text.includes('sold') && !text.includes('available')) return 'sold';
    return 'available';
  }

  function hasRequiredFields(item) {
    return Boolean(cleanText(item.brand) && cleanText(item.description) && Number(item.price || 0) > 0 && cleanText(item.url));
  }

  async function autoScrollListings() {
    let previousHeight = 0;
    let stableRounds = 0;
    const maxRounds = 30;

    for (let round = 0; round < maxRounds; round += 1) {
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' });
      await new Promise((resolve) => setTimeout(resolve, 1400));

      const currentHeight = document.body.scrollHeight;
      if (currentHeight === previousHeight) {
        stableRounds += 1;
      } else {
        stableRounds = 0;
      }

      previousHeight = currentHeight;
      if (stableRounds >= 2) break;
    }

    window.scrollTo({ top: 0, behavior: 'instant' });
    await new Promise((resolve) => setTimeout(resolve, 400));
  }

  async function scrapeItems(filterName) {
    const rawItems = [];
    const containers = findContainers();

    for (let index = 0; index < containers.length; index += 1) {
      const container = containers[index];
      const productLink = container.querySelector('a[href*="/product/"], a[href*="/similar/"]');
      const href = productLink
        ? (productLink.href.startsWith('http') ? productLink.href : `https://www.thredup.com${productLink.getAttribute('href')}`)
        : '';

      if (!href) continue;
      if (isSimilarRecommendation(container, href)) continue;

      const listingProduct = extractProductFromContainer(container);
      const productPage = await fetchProductPageDetails(href);
      const product = chooseBetterProductInfo(productPage, listingProduct);
      const text = cleanText(container.textContent);
      const price = parseMoney(text);

      if (!product.brand && !product.description && !price && !href) continue;

      rawItems.push({
        status: filterName === 'sold' ? 'Sold' : 'For Sale',
        brand: product.brand,
        description: product.description,
        price,
        url: href,
        scrapedAt: new Date().toISOString()
      });

      if ((index + 1) % 5 === 0) {
        setStatus(`Collecting ${filterName} items...<br>Processed ${index + 1}/${containers.length}`);
      }
    }

    const acceptedItems = dedupeItems(rawItems.filter(hasRequiredFields));
    return {
      items: acceptedItems,
      skippedCount: rawItems.length - acceptedItems.length
    };
  }

  async function main() {
    const overlay = buildOverlay();

    try {
      const filterName = inferFilterName();
      setStatus(`Loading all ${filterName} items from the current page...`);
      await autoScrollListings();
      setStatus(`Collecting ${filterName} items from the current page...`);
      const { items, skippedCount } = await scrapeItems(filterName);
      if (!items.length) throw new Error('No ThreadUp items were found. Scroll the page to load listings, then run the scraper again.');

      const combinedItems = dedupeByUrl(items);

      setStatus(`Captured ${combinedItems.length} ${filterName} items.<br>Skipped ${skippedCount} missing required details.<br><br>Syncing to Supabase...`);
      const response = await fetch(FUNCTION_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sync_inventory', platform: 'threadup', items: combinedItems })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Sync failed');

      setStatus(`Sync complete.<br><br>Items: ${combinedItems.length}<br>Newly stamped sold dates: ${result.newlyStampedSoldDates || 0}<br>Supabase inventory updated.`);
      setTimeout(() => overlay.remove(), 6000);
    } catch (error) {
      setStatus(`Error: ${error.message}`);
      setTimeout(() => overlay.remove(), 9000);
      throw error;
    }
  }

  main();
})();
