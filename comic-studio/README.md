# Comic Studio

A free comic page maker that runs entirely in your browser.

Live page: https://beskartooth.github.io/comic-studio/

It is linked from the [Besky Art link tree](https://beskartooth.github.io/) as “Comic Studio — free comic page maker, beta”.

## Privacy

Comic Studio is 100% client-side.

- Images are read from your computer with the browser file picker or drag-and-drop. They are never uploaded.
- Saving a project writes one `.json` file onto your device. Images are embedded in that file, including the image bank. Nothing is sent anywhere.
- The image bank is also kept in this browser with IndexedDB so a reload does not clear it. That storage never leaves the device.
- PNG and JPG export downloads a picture of the page. The file stays on your device.
- There are no analytics, no accounts, no remote fonts, and no third-party scripts. The fonts in `fonts/` are files in this folder.

The page sets a Content Security Policy that blocks network requests.

## Make a page

1. Pick a page size (standard comic, webtoon strip, square, 16:9, 9:16, or custom pixels). The standard comic preset is a 6.625×10.25 page at 1325×2050 px.
2. Set the page background, gutter width, and the optional panel border (on by default, thin and black).
3. Choose a layout or draw your own cuts. Blank, the first layout, clears back to one full panel. If a panel has a picture, it asks first. Undo brings the panels back.
4. Drop a PNG, JPG, or WebP onto a panel, or click an empty panel to choose a file. Drag to pan the picture. Scroll over the selected picture, or use the zoom slider, to scale it. Ctrl+scroll over that picture zooms it toward the pointer. Alt+scroll rotates it 1° per notch, and Shift+Alt snaps those turns to 15°. Ctrl+C copies the selected lettering or picture, including text, colors, stroke, rotation, tail, and the picture’s pan, zoom, rotation, and flips. Ctrl+V pastes a copy nudged 16 pixels further each time and selects it. Lettering lands on the page. A picture pastes into the selected panel, keeping that framing. Ctrl+X cuts and Ctrl+D duplicates. If the system clipboard has a newer image than the last in-app copy, Ctrl+V still places that image in the selected panel, or in the bank when no panel is selected. Copy and paste stay out of text fields and the inline lettering editor. You can also rotate with the handle above the picture, the rotation slider, or the degrees field. Shift snaps the handle to 15° steps. Rotate left or right by 90°, flip the picture horizontally or vertically, or reset the rotation. Reset framing puts the picture back to an upright cover fit. Replace or remove the image from the side panel.
5. Add lettering: speech bubble, thought bubble, caption, or sound-effect text. After you place one, the tool returns to Select. Drag to move, drag handles to resize, double-click to edit. Ctrl+scroll resizes the selected lettering, and Alt+scroll rotates it 1° per notch. Delete removes the selection.
6. Undo with Ctrl+Z and redo with Ctrl+Y (Ctrl+Shift+Z also redos). A scroll gesture is one undo step.
7. New, in the top bar, starts a blank single panel at the current page size and clears lettering. If the page has unsaved changes, it asks first. If the image bank has pictures, it asks whether to keep the bank. Undo brings the previous page back.
8. Save a project JSON, load it later, or export a full-resolution PNG or JPG at the page size. Export does not include selection handles or other editor chrome. The project file includes the image bank. A project saved before the bank existed still opens, with an empty bank.

### Image bank

The strip under the page holds pictures you might use. Drop several PNG, JPG, or WebP files onto it, or use Add images and select more than one. Drag a thumbnail onto a panel to place it. Taking a picture off a panel leaves the copy in the bank. A Used badge marks thumbnails that are on the page right now. The × on a thumbnail removes it from the bank only.

The bank is stored in this browser with IndexedDB, so it is still there after a reload. It is also saved inside the project file. Nothing is uploaded. Clear bank removes the thumbnails from this browser; pictures already placed on the page stay until you remove them there.

### Cutting

The page starts as one panel. With the Cut tool, click a start point and an end point. Every panel the line crosses splits along that line, including angled cuts. Hold Shift to snap the cut horizontal or vertical.

Gutters are the gap between panels along a cut. Switch to Select and click a gutter to delete that cut and merge the panels back together. If both sides had an image, the larger panel’s image is kept.

Layouts (blank, six-panel grid, three tiers, four-panel grid, splash plus two, vertical strip, slanted action) are just starter cuts, except Blank, which clears back to one panel. You can keep cutting them or remove gutters afterward.

### View zoom

The strip under the canvas switches pages. Add page, Duplicate, and Delete are on that strip, and you can drag a page number to reorder. Each page keeps its own layout, pictures, and lettering. The image bank and saved styles belong to the whole project. Undo covers every page. Export PNG and Export JPG save the page you are looking at. All PNG and All JPG download every page in one zip. A project saved before pages existed still opens as a single page.

The corner of the page has zoom out, a menu (Fit, 50%, 100%, 200%, 400%), and zoom in. Fit is the whole page in the window. 100% is actual pixels. This only changes the on-screen view. The project and the exported PNG or JPG stay at the page size. Scroll, Space+drag, or middle-mouse drag to pan when you are zoomed in. Ctrl+0 fits the page. Ctrl+1 is 100%. + and − zoom the view. Ctrl+scroll zooms the view toward the pointer, unless the pointer is over the selected picture or lettering, in which case it zooms that instead.

### Shortcuts

The Shortcuts button in the top bar, or the ? key, opens the full list. Esc closes it.

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
| Ctrl+0 / Ctrl+1 | Fit the page / 100% view |
| + / − | Zoom the view in or out |
| Scroll | Scroll the page, or zoom the selected picture when the pointer is over it |
| Ctrl+scroll | Zoom the view, or zoom the selected picture or lettering under the pointer |
| Alt+scroll | Rotate the picture or selected lettering 1° per notch |
| Ctrl+C / Ctrl+X | Copy or cut the selected lettering or picture |
| Ctrl+V | Paste the copy (nudged each time), or a newer clipboard image into the panel or bank |
| Ctrl+D | Duplicate the selection |
| Shift+Alt+scroll | Rotate in 15° steps |
| Space+drag, middle-mouse drag | Pan the view |
| Shift | Snap a cut, tail, or rotation to a straight step |
| ? | Open the shortcuts panel |

A tip line under the page suggests one short trick at a time. Next moves to the next tip. Hide stores “don’t show tips” on this device. The first visit shows a short tour of cuts, pictures, and lettering, then points at Save and Shortcuts. Skip closes it. Replay it from the Shortcuts panel.

Select lettering and choose Save style to keep the font, size, colors, outline, rotation, and bubble styling without the words or the position. The Styles list applies that look to the selection, or places a new item. Rename and delete are on each row. Styles stay on this device and are also stored in the project file. Opening a project merges its styles with the ones already saved here. Impact SFX, Whisper, Shout, and Narration caption are built in the first time.
| Esc | Close shortcuts, cancel a cut, or return to Select |

## Fonts

These open-licensed fonts are stored in this folder. Licenses are SIL Open Font License 1.1, next to each family:

- Comic Neue — Craig Rozynski and contributors (`fonts/comic-neue/OFL.txt`)
- Bangers — Vernon Adams and contributors (`fonts/bangers/OFL.txt`)
- Lilita One — Juan Montoreano and contributors (`fonts/lilita-one/OFL.txt`)
- Anton — The Anton Project Authors (`fonts/anton/OFL.txt`)
- Bungee — The Bungee Project Authors (`fonts/bungee/OFL.txt`)
- Titan One — Rodrigo Fuenzalida (`fonts/titan-one/OFL.txt`)
- Alfa Slab One — JM Solé (`fonts/alfa-slab-one/OFL.txt`)
- Shrikhand — Jonny Pinhorn (`fonts/shrikhand/OFL.txt`)
- Creepster — Font Diner (`fonts/creepster/OFL.txt`)
- Patrick Hand — Patrick Wagesreiter (`fonts/patrick-hand/OFL.txt`)
- Kalam — Indian Type Foundry (`fonts/kalam/OFL.txt`)

## Local preview

GitHub Pages serves this folder as a static site. To try it on your machine, open the repo root with any static file server and visit `/comic-studio/`. Example:

```bash
python3 -m http.server
```

Geometry checks (no browser needed):

```bash
node comic-studio/test/geometry.test.cjs
node comic-studio/test/clipboard.test.cjs
node comic-studio/test/styles.test.cjs
```

## Limits

- One page per project. There is no multi-page document.
- Cuts are straight lines. Panels are the polygons those lines make, so a cut has to actually divide a panel.
- Removing a gutter merges the panels it separated. A branch cut that no longer divides the page is dropped with it. Undo brings the previous layout back.
- If two panels both have images when they merge, the larger panel’s image is the one that remains.
- Page width and height are limited to 64–8192 pixels. Very large images use more memory, and undo keeps them until that step leaves the history.
- Text wraps simply inside each shape. Desktop Chrome and Edge are the browsers this was built for.
- Image rotation is stored in the same project file. A project saved before rotation existed still opens; those pictures come back upright and unflipped.
