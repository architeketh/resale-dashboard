# Resale Inventory Dashboard

A beautiful web dashboard to track your ThreadUp and Depop inventory with automatic filtering and statistics.

## 🚀 Live Demo

Upload your Excel files to see your inventory displayed with:
- Total items, sold items, and active listings
- Revenue tracking
- Filter by platform (ThreadUp/Depop)
- Filter by status (Sold/Listed)
- Beautiful responsive design

## 📦 How to Deploy to GitHub Pages

### Step 1: Create a GitHub Repository

1. Go to [GitHub](https://github.com) and create a new repository
2. Name it something like `resale-dashboard` or `inventory-tracker`
3. Make it **Public**
4. Don't initialize with README (you'll upload files)

### Step 2: Upload Files

1. Click **uploading an existing file**
2. Drag and drop the `index.html` file
3. Commit the file

### Step 3: Enable GitHub Pages

1. Go to your repository **Settings**
2. Click **Pages** in the left sidebar
3. Under **Source**, select **main** branch
4. Click **Save**
5. Your site will be live at: `https://YOUR-USERNAME.github.io/REPO-NAME/`

## 📊 How to Use

### Step 1: Scrape Your Data

Use the provided scrapers to get your inventory data:

**ThreadUp Scraper v3** (Updated - detects Sold vs Listed):
```javascript
// Copy threadup_scraper_v3.js and paste in console on ThreadUp page
```

**Depop Scraper**:
```javascript
// Copy depop_scraper.js and paste in console on Depop profile
```

### Step 2: Upload to Dashboard

1. Visit your GitHub Pages site
2. Click "📁 Upload Excel Files"
3. Select your scraped ThreadUp and/or Depop Excel files
4. Dashboard will automatically update with your data!

## ✨ Features

- **📊 Statistics Cards**: See total items, sold count, listings, and revenue at a glance
- **🔍 Smart Filtering**: Filter by platform and status (All/Sold/Listed)
- **💰 Revenue Tracking**: Automatic calculation of total sales
- **📱 Responsive Design**: Works on desktop, tablet, and mobile
- **🎨 Beautiful UI**: Modern gradient design with smooth animations
- **⚡ Fast**: Client-side processing, no server needed

## 🛠️ Technical Details

- Pure HTML/CSS/JavaScript
- Uses SheetJS library for Excel file reading
- No backend required - everything runs in the browser
- No data is uploaded anywhere - all processing is local

## 📝 Data Format

The dashboard expects Excel files with these columns:

**ThreadUp**:
- Platform
- Status (Sold / For Sale)
- Brand
- Description
- Price

**Depop**:
- Platform
- Status (Sold / For Sale)
- Brand
- Description
- Price
- URL

## 🔄 Updating Your Data

1. Re-run the scrapers to get fresh data
2. Upload new Excel files to the dashboard
3. Stats and tables update automatically!

## 💡 Tips

- Upload both ThreadUp and Depop files for complete view
- Use filters to see specific categories
- Revenue only counts sold items
- Prices are automatically formatted as currency

## 🤝 Support

If you have issues:
1. Make sure Excel files are from the provided scrapers
2. Check that files have the correct column headers
3. Try refreshing the page and re-uploading

---

Made with ❤️ for resellers
