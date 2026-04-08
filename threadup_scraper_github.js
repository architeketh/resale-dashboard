(function() {
  const FUNCTION_URL = 'https://fuhphebvnstgszapvitz.supabase.co/functions/v1/resale-sync';
  const STAGE_KEY = 'threadup_filter_stage_v1';

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

  function getCurrentFilter() {
    const response = window.prompt('ThreadUp filter currently open? Type "sold" or "available".', 'available');
    const normalized = cleanText(response).toLowerCase();
    if (normalized === 'sold' || normalized === 'available') return normalized;
    throw new Error('Please run the scraper from either the Sold or Available ThreadUp filter.');
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

  function isDirectListing(container) {
    return Array.from(container.querySelectorAll('h6, span, div, p'))
      .some((node) => cleanText(node.textContent).toLowerCase() === 'direct listing');
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

  function readStage() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STAGE_KEY) || '{}');
      return {
        sold: Array.isArray(parsed.sold) ? parsed.sold : null,
        available: Array.isArray(parsed.available) ? parsed.available : null
      };
    } catch (error) {
      return { sold: null, available: null };
    }
  }

  function writeStage(stage) {
    localStorage.setItem(STAGE_KEY, JSON.stringify(stage));
  }

  function clearStage() {
    localStorage.removeItem(STAGE_KEY);
  }

  function scrapeItems(filterName) {
    return dedupeItems(findContainers().filter(isDirectListing).map((container) => {
      const link = container.querySelector('a[href*="/similar/"]');
      const productLink = container.querySelector('a[href*="/product/"], a[href*="/similar/"]');
      const href = productLink
        ? (productLink.href.startsWith('http') ? productLink.href : `https://www.thredup.com${productLink.getAttribute('href')}`)
        : '';

      if (!href) return null;

      const image = container.querySelector('img[alt]');
      const product = parseAltText(image ? image.alt : '');
      const text = cleanText(container.textContent);
      const price = parseMoney(text);

      if (!product.brand && !product.description && !price && !href) return null;

      return {
        status: filterName === 'sold' ? 'Sold' : 'For Sale',
        brand: product.brand,
        description: product.description,
        price,
        url: href,
        scrapedAt: new Date().toISOString()
      };
    }).filter(Boolean));
  }

  async function main() {
    const overlay = buildOverlay();

    try {
      const filterName = getCurrentFilter();
      setStatus(`Collecting ${filterName} items from the current page...`);
      const items = scrapeItems(filterName);
      if (!items.length) throw new Error('No ThreadUp items were found. Scroll the page to load listings, then run the scraper again.');

      const stage = readStage();
      stage[filterName] = items;
      writeStage(stage);

      const soldItems = stage.sold;
      const availableItems = stage.available;

      if (!soldItems || !availableItems) {
        const missing = !soldItems ? 'Sold' : 'Available';
        setStatus(`Captured ${items.length} ${filterName} items.<br><br>${missing} filter still needed before sync.`);
        setTimeout(() => overlay.remove(), 6000);
        return;
      }

      const combinedItems = dedupeByUrl([].concat(soldItems, availableItems));

      setStatus(`Captured both filters.<br><br>Sold: ${soldItems.length}<br>Available: ${availableItems.length}<br>Syncing ${combinedItems.length} combined items to Supabase...`);
      const response = await fetch(FUNCTION_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sync_inventory', platform: 'threadup', items: combinedItems })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Sync failed');

      clearStage();
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
