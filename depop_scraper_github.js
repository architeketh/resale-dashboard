(function() {
  const CONFIG = {
    owner: 'architeketh',
    repo: 'resale-dashboard',
    branch: 'main',
    dataFile: 'data/depop.json',
    statusFile: 'data/sync-status.json',
    tokenKey: 'resale_dashboard_github_token'
  };

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

  async function getToken() {
    let token = localStorage.getItem(CONFIG.tokenKey);
    if (token) return token;

    token = window.prompt('Paste a GitHub personal access token with repo access for architeketh/resale-dashboard:');
    if (!token) throw new Error('No token provided.');

    token = token.trim();
    localStorage.setItem(CONFIG.tokenKey, token);
    return token;
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
          platform: 'Depop',
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

  function summarize(items) {
    const sold = items.filter((item) => item.status === 'Sold');
    const listed = items.filter((item) => item.status === 'For Sale');
    return {
      count: items.length,
      soldCount: sold.length,
      listedCount: listed.length,
      revenue: sold.reduce((sum, item) => sum + (item.price || 0), 0),
      updatedAt: new Date().toISOString()
    };
  }

  async function getRepoFile(token, path) {
    const response = await fetch(`https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${path}?ref=${CONFIG.branch}`, {
      headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github+json' }
    });

    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`GitHub read failed (${response.status})`);
    return response.json();
  }

  async function putRepoFile(token, path, payload, message) {
    const existing = await getRepoFile(token, path);
    const body = {
      message,
      branch: CONFIG.branch,
      content: btoa(unescape(encodeURIComponent(JSON.stringify(payload, null, 2))))
    };

    if (existing && existing.sha) body.sha = existing.sha;

    const response = await fetch(`https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${path}`, {
      method: 'PUT',
      headers: {
        Authorization: `token ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`GitHub write failed (${response.status}): ${errorText}`);
    }
  }

  async function updateSyncStatus(token, platformSummary) {
    const existing = await getRepoFile(token, CONFIG.statusFile);
    let statusData = { lastUpdated: platformSummary.updatedAt, platforms: {} };

    if (existing && existing.content) {
      try {
        statusData = JSON.parse(decodeURIComponent(escape(atob(existing.content.replace(/\n/g, '')))));
      } catch (error) {
        statusData = { lastUpdated: platformSummary.updatedAt, platforms: {} };
      }
    }

    statusData.lastUpdated = platformSummary.updatedAt;
    statusData.platforms.depop = platformSummary;

    await putRepoFile(token, CONFIG.statusFile, statusData, 'Update sync status from Depop scraper');
  }

  async function main() {
    const overlay = buildOverlay();

    try {
      setStatus('Collecting items from the current page...');
      const items = scrapeItems();
      if (!items.length) throw new Error('No Depop items were found. Make sure you are on the profile grid and scroll to load the listings first.');

      const summary = summarize(items);
      setStatus(`Found ${summary.count} items. Uploading JSON to GitHub...`);

      const token = await getToken();
      await putRepoFile(token, CONFIG.dataFile, items, 'Update Depop inventory data');
      await updateSyncStatus(token, summary);

      setStatus(`Upload complete.<br><br>Items: ${summary.count}<br>Sold: ${summary.soldCount}<br>Listed: ${summary.listedCount}`);
      setTimeout(() => overlay.remove(), 6000);
    } catch (error) {
      setStatus(`Error: ${error.message}`);
      setTimeout(() => overlay.remove(), 9000);
      throw error;
    }
  }

  main();
})();
