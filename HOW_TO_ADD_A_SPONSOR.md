# How to add (or retire) a sponsor

You only need the GitHub website. No code, no software to install.

## Before you start: get the logo right

- **PNG file with a transparent background** (not JPG, not a screenshot with a white box around it).
- **At least 1000 pixels wide** if possible. Smaller logos look blurry.
- **Lowercase name with dashes, no spaces**, e.g. `smith-dental.png`.

Don't worry about empty space around the logo. The app trims it automatically so every logo fills its spot the same way.

If the logo is wrong (too small, not a PNG, no transparent background), the app shows a yellow **"Logo check"** note under the sponsor dropdown when that sponsor is picked.

## Step 1: Upload the logo

1. Go to the repository on GitHub and open the **`logos`** folder.
2. Click **Add file → Upload files**.
3. Drag the PNG in.
4. At the bottom, click **Commit changes**.

## Step 2: Add the sponsor to `sponsors.json`

1. Go back to the main page of the repository and click **`sponsors.json`**.
2. Click the **pencil icon** (Edit this file).
3. Add a line for the new sponsor. Copy an existing line and change it. For example, to add Jones Plumbing:

   ```json
   [
     { "name": "Acme Hardware", "logo": "logos/acme-hardware.png", "tier": "Gold", "active": true },
     { "name": "Smith Dental", "logo": "logos/smith-dental.png", "tier": "Silver", "active": true },
     { "name": "Jones Plumbing", "logo": "logos/jones-plumbing.png", "tier": "Bronze", "active": true }
   ]
   ```

   ⚠️ **Watch the commas.** Every line ends with a comma **except the last one**. If you add a line at the end, put a comma after the line before it.

   **`"tier"`** is the sponsorship level. It's shown as a ribbon on the Sponsor Thank-You post (e.g. "SILVER SPONSOR") and next to the name in the dropdown. `Gold`, `Silver`, `Bronze` and `Platinum` get matching metallic ribbons; any other word (e.g. `"Community"`) gets a green ribbon. Leave `"tier"` out entirely to show no ribbon.

4. Click **Commit changes…**, then **Commit changes** again.

## Step 3: Check it

Wait a minute or two, then open the app and refresh the page. The new sponsor will be in the dropdown.

If the app shows a red message saying `sponsors.json has a formatting mistake`, there's usually a missing or extra comma or quote mark. Open the file again and compare it carefully with the example above.

## Retiring a sponsor

Don't delete them. That keeps the history. Change `"active": true` to `"active": false`:

```json
{ "name": "Riverbend Bakery", "logo": "logos/riverbend-bakery.png", "active": false }
```

They disappear from the dropdown but stay in the file.

## Optional: white logos

Sponsor logos always sit in a white box with a gold border. If a sponsor's logo is **white or very light**, add `"plate": "dark"` so the box is dark instead:

```json
{ "name": "Night Owl Cafe", "logo": "logos/night-owl-cafe.png", "active": true, "plate": "dark" }
```

## Replacing a sponsor's logo

Upload the new file to `logos` with **exactly the same name** as the old one. GitHub will replace it. Wait a minute or two, then refresh the app.
