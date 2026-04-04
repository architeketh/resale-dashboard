(function() {
  const CONFIG = {
    owner: 'architeketh',
    repo: 'resale-dashboard',
    branch: 'main',
    dataFile: 'data/threadup.json',
    statusFile: 'data/sync-status.json',
    tokenKey: 'resale_dashboard_github_token'
  };

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
    overlay.style.cssText = [
      'position:fixed','top:20px','right:20px','z-index:2147483647','max-width:360px',
      'padding:18px 20px','border-radius:16px','background:#111827','color:#f8fafc',
      'box-shadow:0 20px 40px rgba(15,23,42,0.35)','font:14px/1.5 Arial,sans-serif'
    ].join(';');
    overlay.innerHTML = '<strong style="display:block;font-size:15px;margin-bottom:8px;">ThreadUp Sync</strong><div id="resale-sync-status">Starting scrape...</div>';
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
        platform: 'ThreadUp',
        status: /sold/i.test(text) ? 'Sold' : 'For Sale',
        brand: product.brand,
        description: product.description,
        price,
        url: href,
        scrapedAt: new Date().toISOString()
      };
    }).filter(Boolean);
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
    statusData.platforms.threadup = platformSummary;

    await putRepoFile(token, CONFIG.statusFile, statusData, 'Update sync status from ThreadUp scraper');
  }

  async function main() {
    const overlay = buildOverlay();

    try {
      setStatus('Collecting items from the current page...');
      const items = scrapeItems();
      if (!items.length) throw new Error('No ThreadUp items were found. Scroll the page to load listings, then run the scraper again.');

      const summary = summarize(items);
      setStatus(`Found ${summary.count} items. Uploading JSON to GitHub...`);

      const token = await getToken();
      await putRepoFile(token, CONFIG.dataFile, items, 'Update ThreadUp inventory data');
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
