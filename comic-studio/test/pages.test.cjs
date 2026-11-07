/* Multi-page projects keep each page separate and still open old files. */
var assert = require("assert");
var Doc = require("../js/document.js");

var session = Doc.createSession();
assert.strictEqual(session.pageCount(), 1);
var first = session.addLetter("bubble", { x: 20, y: 30, w: 200, h: 120 });
session.updateLetter(first.id, { text: "Page one" });
assert.strictEqual(session.addPage(), true);
assert.strictEqual(session.pageCount(), 2);
assert.strictEqual(session.pageIndex(), 1);
assert.strictEqual(session.doc.letters.length, 0);
assert.strictEqual(session.goToPage(0), true);
assert.strictEqual(session.doc.letters[0].text, "Page one");
assert.strictEqual(session.goToPage(0), false);

var payload = JSON.parse(JSON.stringify(session.doc.letters[0]));
delete payload.id;
assert.strictEqual(session.goToPage(1), true);
var pasted = session.pasteLetter(payload, 16, 16);
assert.strictEqual(pasted.text, "Page one");
assert.strictEqual(pasted.x, first.x + 16);
assert.strictEqual(session.pageAt(0).letters.length, 1);
assert.strictEqual(session.pageAt(1).letters.length, 1);

session.addBankItems([{ dataUrl: "data:image/png;base64,aaaa", name: "dot", width: 2, height: 2 }]);
assert.strictEqual(session.doc.bank.length, 1);
assert.strictEqual(session.pageAt(0).bank, session.pageAt(1).bank);

assert.strictEqual(session.duplicatePage(), true);
assert.strictEqual(session.pageCount(), 3);
assert.strictEqual(session.doc.letters[0].text, "Page one");
assert.notStrictEqual(session.doc.letters[0].id, pasted.id);

assert.strictEqual(session.movePage(2, 0), true);
assert.strictEqual(session.pageIndex(), 0);
assert.strictEqual(session.pageAt(0).letters[0].text, "Page one");

assert.strictEqual(session.deletePage(), true);
assert.strictEqual(session.pageCount(), 2);
assert.strictEqual(session.undo(), true);
assert.strictEqual(session.pageCount(), 3);

var legacy = {
  type: "comic-studio",
  version: 1,
  page: { width: 800, height: 600, background: "#ffffff", gutter: 10, border: { enabled: true, color: "#111111", width: 4 } },
  panels: [{
    id: "p1",
    points: [{ x: 0, y: 0 }, { x: 800, y: 0 }, { x: 800, y: 600 }, { x: 0, y: 600 }],
    edgeCuts: [null, null, null, null],
    image: null
  }],
  letters: [{
    id: "l1", type: "caption", x: 10, y: 12, w: 200, h: 80, rotation: 0,
    font: "Comic Neue", fontWeight: 700, fontStyle: "normal", fontSize: 30,
    fill: "#111111", stroke: "#ffffff", strokeWidth: 0,
    shapeFill: "#fffdf6", shapeStroke: "#111111", shapeStrokeWidth: 4,
    text: "Old file", tail: null
  }],
  bank: []
};
session.loadJSON(legacy);
assert.strictEqual(session.pageCount(), 1);
assert.strictEqual(session.doc.letters[0].text, "Old file");
assert.strictEqual(session.doc.page.width, 800);

var saved = session.toJSON();
assert.strictEqual(saved.version, 2);
assert.strictEqual(saved.pages.length, 1);
session.addPage();
session.addLetter("sfx", { x: 1, y: 2, w: 200, h: 80 });
var round = session.toJSON();
var next = Doc.createSession();
next.loadJSON(round);
assert.strictEqual(next.pageCount(), 2);
assert.strictEqual(next.pageAt(1).letters[0].type, "sfx");
assert.strictEqual(next.pageAt(0).letters[0].text, "Old file");

assert.strictEqual(session.doc.page.dots.enabled, false);
assert.strictEqual(session.doc.page.dots.size, 6);
session.patchPage({ dots: { enabled: true, size: 10, strength: 40 } });
var dotted = JSON.parse(JSON.stringify(session.toJSON()));
assert.strictEqual(dotted.pages[session.pageIndex()].page.dots.enabled, true);
assert.strictEqual(dotted.pages[session.pageIndex()].page.dots.size, 10);
assert.strictEqual(dotted.pages[session.pageIndex()].page.dots.strength, 40);
var legacy = JSON.parse(JSON.stringify(session.toJSON()));
delete legacy.pages[0].page.dots;
delete legacy.pages[1].page.dots;
var old = Doc.createSession();
old.loadJSON(legacy);
assert.strictEqual(old.doc.page.dots.enabled, false);
assert.strictEqual(old.doc.page.dots.size, 6);
old.patchPage({ dots: { enabled: true, size: 8, strength: 90 } });
old.setPageSize(old.doc.page.width * 2, old.doc.page.height * 2);
assert.strictEqual(old.doc.page.dots.enabled, true);
assert.ok(old.doc.page.dots.size > 8 && old.doc.page.dots.size <= 22);

assert.strictEqual(session.doc.page.grade.look, "none");
assert.strictEqual(session.doc.page.grade.contrast, 0);
session.patchPage({ grade: { contrast: 40, look: "pencil", warmth: 15 } });
var graded = JSON.parse(JSON.stringify(session.toJSON()));
var gpage = graded.pages[session.pageIndex()].page.grade;
assert.strictEqual(gpage.contrast, 40);
assert.strictEqual(gpage.look, "pencil");
assert.strictEqual(gpage.warmth, 15);
assert.strictEqual(gpage.exposure, 0);
var bare = JSON.parse(JSON.stringify(session.toJSON()));
bare.pages.forEach(function (p) { delete p.page.grade; });
var migrated = Doc.createSession();
migrated.loadJSON(bare);
assert.strictEqual(migrated.doc.page.grade.look, "none");
assert.strictEqual(migrated.doc.page.grade.contrast, 0);
var before = migrated.doc.page.grade.contrast;
migrated.setPageSize(migrated.doc.page.width * 2, migrated.doc.page.height * 2);
assert.strictEqual(migrated.doc.page.grade.contrast, before);
var letter = migrated.addLetter("sfx", { x: 10, y: 10, w: 200, h: 80 });
assert.strictEqual(letter.sketch, 0);
assert.strictEqual(letter.halftone, false);
assert.strictEqual(letter.highlightWidth, 0);
migrated.updateLetter(letter.id, { sketch: 60, highlight: "#ffee88", highlightWidth: 18, halftone: true, fill: "#112233" });
var savedLetter = JSON.parse(JSON.stringify(migrated.toJSON()));
var again = Doc.createSession();
again.loadJSON(savedLetter);
var back = null;
for (var pi = 0; pi < again.pageCount(); pi++) {
  again.pageAt(pi).letters.forEach(function (l) { if (l.fill === "#112233") back = l; });
}
assert.ok(back, "saved letter missing");
assert.strictEqual(back.sketch, 60);
assert.strictEqual(back.highlight, "#ffee88");
assert.strictEqual(back.highlightWidth, 18);
assert.strictEqual(back.halftone, true);
assert.strictEqual(back.fill, "#112233");

var pic = Doc.createSession();
assert.strictEqual(pic.setImage(pic.doc.panels[0].id, { dataUrl: "data:image/png;base64,aaaa", width: 8, height: 8, name: "pic" }), true);
pic.setImageGrade(pic.doc.panels[0].id, { exposure: 25, contrast: -10, warmth: 5 });
var packed = pic.toJSON();
assert.strictEqual(packed.pages[0].panels[0].image.grade.exposure, 25);
assert.strictEqual(packed.pages[0].panels[0].image.grade.contrast, -10);
assert.strictEqual(packed.pages[0].panels[0].image.grade.look, "none");
var copied = pic.pastePanelImage(pic.doc.panels[0].id, packed.pages[0].panels[0].image, 12, 0);
assert.strictEqual(copied, true);
assert.strictEqual(pic.doc.panels[0].image.grade.warmth, 5);
delete packed.pages[0].panels[0].image.grade;
var oldPic = Doc.createSession();
oldPic.loadJSON(packed);
assert.strictEqual(oldPic.doc.panels[0].image.grade.exposure, 0);
assert.strictEqual(oldPic.doc.panels[0].image.grade.look, "none");

console.log("pages tests passed");
