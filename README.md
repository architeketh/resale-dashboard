# Resale Dashboard

A static GitHub Pages dashboard for tracking ThreadUp and depop inventory with Supabase as the backend.

## What This App Does

- Scrapes inventory from:
  - ThreadUp
  - depop
- Syncs scraped items into Supabase through the `resale-sync` Edge Function
- Displays live inventory in a GitHub Pages dashboard
- Captures weekly sold snapshots
- Tracks `first seen sold` dates for sold items
- Exports the current filtered view to CSV or PDF

## Files In This Folder

- `index.html`
  - Main dashboard UI
  - Reads inventory and weekly snapshots from Supabase
  - Lets you refresh, capture weekly stats, and export current views

- `threadup_scraper_github.js`
  - Bookmarklet/browser scraper for ThreadUp
  - Collects visible listings from the current page
  - Sends them to the Supabase `resale-sync` Edge Function

- `depop_scraper_github.js`
  - Bookmarklet/browser scraper for depop
  - Collects visible listings from the profile grid
  - Sends them to the Supabase `resale-sync` Edge Function

- `marketplace_change_agent.py`
  - Local Python watcher that snapshots Supabase inventory
  - Checks public Depop and ThreadUp listing signals
  - Compares the newest snapshot with the previous local run
  - Writes a markdown summary that tells you what changed and whether a scraper run is recommended

- `browser_resale_agent.py`
  - Opens Edge with a reusable local profile
  - Loads Depop, ThreadUp, and the dashboard
  - Injects the existing scraper scripts into the marketplace tabs
  - Runs the summary agent after sync

- `marketplace_change_agent_config.example.json`
  - Optional config template if you want to override URLs, keys, or staleness thresholds

## Tools And Services Used

- GitHub Pages
  - Hosts the public dashboard
  - Also hosts the scraper JS files used by bookmarklets

- Supabase
  - Stores inventory data in `resale_inventory`
  - Stores weekly snapshots in `resale_weekly_snapshots`
  - Hosts the `resale-sync` Edge Function

- Supabase Edge Function: `resale-sync`
  - Receives scraper payloads
  - Syncs inventory rows
  - Preserves `first_seen_sold_at`
  - Saves weekly snapshot records

- Browser bookmarklets
  - Launch the scraper directly on ThreadUp or depop pages
  - Avoid the need to paste code into DevTools

- Frontend stack
  - Plain HTML
  - Plain CSS
  - Plain JavaScript
  - No framework required

## Current Data Flow

1. Open the resale dashboard on GitHub Pages.
2. Drag the scraper install links to the browser bookmarks bar.
3. Visit the ThreadUp or depop page you want to scrape.
4. For ThreadUp, run the scraper twice:
   - once on the `sold` filter
   - once on the `available` filter
5. For depop, run the scraper once on the profile page.
6. The scraper gathers visible listing data from the page.
7. The scraper sends the payload to:
   - `https://fuhphebvnstgszapvitz.supabase.co/functions/v1/resale-sync`
8. The Edge Function writes inventory into Supabase.
9. The dashboard reads from Supabase and renders the updated inventory.

## Current Working Workflow

### ThreadUp

Current reliable process:

1. Open the ThreadUp `sold` filter.
2. Run the bookmarklet.
3. When prompted, type `sold`.
4. Wait for the overlay to confirm that the sold filter was captured.
5. Open the ThreadUp `available` filter.
6. Run the bookmarklet again.
7. When prompted, type `available`.
8. The scraper combines the staged sold and available results and then syncs one payload to Supabase.

Current known-good counts during the April 8, 2026 validation pass:

- Sold: `78`
- Available: `28`
- Total ThreadUp items in dashboard: `106`

Important notes:

- Do not use the ThreadUp `all` filter for production syncing.
- The current scraper intentionally stages `sold` and `available` separately in local browser storage before syncing.
- If only one ThreadUp filter is run, the overlay should report that the other filter is still needed before sync.
- The available-side filtering currently includes a small set of confirmed exclusion rules based on reviewed false positives.

### depop

Current reliable process:

1. Open the depop profile page.
2. Run the depop bookmarklet once.
3. Wait for the sync confirmation overlay.

Current status:

- depop scraping is working with the current live scraper and dashboard flow.

## Change Agent Flow

This folder also includes a local Python summary agent for cross-site monitoring.

What it does:

1. Reads the current resale inventory and weekly snapshot tables from Supabase
2. Fetches the public Depop and ThreadUp pages
3. Stores a local snapshot in `agent_state/latest_snapshot.json`
4. Compares the new snapshot to the previous local run
5. Writes a markdown report in `agent_reports/`
6. Flags platforms that likely need a fresh scraper run

What it does not do yet:

- It does not log into third-party sites
- It does not auto-click bookmarklets inside Depop or ThreadUp
- It does not replace a full browser automation stack like Playwright

That limitation is mostly about browser session access. The current machine has Python available, but not a browser automation runtime preinstalled in this workspace.

### Run It

From this folder:

```powershell
python marketplace_change_agent.py --stdout
```

Helpful options:

```powershell
python marketplace_change_agent.py --open-sites
python marketplace_change_agent.py --config marketplace_change_agent_config.json --stdout
```

### Browser Automation Tryout

This uses a local persistent Edge profile in `agent_browser_profile/` so you can sign in once and reuse that session later.

Recommended first run:

```powershell
python browser_resale_agent.py --headed --pause-for-login
```

That flow:

1. Opens Edge
2. Opens the dashboard, Depop, and ThreadUp
3. Waits for you to sign in or confirm the listing pages are visible
4. Runs the existing page scrapers
5. Builds a fresh summary report

If your session is already good later, you can try:

```powershell
python browser_resale_agent.py --headed
```

Outputs:

- `agent_state/latest_snapshot.json`
- `agent_reports/YYYYMMDD_HHMMSS_marketplace_summary.md`

### Config

If you want to override the built-in URLs or thresholds:

1. Copy `marketplace_change_agent_config.example.json`
2. Rename it to `marketplace_change_agent_config.json`
3. Update only the values you want to change

### Good Use Cases

- Daily or on-demand "what changed?" summaries
- Detecting when Supabase looks stale versus the public listing pages
- Quick before/after checks after you run the bookmarklets manually

## Scraping Process

### ThreadUp

- The scraper searches the current page for item-card style containers
- It auto-scrolls to load more lazy-loaded listings before capture
- It reads:
  - image alt text
  - visible card text
  - price
  - product link
- It fetches product pages to improve brand and description quality
- It stages `sold` and `available` runs separately in browser local storage
- It combines both ThreadUp filters into one final sync payload
- It applies reviewed exclusions on the available filter for known false positives
- It infers:
  - brand
  - description
  - status (`Sold` or `For Sale`)

### depop

- The scraper reads profile-grid list items with product links
- It parses:
  - product URL slug
  - visible text
  - price
- It infers:
  - brand
  - description
  - status (`Sold` or `For Sale`)

## First Seen Sold Logic

This app tracks `first_seen_sold_at`, not the exact marketplace sale timestamp.

How it works:

- When the scraper syncs inventory, the Edge Function compares incoming items to the existing platform inventory
- If an item is now `Sold` and did not previously have `first_seen_sold_at`, the function stamps it
- If the item was already sold earlier, the original sold stamp is preserved

Important note:

- On the first rollout of this feature, items already marked sold will receive the date they were first observed by this tracking system

## Weekly Capture

The `Capture` button on the dashboard:

- does not scrape
- does not change inventory status
- saves a weekly summary for the current platform

It stores:

- week key
- week start
- week end
- sold count
- revenue
- capture timestamp

This data is written to `resale_weekly_snapshots`.

## Refresh

The `Refresh` button:

- reloads inventory from Supabase
- reloads weekly snapshots from Supabase
- redraws the dashboard

It does not scrape or write data.

## Export Tools

Each platform section supports:

- `Export CSV`
  - downloads the current filtered/sorted platform view

- `Export PDF`
  - opens a print-friendly window so the browser can save the current filtered/sorted platform view as PDF

## Supabase Tables

### `resale_inventory`

Expected key fields:

- `platform`
- `status`
- `brand`
- `description`
- `price`
- `url`
- `scraped_at`
- `source_key`
- `first_seen_sold_at`

### `resale_weekly_snapshots`

Expected key fields:

- `platform`
- `week_key`
- `week_start`
- `week_end`
- `label`
- `sold_count`
- `revenue`
- `captured_at`

## Deployment Notes

To update the live dashboard:

1. Upload these files to the `architeketh/resale-dashboard` repo:
   - `index.html`
   - `threadup_scraper_github.js`
   - `depop_scraper_github.js`
2. Wait for GitHub Pages to rebuild
3. Refresh the live site

## Operational Notes

- The scrapers only capture items currently available in the loaded page view
- The ThreadUp scraper now auto-scrolls before capture, but it is still best to confirm the page is fully loaded
- ThreadUp production workflow is `sold` run first, then `available` run second
- Do not use the ThreadUp `all` filter for production syncs unless the scraper is reworked and revalidated
- The dashboard depends on Supabase being available and the `resale-sync` Edge Function being deployed
- JWT verification for the Edge Function should remain off for this bookmarklet-based workflow unless custom auth is added later

## Suggested Future Enhancements

- Recently sold section
- Sold-date-based weekly trend cards
- Search by brand or description
- Automatic detection of newly sold items by week
- More resilient item identity matching across platform changes
