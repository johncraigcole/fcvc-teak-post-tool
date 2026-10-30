# How to add (or retire) a team logo

Teams in the shared list show up under **Saved teams** on the Upcoming Tournament post, so volunteers can tap them instead of finding the logo every time. You only need the GitHub website.

A logo that isn't in the list can still be added for a single post: tap an empty circle in the app and pick it from the phone or computer.

## Before you start: get the logo right

- **PNG file**, ideally with a transparent background (a white background is fine too; it just sits in the white circle). Not JPG: this repository blocks JPGs so game photos never end up in it. If a team only has a JPG, open it and save or export it as PNG first.
- **At least 500 pixels wide.** Team logos are shown small, so they don't need to be huge.
- **Name it club first, team name last**, lowercase with dashes, e.g. `london-fire-vortex.png` (club "London Fire", team "Vortex"). Everything before the last dash is the club.

Don't worry about empty space around the logo. The app trims it automatically.

## Step 1: Upload the logo

1. Go to the repository on GitHub and open the **`logos`** folder, then the **`teams`** folder.
2. Click **Add file → Upload files**.
3. Drag the logo in.
4. At the bottom, click **Commit changes**.

## Step 2: Add the team to `teams.json`

1. Go back to the main page of the repository and click **`teams.json`**.
2. Click the **pencil icon** (Edit this file).
3. Add a line for the team. Copy an existing line and change it. For example:

   ```json
   [
     {"name": "London Fire Vortex", "club": "London Fire", "team": "Vortex", "logo": "logos/teams/london-fire-vortex.png", "active": true},
     {"name": "Waterloo Tigers Thunder", "club": "Waterloo Tigers", "team": "Thunder", "logo": "logos/teams/waterloo-tigers-thunder.png", "active": true}
   ]
   ```

   If the file is just `[]` (no teams yet), replace it with `[`, your line, and `]`, as above.

   **`"name"`** is what volunteers see under Saved teams. `"club"` and `"team"` are kept separately so captions can use them later.

   ⚠️ **Watch the commas.** Every line ends with a comma **except the last one**.

4. Click **Commit changes…**, then **Commit changes** again.

## Step 3: Check it

Wait a minute or two, then open the app, refresh the page and pick **Upcoming Tournament**. The team will be under **Saved teams**.

If the app says `teams.json has a formatting mistake`, there's usually a missing or extra comma or quote mark. Compare it carefully with the example above.

## Logo circle colour

Logos sit in **white circles** by default, and volunteers can change all the circles on a post under **Logo circle background**. If one team's logo needs a different colour (e.g. a white logo that disappears on white), set it for that team with `"background"`: `"transparent"`, or a colour code like `"#0A0A0A"` (black):

```json
{"name": "Waterloo Tigers Thunder", "club": "Waterloo Tigers", "team": "Thunder", "logo": "logos/teams/waterloo-tigers-thunder.png", "active": true, "background": "#0A0A0A"}
```

## Retiring a team

Change `"active": true` to `"active": false`. The team disappears from Saved teams but stays in the file.

## Replacing a team's logo

Upload the new file to `logos/teams` with **exactly the same name** as the old one. Wait a minute or two, then refresh the app.
