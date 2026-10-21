# Club Post Maker

Turns game photos into consistently branded Instagram and Facebook images, with the club frame and a sponsor logo in exactly the same place every time.

**Live app:** https://johncraigcole.github.io/fcvc-teak-post-tool/

- 🔒 **Photos never leave your phone or laptop.** Everything happens in the browser. Nothing is uploaded or stored anywhere.
- 🖼️ **Photos are never altered.** The app only crops, frames and adds logos and text. No AI.
- 💸 **Free to run.** Static files on GitHub Pages, with no server, accounts or paid services.

---

## For volunteers: making a post

1. Open the app on your phone or computer.
2. **Pick a template:**

   | Template | What it shows | Photos |
   |---|---|---|
   | **Game Day Result** | Score ribbons (TEAK vs opponent), date, "Presented by [sponsor]" | 1 per post |
   | **Player / Moment Highlight** | Your headline (e.g. "Big save!") over a big photo | 1 per post |
   | **Photo Collage** | 2–4 photos in one post. Portrait and landscape can mix | 2–4 per post |
   | **Meet the Team / Coaches** | Photo with up to 3 name ribbons (role + name) | 1 per post |
   | **Next Game** | "VS opponent", date, time and venue | optional |
   | **Tournament Result** | Event name, finish ribbon (gold/silver/bronze colours) and record | 1 per post |
   | **Sponsor Thank-You** | Sponsor tier ribbon (e.g. "SILVER SPONSOR"), big logo, thank-you message. With no sponsor, a general thank-you | none |

3. **Add photos.** Pick one, or several from the same game (batch mode).
4. **Pick the sponsor, or "No sponsor"** (always allowed, on every template), and fill in the details. With no sponsor the "Presented by" row is left out, the photo gets the extra room, captions drop their sponsor sentence, and nothing goes in the sponsor log. Headlines are optional; each template has a default (e.g. "Meet the coaches"). Long headlines split over two lines automatically. To choose where it splits, type a `|`, e.g. `Meet the|Team`.
5. **Adjust the crop** in the preview: drag to move, pinch (or use the slider) to zoom. Switch between **Feed / Story** at the top; each size has its own crop. In Story, the pink bands show where Instagram puts its own buttons. They aren't in the final image.
   - **Show whole photo (no cropping)** fits the entire photo in the window over a blurred copy of itself. It's useful for a landscape shot in a tall post.
6. With several photos, tap a thumbnail to adjust each one's crop. In a collage, tap a photo in the preview to select it. Template, sponsor and details apply to all of them.
   - **Collages** use photos in order: with 4 photos per collage, 10 photos make collages of 4, 4 and 2.
7. Tick the sizes you want and tap **Create images**, or **Create for all**.
8. Save them:
   - **On a phone:** tap **Save to Photos / Share** and choose *Save Images*.
   - **On a computer:** **Download** (separate files) or **Download ZIP**.
9. Copy the ready-made **caption** and post using Meta Business Suite as usual.

| Size | Pixels | Use |
|---|---|---|
| Feed | 1080 × 1350 (4:5) | Instagram and Facebook posts |
| Story | 1080 × 1920 (9:16) | Instagram/Facebook Stories and Reel cover images (keeps ~250px top and bottom clear) |

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
| **Season** ("2026 – 2027") and the small top line ("FCVC · TEAK 16U") | `config.json` → `labels` → `season` / `eyebrow` |
| Default headlines ("FINAL SCORE", "MEET THE COACHES"…) | `config.json` → `headlines` |
| Other wording on the images ("PRESENTED BY", the thank-you message…) | `config.json` → `labels` |
| Caption wording | `config.json` → `captions` |
| Club logo | replace `logos/club-logo.png` (same file name) |

**New season checklist:** update `labels.season`, the `eyebrow` if the age group changes, the club logo if it shows the year, and each sponsor's `tier` in `sponsors.json`.

### `config.json` reference

```jsonc
{
  "clubName": "Forest City Volleyball Club",  // [Club] in captions
  "clubShortName": "TEAK",          // app title and the "our score" ribbon
  "clubLogo": "logos/club-logo.png",
  "sport": "Volleyball",            // [Sport] in captions
  "hashtags": ["#TEAK16U", "#FCVC"], // [Hashtags] = all, [ClubHashtag] = first one without "#"

  "colors": {
    "background": "#0A0A0A", // post background
    "primary": "#2F5233",    // green ribbons, app buttons
    "secondary": "#FFFFFF",  // sponsor logo boxes
    "accent": "#C8A15A",     // gold lines, labels, second headline line
    "text": "#F3EEE2"        // cream headline and names
  },

  "fonts": {
    "display": "Domine",     // serif: headlines, scores, names
    "body": "Poppins",       // spaced capitals and small text
    "googleFontsUrl": "https://fonts.googleapis.com/css2?family=Domine:wght@700&family=Poppins:wght@500;600&display=swap"
  },

  "labels": {
    "eyebrow": "FCVC · TEAK 16U",   // small gold line above every headline
    "season": "2026 – 2027",        // footer of every post
    "presentedBy": "PRESENTED BY",
    "supportLine": "FOR SUPPORTING OUR TEAK 16U TEAM",
    "sponsorWord": "SPONSOR",       // under the tier on the thank-you ribbon
    "thankYouMessage": "Your support helps get our team on the road…",
    "tournamentRibbon": "FINAL STANDING"  // used when no dates & location are entered
  },

  "headlines": { "game-day": "FINAL SCORE", "meet-team": "MEET THE COACHES", "…": "…" },

  "captions": {
    "game-day":  ["Great effort today vs [Opponent]! Final: [Score]. …"],
    "…": ["…"]
  }
}
```

Template keys: `game-day`, `highlight`, `collage`, `meet-team`, `next-game`, `tournament`, `thank-you`.

**Caption placeholders:** `[Opponent]` `[Score]` `[Sponsor]` `[Tier]` `[Date]` `[Time]` `[Venue]` `[Headline]` `[Placing]` `[Record]` `[Club]` `[Hashtags]` `[ClubHashtag]` `[Sport]`. Add as many caption options per template as you like. Volunteers choose from a dropdown. A placeholder whose detail is blank stays visible as e.g. `[Opponent]`, so volunteers can see what's missing.

**Using the club's own font files** instead of Google Fonts: upload them to `fonts/`, remove `googleFontsUrl`, and add:

```json
"files": [
  { "family": "Club Display", "url": "fonts/club-display-bold.woff2", "weight": 700 },
  { "family": "Club Sans", "url": "fonts/club-sans-medium.woff2", "weight": 500 },
  { "family": "Club Sans", "url": "fonts/club-sans-semibold.woff2", "weight": 600 }
]
```

then set `"display": "Club Display"` and `"body": "Club Sans"`.

**Image-based frames (optional):** if a designer supplies a full-size transparent PNG frame, put it in `templates/` and add, for example:

```json
"frameOverlays": {
  "game-day": { "feed": "templates/game-day-feed.png", "story": "templates/game-day-story.png" }
}
```

The PNG must be exactly the output size (1080×1350 or 1080×1920). It's drawn on top of the finished post for that template and size, so leave it transparent wherever the photo, text and logos should show through.

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
