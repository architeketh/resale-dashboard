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

  function findContainers() {
    const cards = document.querySelectorAll('[class*="item-card"]');
    const containers = new Set();

    cards.forEach((card) => {
      let parent = card.parentElement;
      while (parent && parent !== document.body) {
        const hasImage = parent.querySelector('[class*="item-card-image"]');
        const hasBody = parent.querySelector('[class*="item-card-body"]');
        if (hasImage && hasBody) {
          containers.add(parent);
          break;
        }
        parent = parent.parentElement;
      }
    });

    return Array.from(containers);
  }

  function scrapeItems() {
    return findContainers().map((container) => {
      const image = container.querySelector('img[alt]');
      const product = parseAltText(image ? image.alt : '');
      const text = cleanText(container.textContent);
      const price = parseMoney(text);
      const link = container.querySelector('a[href*="/product/"]');
      const href = link
        ? (link.href.startsWith('http') ? link.href : `https://www.thredup.com${link.getAttribute('href')}`)
        : '';

      if (!product.brand && !product.description && !price && !href) return null;

      return {
        status: /sold/i.test(text) ? 'Sold' : 'For Sale',
        brand: product.brand,
        description: product.description,
        price,
        url: href,
        scrapedAt: new Date().toISOString()
      };
    }).filter(Boolean);
  }

  async function main() {
    const overlay = buildOverlay();

    try {
      setStatus('Collecting items from the current page...');
      const items = scrapeItems();
      if (!items.length) throw new Error('No ThreadUp items were found. Scroll the page to load listings, then run the scraper again.');

      setStatus(`Found ${items.length} items. Syncing to Supabase...`);
      const response = await fetch(FUNCTION_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sync_inventory', platform: 'threadup', items })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Sync failed');

      setStatus(`Sync complete.<br><br>Items: ${items.length}<br>Newly stamped sold dates: ${result.newlyStampedSoldDates || 0}<br>Supabase inventory updated.`);
      setTimeout(() => overlay.remove(), 6000);
    } catch (error) {
      setStatus(`Error: ${error.message}`);
      setTimeout(() => overlay.remove(), 9000);
      throw error;
    }
  }

  main();
})();
