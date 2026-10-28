/* Lettering styles keep the look and leave the words and position alone. */
var assert = require("assert");
var Doc = require("../js/document.js");

var impact = {
  type: "sfx",
  font: "Anton",
  fontWeight: 400,
  fontStyle: "normal",
  fontSize: 120,
  fill: "#ffe14a",
  stroke: "#141414",
  strokeWidth: 16,
  shapeFill: "#ffffff",
  shapeStroke: "#161616",
  shapeStrokeWidth: 0,
  rotation: -6,
  tail: null,
  text: "should-not-copy",
  x: 9,
  y: 9
};

var session = Doc.createSession();
var bubble = session.addLetter("bubble", { x: 40, y: 50, w: 340, h: 210 });
bubble.tail.dx = 12;
bubble.tail.dy = 80;
var text = bubble.text;
assert.strictEqual(session.applyLetterStyle(bubble.id, impact), true);
var styled = session.doc.letters[0];
assert.strictEqual(styled.type, "sfx");
assert.strictEqual(styled.font, "Anton");
assert.strictEqual(styled.fontSize, 120);
assert.strictEqual(styled.fill, "#ffe14a");
assert.strictEqual(styled.strokeWidth, 16);
assert.strictEqual(styled.rotation, -6);
assert.strictEqual(styled.tail, null);
assert.strictEqual(styled.text, text);
assert.strictEqual(styled.x, 40);
assert.strictEqual(styled.y, 50);
assert.strictEqual(session.undo(), true);
assert.strictEqual(session.doc.letters[0].type, "bubble");
assert.strictEqual(session.doc.letters[0].text, text);
assert.strictEqual(session.doc.letters[0].tail.dx, 12);

var placed = session.addStyledLetter({
  type: "caption",
  font: "Kalam",
  fontWeight: 400,
  fontStyle: "normal",
  fontSize: 32,
  fill: "#2a241c",
  stroke: "#f3ead7",
  strokeWidth: 0,
  shapeFill: "#f3ead7",
  shapeStroke: "#2a241c",
  shapeStrokeWidth: 3,
  rotation: 0,
  tail: { dx: 10, dy: 10 },
  text: "nope"
});
assert.strictEqual(placed.type, "caption");
assert.strictEqual(placed.font, "Kalam");
assert.strictEqual(placed.text, "Caption");
assert.strictEqual(placed.tail, null);
assert.ok(placed.x > 0 && placed.y > 0);
assert.strictEqual(session.undo(), true);
assert.strictEqual(session.doc.letters.length, 1);
assert.strictEqual(Doc.FONTS.filter(function (font) { return font.family === "Anton"; }).length, 1);

console.log("styles tests passed");
