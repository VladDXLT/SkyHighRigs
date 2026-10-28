# SkyHighRigs.com

Skydiving gear rentals, sales, rigging and coaching. *A community, not a company.*

Plain HTML/CSS/JS. No build step, no dependencies. Open `index.html` and it works.

## Edit the site (visual editor)

1. Open `index.html` in **Chrome** or **Edge** (double-click it, or drag it into the browser).
2. Click **✎ Edit site** in the bottom-left corner.
3. Click anything on the page to select it, then:
   - **Type** to change text. Highlight words to style only those words.
   - **Top bar:** font, size, bold / italic / underline, uppercase, text color, alignment, links.
   - **Element tab:** size, weight, line height, letter spacing, spacing above/below, padding, width, position (left / center / right), background, corners, links.
   - **Blue tag** above the selection: ⬑ select the bigger block, ✥ drag to move, ↑ ↓ reorder, ⧉ duplicate, 🗑 delete.
4. **Media tab:** click *Connect project folder* and pick this `SkyHighRigs` folder (one time). Drop photos/videos in; they're saved to `media/`. Drag any thumbnail onto a placeholder on the page. You can also drag files straight from Finder onto a placeholder.
5. **Sections tab:** drag to reorder sections, hide/show, duplicate, delete.
6. **Gear tab:** the rental and sale inventory (containers, canopies, add-ons): names, sizes, specs, prices, photos and booked dates. The rig builder and Gear for Sale update instantly.
7. **Settings tab:** theme colors and fonts, where booking requests go, pickup/delivery options, page title and description.
8. **Save** (or Cmd+S) writes straight into `index.html`. The previous version is backed up in `.backups/` (not uploaded to GitHub).

Undo / redo: Cmd+Z / Shift+Cmd+Z. The editor only shows up when the file is opened from your computer (or with `?edit` in the URL), so visitors never see it.

## Publish changes

The live site is hosted on GitHub Pages from the `main` branch. After saving in the editor:

```bash
cd SkyHighRigs
git add -A
git commit -m "Update site"
git push
```

(Or use GitHub Desktop: commit, then push.) The live site updates in about a minute.

## Booking requests

Request forms (rig rentals, courses, rigging, purchases, contact) open the visitor's email app addressed to the email in **Settings → Booking requests**. To receive requests without the visitor's email app, create a free form at [formspree.io](https://formspree.io) and paste its URL into **Settings → Form endpoint**.

## Custom domain (skyhighrigs.com)

In the repo on GitHub: Settings → Pages → Custom domain → `skyhighrigs.com`, then point the domain's DNS at GitHub Pages (A records `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153` and a `www` CNAME to `<your-username>.github.io`).

## Files

| Path | What it is |
| --- | --- |
| `index.html` | The whole site, including gear inventory and settings (JSON at the bottom) |
| `assets/css/site.css` | Site styles. Colors and fonts at the top in `:root` |
| `assets/js/site.js` | Rig builder, gear for sale, request forms, header, altimeter |
| `editor/` | The visual editor (only loads its UI while editing) |
| `media/` | Your photos and videos |

## Media tips

- Photos: JPG or WebP, about 2000px wide.
- Videos: MP4 (H.264), short loops, under 30 MB. iPhone `.MOV` files may not play everywhere; export as MP4.
- GitHub rejects single files over 100 MB.
