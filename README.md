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
4. Click the matching bookmarklet.
5. The scraper gathers visible listing data from the page.
6. The scraper sends the payload to:
   - `https://fuhphebvnstgszapvitz.supabase.co/functions/v1/resale-sync`
7. The Edge Function writes inventory into Supabase.
8. The dashboard reads from Supabase and renders the updated inventory.

## Scraping Process

### ThreadUp

- The scraper searches the current page for item-card style containers
- It reads:
  - image alt text
  - visible card text
  - price
  - product link
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
- If a site lazy-loads listings, scroll first before running the bookmarklet
- The dashboard depends on Supabase being available and the `resale-sync` Edge Function being deployed
- JWT verification for the Edge Function should remain off for this bookmarklet-based workflow unless custom auth is added later

## Suggested Future Enhancements

- Recently sold section
- Sold-date-based weekly trend cards
- Search by brand or description
- Automatic detection of newly sold items by week
- More resilient item identity matching across platform changes
