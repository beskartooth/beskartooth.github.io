/* Warp and skew travel with the letter, the style, and the project file. */
var assert = require("assert");
var Doc = require("../js/document.js");

var session = Doc.createSession();
var letter = session.addLetter("sfx", { x: 30, y: 40, w: 420, h: 160 });
session.updateLetter(letter.id, {
  text: "WARP",
  warp: "arc",
  warpAmount: 60,
  skewX: 12,
  skewY: -4,
  perspective: 0.25
});
assert.strictEqual(session.doc.letters[0].warp, "arc");
assert.strictEqual(session.doc.letters[0].warpAmount, 60);
assert.strictEqual(session.doc.letters[0].text, "WARP");

var next = Doc.createSession();
next.loadJSON(session.toJSON());
var loaded = next.doc.letters[0];
assert.strictEqual(loaded.warp, "arc");
assert.strictEqual(loaded.warpAmount, 60);
assert.strictEqual(loaded.skewX, 12);
assert.strictEqual(loaded.skewY, -4);
assert.strictEqual(loaded.perspective, 0.25);

var src = JSON.parse(JSON.stringify(loaded));
delete src.id;
next.addPage();
var pasted = next.pasteLetter(src, 16, 16);
assert.strictEqual(pasted.warp, "arc");
assert.strictEqual(pasted.warpAmount, 60);
assert.strictEqual(pasted.text, "WARP");
assert.strictEqual(pasted.x, loaded.x + 16);
assert.strictEqual(next.applyLetterStyle(pasted.id, {
  type: "sfx",
  warp: "wave",
  warpAmount: -40,
  skewX: 0,
  skewY: 8,
  perspective: 0,
  font: "Bangers",
  fontWeight: 400,
  fontStyle: "normal",
  fontSize: 90,
  fill: "#ffe14a",
  stroke: "#111111",
  strokeWidth: 10,
  shapeFill: "#ffffff",
  shapeStroke: "#111111",
  shapeStrokeWidth: 0,
  rotation: -6,
  tail: null
}), true);
var styled = next.doc.letters[0];
assert.strictEqual(styled.warp, "wave");
assert.strictEqual(styled.warpAmount, -40);
assert.strictEqual(styled.skewY, 8);
assert.strictEqual(styled.text, "WARP");

console.log("warp tests passed");
