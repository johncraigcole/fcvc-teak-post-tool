# Club Post Maker

Turns game photos into consistently branded Instagram and Facebook images, with the club frame and a sponsor logo in exactly the same place every time.

**Live app:** https://johncraigcole.github.io/fcvc-teak-post-tool/

- 🔒 **Photos never leave your phone or laptop.** Everything happens in the browser. Nothing is uploaded or stored anywhere.
- 🖼️ **Photos are never altered.** The app only crops, frames and adds logos and text. No AI.
- 💸 **Free to run.** Static files on GitHub Pages, with no server, accounts or paid services.

---

## For volunteers: making a post

1. Open the app on your phone or computer.
2. **Add photos.** Pick one, or several from the same game (batch mode).
3. **Pick a template:**
   - **Game Day Result**: score, opponent, date and "Presented by [sponsor]"
   - **Player / Moment Highlight**: a short headline like "Big save!"
   - **Sponsor Thank-You**: big sponsor logo and a thank-you message
4. **Pick the sponsor** and fill in the details.
5. **Adjust the crop** in the preview: drag to move, pinch (or use the slider) to zoom. Switch between **Feed / Story / Square** at the top; each size has its own crop. In Story, the pink bands show where Instagram puts its own buttons. They aren't in the final image.
6. With several photos, tap a thumbnail to adjust each one's crop. Template, sponsor and details apply to all of them.
7. Tick the sizes you want and tap **Create images**, or **Create for all N photos**.
8. Save them:
   - **On a phone:** tap **Save to Photos / Share** and choose *Save Images*.
   - **On a computer:** **Download** (separate files) or **Download ZIP**.
9. Copy the ready-made **caption** and post using Meta Business Suite as usual.

| Size | Pixels | Use |
|---|---|---|
| Feed | 1080 × 1350 (4:5) | Instagram and Facebook posts |
| Story | 1080 × 1920 (9:16) | Instagram/Facebook Stories (keeps ~250px top and bottom clear) |
| Square | 1080 × 1080 | Carousels, Facebook |

Files are named like `2026-10-18_vs-Riverside_feed_01.jpg`.

### Sponsor log

Every time you create images, the app notes the date, sponsor, template and opponent. Open **Sponsor log** at the bottom to see totals per sponsor, and use **Export CSV** for end-of-season sponsor reports.

> The log is saved **on that device only**. Each volunteer has their own log, and clearing browser data erases it. Export before the end of the season and combine the CSVs. If a shared, central log becomes important, that needs a small backend and is a future project.

---

## For the maintainer

Everything is changed through the GitHub website. Changes are live a minute or two after you commit.

| To change… | Edit |
|---|---|
| Add / retire a sponsor | [HOW_TO_ADD_A_SPONSOR.md](HOW_TO_ADD_A_SPONSOR.md) |
| Club name, colours, fonts, hashtags, sport | `config.json` |
| Caption wording | `config.json` → `captions` |
| Wording on the images ("FULL TIME", "PRESENTED BY"…) | `config.json` → `labels` |
| Club logo | replace `logos/club-logo.png` (same file name) |

### `config.json` reference

```jsonc
{
  "clubName": "Club Name",          // app title, [Club] in captions
  "clubShortName": "CLUB",          // shown as "CLUB VS RIVERSIDE" on result posts
  "clubLogo": "logos/club-logo.png",
  "clubLogoPlate": "none",          // optional: "light" / "dark" plate behind the club logo
  "sport": "Soccer",                // [Sport] in captions
  "hashtags": ["#ClubName", "#GameDay"],   // [Hashtags] = all, [ClubHashtag] = first one without "#"

  "colors": {
    "primary": "#12284C",   // frame, text on white
    "secondary": "#FFFFFF", // sponsor bar and thank-you card
    "accent": "#F5B700",    // labels, highlights
    "text": "#FFFFFF",      // big score / headline text
    "dark": "#0A1628"       // shading behind text on photos
  },

  "fonts": {
    "display": "Anton",     // scores and headlines
    "body": "Inter",        // small text
    "googleFontsUrl": "https://fonts.googleapis.com/css2?family=Anton&family=Inter:wght@400;600;800&display=swap"
  },

  "labels": { "result": "FULL TIME", "presentedBy": "PRESENTED BY", "thankYou": "THANKS TO OUR SPONSOR", "highlight": "HIGHLIGHT" },

  "captions": {
    "game-day":  ["Great effort today vs [Opponent]! Final: [Score]. …"],
    "highlight": ["…"],
    "thank-you": ["…"]
  }
}
```

**Caption placeholders:** `[Opponent]` `[Score]` `[Sponsor]` `[Date]` `[Headline]` `[Club]` `[Hashtags]` `[ClubHashtag]` `[Sport]`. Add as many caption options per template as you like. Volunteers choose from a dropdown. A placeholder whose detail is blank stays visible as e.g. `[Opponent]`, so volunteers can see what's missing.

**Using the club's own font files** instead of Google Fonts: upload them to `fonts/`, remove `googleFontsUrl`, and add:

```json
"files": [
  { "family": "Club Display", "url": "fonts/club-display.woff2", "weight": 400 },
  { "family": "Club Sans", "url": "fonts/club-sans-bold.woff2", "weight": 800 }
]
```

then set `"display": "Club Display"` and `"body": "Club Sans"`.

**Image-based frames (optional):** if a designer supplies a full-size transparent PNG frame, put it in `templates/` and add, for example:

```json
"frameOverlays": {
  "game-day": { "feed": "templates/game-day-feed.png", "story": "templates/game-day-story.png" }
}
```

The PNG must be exactly the output size (1080×1350, 1080×1920 or 1080×1080). It replaces the built-in frame for that template and size. Text and logos are still drawn on top.

### Logo rules

- PNG, transparent background, ideally ≥1000px wide.
- Logos are always scaled to fit their box without stretching. Transparent margins are trimmed automatically.
- The app shows a yellow **Logo check** note if a logo is under 600px wide, isn't a PNG, or has no transparent background.

### ⚠️ Never commit photos

The repository is public. Only logos, fonts, templates and code belong here. `.gitignore` blocks common photo file types for anyone using git, but **uploads through the GitHub website ignore `.gitignore`**, so take care.

---

## Hosting on GitHub Pages (one-time setup)

1. Create a **public** repository on GitHub and upload all these files (keep the folder structure).
2. Go to **Settings → Pages**.
3. Under *Build and deployment*, choose **Deploy from a branch**, branch **main**, folder **/ (root)**, then **Save**.
4. After a minute the site is live at `https://<username>.github.io/<repo-name>/`. Put that link at the top of this README and share it with volunteers. On phones, *Add to Home Screen* makes it feel like an app.

## Running it on your own computer (for testing changes)

The app loads `config.json` with `fetch`, so opening `index.html` by double-clicking won't work. From the project folder, run:

```bash
python3 -m http.server 8765
```

then open http://localhost:8765.

## How it's built

Plain HTML/CSS/JavaScript, no build step, no dependencies.

```
index.html            page layout
css/app.css           styles
js/app.js             UI, photos, crops, saving, captions, sponsor log
js/render.js          output sizes, templates and all drawing (positions live here)
js/zip.js             tiny ZIP writer for "Download ZIP"
config.json           branding, captions, labels
sponsors.json         sponsor list
logos/  fonts/  templates/
```

Template layouts are in `js/render.js` (`TEMPLATES`), with sizes in output pixels. `FORMATS` sets each output size and its Story safe zones.

Photos are downscaled to 2560px on their long side when added (so 10+ photos fit in a phone's memory) and are otherwise only cropped. They exist only in the open browser tab and are gone when it's closed.
