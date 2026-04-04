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
    overlay.style.cssText = 'position:fixed;top:20px;right:20px;z-index:2147483647;max-width:360px;padding:18px 20px;border-radius:16px;background:#111827;color:#f8fafc;box-shadow:0 20px 40px rgba(15,23,42,.35);font:14px/1.5 Arial,sans-serif';
    overlay.innerHTML = '<strong style="display:block;font-size:15px;margin-bottom:8px;">depop Sync</strong><div id="resale-sync-status">Starting scrape...</div>';
    document.body.appendChild(overlay);
    return overlay;
  }

  function setStatus(message) {
    const target = document.getElementById('resale-sync-status');
    if (target) target.innerHTML = message;
  }

  function scrapeItems() {
    return Array.from(document.querySelectorAll('li'))
      .filter((item) => item.querySelector('a[href*="/products/"]'))
      .map((item) => {
        const link = item.querySelector('a[href*="/products/"]');
        const href = link ? link.href : '';
        const description = getDescriptionFromUrl(href);
        const text = cleanText(item.textContent);
        const price = parseMoney(text);
        if (!description && !price && !href) return null;
        return {
          status: /sold/i.test(text) ? 'Sold' : 'For Sale',
          brand: getBrand(description),
          description,
          price,
          url: href,
          scrapedAt: new Date().toISOString()
        };
      })
      .filter(Boolean);
  }

  async function main() {
    const overlay = buildOverlay();
    try {
      setStatus('Collecting items from the current page...');
      const items = scrapeItems();
      if (!items.length) throw new Error('No depop items were found. Make sure you are on the profile grid and scroll to load the listings first.');
      setStatus(`Found ${items.length} items. Syncing to Supabase...`);
      const response = await fetch(FUNCTION_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sync_inventory', platform: 'depop', items })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Sync failed');
      setStatus(`Sync complete.<br><br>Items: ${items.length}<br>Supabase inventory updated.`);
      setTimeout(() => overlay.remove(), 6000);
    } catch (error) {
      setStatus(`Error: ${error.message}`);
      setTimeout(() => overlay.remove(), 9000);
      throw error;
    }
  }

  main();
})();

