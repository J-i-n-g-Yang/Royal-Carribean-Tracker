# 🚢 Royal Caribbean Casino Royale — Cruise Tools Dashboard

A React app for Royal Caribbean Casino Royale members. Generates direct PDF links for Instant Cruise Certificates (China and Singapore routes) and tracks trip finances across multiple sailings.

![Version](https://img.shields.io/badge/version-3.0-blue.svg)
![React](https://img.shields.io/badge/React-18.1.0-61DAFB?logo=react)
![License](https://img.shields.io/badge/license-MIT-green.svg)

## ✨ Features

**PDF Link Generator** — Select a year and month to instantly generate all certificate PDF links for CHN (CHN01–CHN07) and Singapore (SVIP2, S01–S08 including S02A and S03A) routes, with point values shown for each tier

**Offer Code Lookup** — Enter any offer code (e.g. `2603CHN03`) to get its direct PDF URL, with one-click copy, preview, and open

**PDF Preview** — View certificates directly in the browser with full page navigation

**Copy Links** — Copy individual links, by group (CHN or S), or all links at once

**Trip Finance OS** — Track costs, perks, and casino points across multiple cruises with a live net-cost calculator and aggregate summary

**Dark Mode** — Toggle between light and dark themes

---

## 🔗 PDF URL Format

```
https://www.royalcaribbean.com/content/dam/royal/resources/pdf/casino/offers/YYMM[TYPE][CODE].pdf
```

| Segment | Description |
|---------|-------------|
| YY | 2-digit year (e.g. `26` for 2026) |
| MM | 2-digit month (e.g. `03` for March) |
| TYPE | `CHN` for China, `S` for Singapore |
| CODE | `01`–`07` for CHN; `SVIP2`, `01`–`08` (incl. `02A`, `03A`) for S |

**Examples:**
- `2603CHN03.pdf` → China, March 2026, code 03 (16,088 points)
- `2603S05.pdf` → Singapore, March 2026, code 05 (2,000 points)
- `2603SVIP2.pdf` → Singapore, March 2026, VIP tier 2 (40,000 points)

---

## 📊 Certificate Types & Points

### China (CHN) — 7 Certificates
| Code | Points |
|------|--------|
| CHN01 | 48,088 |
| CHN02 | 28,088 |
| CHN03 | 16,088 |
| CHN04 | 12,888 |
| CHN05 | 6,488 |
| CHN06 | 2,808 |
| CHN07 | 2,088 |

### Singapore (S) — 11 Certificates
| Code | Points |
|------|--------|
| SVIP2 | 40,000 |
| S01 | 25,000 |
| S02 | 15,000 |
| S02A | 9,000 |
| S03 | 6,500 |
| S03A | 4,000 |
| S04 | 3,000 |
| S05 | 2,000 |
| S06 | 1,500 |
| S07 | 1,200 |
| S08 | 800 |

---

## 🗂️ Project Structure

```
src/
├── App.js                     # App shell: tabs, dark mode, PDF modal state
├── index.js                   # React entry point
├── style.css                  # Global styles
├── components/
│   ├── LinkGenerator.jsx      # PDF Generator + Offer Code Lookup tab
│   ├── TripFinanceOS.jsx      # Trip Finance OS tab
│   └── PdfPreviewModal.jsx    # PDF preview modal (shared across tabs)
├── data/
│   └── constants.js           # Certificate codes, points, perk presets
└── utils/
    └── helpers.js             # Link generation, finance calculations, storage
```

---

## 🚀 Getting Started

### Prerequisites
- Node.js v14 or higher
- npm or yarn

### Installation

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/Royal-Carribean.git
cd Royal-Carribean

# Install dependencies
npm install

# Start development server
npm start
```

The app will open at `http://localhost:3000`.

---

## 📦 Deploy to GitHub Pages

1. **Update `package.json`** — replace `YOUR_GITHUB_USERNAME` with your actual username:
   ```json
   "homepage": "https://YOUR_GITHUB_USERNAME.github.io/Royal-Carribean"
   ```

2. **Install and deploy:**
   ```bash
   npm install
   npm run deploy
   ```

3. **Enable GitHub Pages** in your repo:
   - Settings → Pages → Source: `gh-pages` branch → Save

4. **Visit your site** (after 2–3 minutes):
   ```
   https://YOUR_GITHUB_USERNAME.github.io/Royal-Carribean
   ```

### Updating

```bash
git add .
git commit -m "Your update"
git push origin main
npm run deploy
```

---

## 📖 Usage

### Generate Links
1. Go to the **PDF Generator** tab
2. Select a year and month, then click **Generate Links**
3. View all certificates with their point values
4. Copy individual links, a full group, or everything at once

### Lookup an Offer Code
1. Enter a code (e.g. `2603CHN03`) in the Offer Code Lookup box
2. Press **Enter** or click **Lookup**
3. Preview, copy, or open the PDF directly

### Preview a Certificate
1. Click the 📄 icon next to any certificate
2. Navigate pages with the arrow buttons
3. Click **Open Full PDF** to open in a new tab

### Track Trip Finances
1. Go to the **Trip Finance OS** tab
2. Click **Add New Trip** and fill in cruise costs, onboard spending, casino data, and perks received
3. The live summary shows total spent, perks value, and net cost as you type
4. All trips are saved locally in your browser — nothing is sent to any server

---

## 🛠️ Built With

- [React 18.1.0](https://react.dev)
- [Tailwind CSS 4.2.1](https://tailwindcss.com)
- [react-pdf 7.7.0](https://react-pdf.org) — PDF rendering
- [pdfjs-dist 3.11.174](https://mozilla.github.io/pdf.js/) — PDF parsing
- [Lucide React](https://lucide.dev) — icons
- [gh-pages](https://github.com/tschaub/gh-pages) — deployment

---

## 🔄 Changelog

### v3.0
- Restructured project into `components/`, `data/`, and `utils/` folders
- Extracted `LinkGenerator`, `TripFinanceOS`, and `PdfPreviewModal` into standalone components
- Moved all constants to `src/data/constants.js`
- Moved all logic (link generation, finance calculations, storage helpers) to `src/utils/helpers.js`
- Removed unused `Frontend/` and `Backend/` directories

### v2.0
- Added missing Singapore codes: SVIP2, S02A, S03A (11 total)
- Added complete points reference for all 18 certificate types
- Added in-app PDF preview with react-pdf and multi-page navigation
- Added Trip Finance OS for tracking costs and casino points
- Added GitHub Pages deployment setup
- Fixed PDF embedding CORS issues

---

## 🤝 Contributing

Contributions welcome. Fork the repo, create a feature branch, and open a PR.

```bash
git checkout -b feature/your-feature
git commit -m "Add your feature"
git push origin feature/your-feature
```

---

## 📝 License

MIT License — see LICENSE file for details.

---

**Made with ❤️ for Royal Caribbean Casino Royale members** · Last updated: April 2026
