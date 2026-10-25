# Comic Studio

A free comic page maker that runs entirely in your browser.

Live page: https://beskartooth.github.io/comic-studio/

It is linked from the [Besky Art link tree](https://beskartooth.github.io/) as “Comic Studio — free comic page maker, beta”.

## Privacy

Comic Studio is 100% client-side.

- Images are read from your computer with the browser file picker or drag-and-drop. They are never uploaded.
- Saving a project writes one `.json` file onto your device. Images are embedded in that file. Nothing is sent anywhere.
- PNG and JPG export downloads a picture of the page. The file stays on your device.
- There are no analytics, no accounts, no remote fonts, and no third-party scripts. The fonts in `fonts/` are files in this folder.

The page sets a Content Security Policy that blocks network requests.

## Make a page

1. Pick a page size (standard comic, webtoon strip, square, 16:9, 9:16, or custom pixels). The standard comic preset is a 6.625×10.25 page at 1325×2050 px.
2. Set the page background, gutter width, and the optional panel border (on by default, thin and black).
3. Choose a layout or draw your own cuts.
4. Drop a PNG, JPG, or WebP onto a panel, or click an empty panel to choose a file. Drag to pan. Scroll, or use the zoom slider, to scale. Replace, reset, or remove the image from the side panel.
5. Add lettering: speech bubble, thought bubble, caption, or sound-effect text. Drag to move, drag handles to resize, double-click to edit. Sound effects can rotate. Delete removes the selection.
6. Undo with Ctrl+Z and redo with Ctrl+Y (Ctrl+Shift+Z also redos).
7. Save a project JSON, load it later, or export a full-resolution PNG or JPG at the page size. Export does not include selection handles or other editor chrome.

### Cutting

The page starts as one panel. With the Cut tool, click a start point and an end point. Every panel the line crosses splits along that line, including angled cuts. Hold Shift to snap the cut horizontal or vertical.

Gutters are the gap between panels along a cut. Switch to Select and click a gutter to delete that cut and merge the panels back together. If both sides had an image, the larger panel’s image is kept.

Layouts (six-panel grid, three tiers, four-panel grid, splash plus two, vertical strip, slanted action) are just starter cuts. You can keep cutting them or remove gutters afterward.

### Shortcuts

| Key | Action |
| --- | --- |
| V | Select |
| C | Cut |
| B | Speech bubble |
| T | Thought bubble |
| K | Caption |
| S | Sound effect |
| Delete / Backspace | Delete lettering, or remove the selected panel’s image |
| Ctrl+Z / Ctrl+Y | Undo / redo |
| Ctrl+S | Save project |
| Shift | Snap a cut, tail, or rotation |
| Esc | Cancel a cut, or return to Select |

## Fonts

These open-licensed fonts are stored in this folder. Licenses are SIL Open Font License 1.1, next to each family:

- Comic Neue — Craig Rozynski and contributors (`fonts/comic-neue/OFL.txt`)
- Bangers — Vernon Adams and contributors (`fonts/bangers/OFL.txt`)
- Lilita One — Juan Montoreano and contributors (`fonts/lilita-one/OFL.txt`)

## Local preview

GitHub Pages serves this folder as a static site. To try it on your machine, open the repo root with any static file server and visit `/comic-studio/`. Example:

```bash
python3 -m http.server
```

Geometry checks (no browser needed):

```bash
node comic-studio/test/geometry.test.cjs
```

## Limits

- One page per project. There is no multi-page document.
- Cuts are straight lines. Panels are the polygons those lines make, so a cut has to actually divide a panel.
- Removing a gutter merges the panels it separated. A branch cut that no longer divides the page is dropped with it. Undo brings the previous layout back.
- If two panels both have images when they merge, the larger panel’s image is the one that remains.
- Page width and height are limited to 64–8192 pixels. Very large images use more memory, and undo keeps them until that step leaves the history.
- Text wraps simply inside each shape. Desktop Chrome and Edge are the browsers this was built for.
