(function () {
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

  function buildOverlay() {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:20px;right:20px;z-index:2147483647;max-width:420px;padding:18px 20px;border-radius:16px;background:#111827;color:#f8fafc;box-shadow:0 20px 40px rgba(15,23,42,.35);font:14px/1.5 Arial,sans-serif';
    overlay.innerHTML = '<strong style="display:block;font-size:15px;margin-bottom:8px;">ThreadUp All Scraper</strong><div id="threadup-all-status">Starting...</div>';
    document.body.appendChild(overlay);
    return overlay;
  }

  function setStatus(message) {
    const target = document.getElementById('threadup-all-status');
    if (target) target.innerHTML = message;
  }

  async function autoScrollListings() {
    let previousHeight = 0;
    let stableRounds = 0;

    for (let round = 0; round < 35; round += 1) {
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' });
      await new Promise((resolve) => setTimeout(resolve, 1400));
      const currentHeight = document.body.scrollHeight;

      if (currentHeight === previousHeight) stableRounds += 1;
      else stableRounds = 0;

      previousHeight = currentHeight;
      if (stableRounds >= 2) break;
    }

    window.scrollTo({ top: 0, behavior: 'instant' });
    await new Promise((resolve) => setTimeout(resolve, 400));
  }

  function exportJson(filename, rows) {
    const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(link.href);
  }

  function isRecommendationHeading(node) {
    const text = cleanText(node?.textContent).toLowerCase();
    return text.includes('based on this collection');
  }

  function getRecommendationStartY() {
    const heading = Array.from(document.querySelectorAll('h1, h2, h3, h4'))
      .find((node) => isRecommendationHeading(node));
    if (!heading) return Number.POSITIVE_INFINITY;
    return heading.getBoundingClientRect().top + window.scrollY;
  }

  function hasSoldLabel(card) {
    return Array.from(card.querySelectorAll('span, div, p'))
      .some((node) => cleanText(node.textContent).toLowerCase() === 'sold');
  }

  function extractBrandAndDescription(title, text) {
    const compactTitle = cleanText(title);
    const compactText = cleanText(text)
      .replace(/^Image \d+ of \d+/i, '')
      .replace(/\bSold\b/i, '')
      .replace(/\bShop similar\b/i, '')
      .replace(/\bDirect listing\b/i, '')
      .replace(/\$[\d,]+(?:\.\d+)?/g, '')
      .trim();

    const titleWords = compactTitle.split(' ');

    for (let i = 1; i <= Math.min(5, titleWords.length); i += 1) {
      const brand = titleWords.slice(0, i).join(' ');
      const rest = compactTitle.slice(brand.length).trim();
      if (rest && compactText.toLowerCase().includes(brand.toLowerCase())) {
        return {
          brand,
          description: rest
        };
      }
    }

    const match = compactText.match(/Direct listing(.+?)(One size|Size\b.*?)(.+)$/i);
    if (match) {
      return {
        brand: cleanText(match[1]),
        description: cleanText(match[3]) || compactTitle
      };
    }

    return {
      brand: titleWords.slice(0, Math.min(3, titleWords.length)).join(' '),
      description: titleWords.slice(Math.min(3, titleWords.length)).join(' ')
    };
  }

  function scrapeAllItems() {
    const recommendationStartY = getRecommendationStartY();
    const links = Array.from(document.querySelectorAll('a[data-inp-label="link-item-card"]'))
      .filter((link) => {
        const href = link.getAttribute('href') || '';
        return href.includes('/product/') || href.includes('/similar/');
      });

    const rows = [];

    links.forEach((link) => {
      const card = link.closest('[class*="item-card"]');
      if (!card) return;

      const cardY = card.getBoundingClientRect().top + window.scrollY;
      if (cardY >= recommendationStartY) return;

      const href = link.href;
      const title = cleanText(link.textContent).replace(/^View Product:\s*/i, '');
      const text = cleanText(card.textContent);
      const price = parseMoney(text);
      const product = extractBrandAndDescription(title, text);
      const status = hasSoldLabel(card) ? 'Sold' : 'For Sale';

      if (!href || !title || !price) return;

      rows.push({
        status,
        brand: cleanText(product.brand),
        description: cleanText(product.description),
        price,
        url: href,
        scrapedAt: new Date().toISOString(),
        title,
        rawText: text
      });
    });

    const seen = new Set();
    return rows.filter((row) => {
      const key = row.url.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  async function syncItems(items) {
    const payload = items.map(({ status, brand, description, price, url, scrapedAt }) => ({
      status,
      brand,
      description,
      price,
      url,
      scrapedAt
    }));

    const response = await fetch(FUNCTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'sync_inventory', platform: 'threadup', items: payload })
    });

    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Sync failed');
    return result;
  }

  async function main() {
    const overlay = buildOverlay();

    try {
      setStatus('Scrolling all view to load items...');
      await autoScrollListings();

      setStatus('Collecting all-view items...');
      const items = scrapeAllItems();
      if (!items.length) throw new Error('No ThreadUp items were found on the all view.');

      const soldCount = items.filter((item) => item.status === 'Sold').length;
      const availableCount = items.filter((item) => item.status === 'For Sale').length;

      exportJson('threadup_all_export.json', items);
      setStatus(`Captured ${items.length} items.<br>Sold: ${soldCount}<br>Available: ${availableCount}<br><br>Downloaded JSON export.`);

      const shouldSync = window.confirm(`Captured ${items.length} items from all view. Sold: ${soldCount}. Available: ${availableCount}. Click OK to sync to Supabase now, or Cancel to export only.`);
      if (!shouldSync) {
        setStatus(`Export complete.<br><br>Items: ${items.length}<br>Sold: ${soldCount}<br>Available: ${availableCount}<br>No sync was performed.`);
        setTimeout(() => overlay.remove(), 8000);
        return;
      }

      setStatus(`Syncing ${items.length} items to Supabase...`);
      const result = await syncItems(items);
      setStatus(`All-view sync complete.<br><br>Items: ${items.length}<br>Sold: ${soldCount}<br>Available: ${availableCount}<br>Newly stamped sold dates: ${result.newlyStampedSoldDates || 0}`);
      setTimeout(() => overlay.remove(), 8000);
    } catch (error) {
      setStatus(`Error: ${error.message}`);
      setTimeout(() => overlay.remove(), 10000);
      throw error;
    }
  }

  main();
})();
