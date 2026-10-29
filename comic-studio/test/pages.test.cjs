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

console.log("pages tests passed");
