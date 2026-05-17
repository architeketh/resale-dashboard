(function() {
  const FUNCTION_URL = 'https://fuhphebvnstgszapvitz.supabase.co/functions/v1/resale-sync';

  function cleanText(value) {
    return String(value || '').replace(/\s+/g, ' ').replace(/\u00a0/g, ' ').trim();
  }

  function titleCase(value) {
    return cleanText(value).split(' ').filter(Boolean).map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  }

  function parseMoney(value) {
    const match = cleanText(value).match(/\$[\d,]+(?:\.\d+)?/);
    return match ? Number(match[0].replace(/[$,]/g, '')) : 0;
  }

  function canonicalizeDepopUrl(href) {
    try {
      const url = new URL(href, window.location.origin);
      const pathname = url.pathname.replace(/\/+$/, '');
      return `${url.origin}${pathname}`;
    } catch (error) {
      return cleanText(href).replace(/[?#].*$/, '').replace(/\/+$/, '');
    }
  }

  function getDepopProductToken(href) {
    const slug = (canonicalizeDepopUrl(href).split('/products/')[1] || '').split('/')[0];
    if (!slug) return '';
    const parts = slug.split('-').filter(Boolean);
    return parts.length ? parts[parts.length - 1].toLowerCase() : '';
  }

  function getDescriptionFromUrl(href) {
    const slug = (href.split('/products/')[1] || '').split('/')[0];
    if (!slug) return '';

    const parts = slug.split('-').filter(Boolean);
    if (parts.length <= 1) return titleCase(parts.join(' '));

    const trimmed = /^\d+$/.test(parts[parts.length - 1]) ? parts.slice(1, -1) : parts.slice(1);
    return titleCase(trimmed.join(' '));
  }

  function getBrand(description) {
    const normalized = cleanText(description);
    if (!normalized) return '';

    const commonBrands = ['Lululemon', 'Nike', 'Adidas', 'Coach', 'Gucci', 'Louis Vuitton', 'Prada', 'Jordan', 'Disney', 'Hello Kitty'];
    const match = commonBrands.find((brand) => normalized.toLowerCase().includes(brand.toLowerCase()));
    return match || normalized.split(' ')[0];
  }

  function buildOverlay() {
    const overlay = document.createElement('div');
    overlay.style.cssText = [
      'position:fixed','top:20px','right:20px','z-index:2147483647','max-width:360px',
      'padding:18px 20px','border-radius:16px','background:#111827','color:#f8fafc',
      'box-shadow:0 20px 40px rgba(15,23,42,0.35)','font:14px/1.5 Arial,sans-serif'
    ].join(';');
    overlay.innerHTML = '<strong style="display:block;font-size:15px;margin-bottom:8px;">Depop Sync</strong><div id="resale-sync-status">Starting scrape...</div>';
    document.body.appendChild(overlay);
    return overlay;
  }

  function setStatus(message) {
    const target = document.getElementById('resale-sync-status');
    if (target) target.innerHTML = message;
  }

  async function autoScrollListings() {
    let previousHeight = 0;
    let stableRounds = 0;

    for (let round = 0; round < 35; round += 1) {
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' });
      await new Promise((resolve) => setTimeout(resolve, 1200));
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

  function isSoldItem(item) {
    const exactSoldBadge = Array.from(item.querySelectorAll('span, div, p'))
      .some((node) => cleanText(node.textContent).toLowerCase() === 'sold');

    if (exactSoldBadge) return true;

    const text = cleanText(item.textContent).toLowerCase();
    return /\bsold\b/.test(text) && !/\bfor sale\b/.test(text);
  }

  function getRecommendationMarker() {
    const markers = [
      'Based on this collection',
      'Based on this item',
      'You may also like',
      'More like this'
    ];

    return Array.from(document.querySelectorAll('h1, h2, h3, h4, p, span, div'))
      .find((node) => markers.includes(cleanText(node.textContent)));
  }

  function scrapeItems() {
    const recommendationMarker = getRecommendationMarker();

    const rows = Array.from(document.querySelectorAll('li'))
      .filter((item) => item.querySelector('a[href*="/products/"]'))
      .filter((item) => {
        if (!recommendationMarker) return true;
        const relation = item.compareDocumentPosition(recommendationMarker);
        return Boolean(relation & Node.DOCUMENT_POSITION_FOLLOWING);
      })
      .map((item) => {
        const link = item.querySelector('a[href*="/products/"]');
        const href = link ? canonicalizeDepopUrl(link.href) : '';
        const description = getDescriptionFromUrl(href);
        const text = cleanText(item.textContent);
        const price = parseMoney(text);
        const productToken = getDepopProductToken(href);

        if (!description && !price && !href) return null;

        return {
          platform: 'Depop',
          status: isSoldItem(item) ? 'Sold' : 'For Sale',
          brand: getBrand(description),
          description,
          price,
          url: href,
          sourceKey: productToken ? `depop::${productToken}` : '',
          scrapedAt: new Date().toISOString()
        };
      })
      .filter(Boolean);

    const seen = new Set();
    return rows.filter((item) => {
      const key = (item.url || item.sourceKey || '').toLowerCase();
      if (!key) return false;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  async function main() {
    const overlay = buildOverlay();

    try {
      setStatus('Scrolling profile to load listings...');
      await autoScrollListings();

      setStatus('Collecting items from the current page...');
      const items = scrapeItems();
      if (!items.length) throw new Error('No depop items were found. Make sure you are on the profile grid and scroll to load the listings first.');

      const soldCount = items.filter((item) => item.status === 'Sold').length;
      const listedCount = items.filter((item) => item.status === 'For Sale').length;

      exportJson('depop_export.json', items);
      setStatus(`Found ${items.length} items.<br>Sold: ${soldCount}<br>For sale: ${listedCount}<br><br>Downloaded JSON export.`);

      const shouldSync = window.confirm(`Found ${items.length} Depop items. Sold: ${soldCount}. For sale: ${listedCount}. Click OK to sync to Supabase now, or Cancel to export only.`);
      if (!shouldSync) {
        setStatus(`Export complete.<br><br>Items: ${items.length}<br>Sold: ${soldCount}<br>For sale: ${listedCount}<br>No sync was performed.`);
        setTimeout(() => overlay.remove(), 8000);
        return;
      }

      setStatus(`Found ${items.length} items. Syncing to Supabase...`);
      const response = await fetch(FUNCTION_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sync_inventory', platform: 'depop', items })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Sync failed');

      setStatus(`Sync complete.<br><br>Items: ${items.length}<br>Sold: ${soldCount}<br>For sale: ${listedCount}<br>Newly stamped sold dates: ${result.newlyStampedSoldDates || 0}<br>Supabase inventory updated.`);
      setTimeout(() => overlay.remove(), 6000);
    } catch (error) {
      setStatus(`Error: ${error.message}`);
      setTimeout(() => overlay.remove(), 9000);
      throw error;
    }
  }

  main();
})();
