/* Paste keeps every lettering and picture property, in one undo step. */
var assert = require("assert");
var Doc = require("../js/document.js");

var png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function cloneLetter(letter) {
  var src = JSON.parse(JSON.stringify(letter));
  delete src.id;
  return src;
}

var session = Doc.createSession();
var sfx = session.addLetter("sfx", { x: 40, y: 80, w: 500, h: 180 });
session.updateLetter(sfx.id, {
  text: "POW",
  fill: "#ff00aa",
  stroke: "#001122",
  strokeWidth: 14,
  shapeFill: "#abcdef",
  shapeStroke: "#101010",
  shapeStrokeWidth: 3,
  rotation: -17,
  fontSize: 96,
  font: "Bangers",
  fontWeight: 400,
  fontStyle: "normal"
});
var pasted = session.pasteLetter(cloneLetter(sfx), 16, 16);
assert.ok(pasted && pasted.id !== sfx.id);
assert.strictEqual(pasted.x, sfx.x + 16);
assert.strictEqual(pasted.y, sfx.y + 16);
assert.strictEqual(pasted.text, "POW");
assert.strictEqual(pasted.fill, "#ff00aa");
assert.strictEqual(pasted.stroke, "#001122");
assert.strictEqual(pasted.strokeWidth, 14);
assert.strictEqual(pasted.shapeFill, "#abcdef");
assert.strictEqual(pasted.shapeStroke, "#101010");
assert.strictEqual(pasted.shapeStrokeWidth, 3);
assert.strictEqual(pasted.rotation, -17);
assert.strictEqual(pasted.fontSize, 96);
assert.strictEqual(pasted.font, "Bangers");
assert.strictEqual(pasted.tail, null);
assert.strictEqual(session.doc.letters.length, 2);
assert.strictEqual(session.undo(), true);
assert.strictEqual(session.doc.letters.length, 1);
assert.strictEqual(session.doc.letters[0].text, "POW");

var bubble = session.addLetter("bubble", { x: 12, y: 24, w: 340, h: 210 });
session.updateLetter(bubble.id, { text: "Hey" });
bubble.tail.dx = 12.5;
bubble.tail.dy = 80;
bubble.fontStyle = "italic";
bubble.fontWeight = 400;
var again = session.pasteLetter(cloneLetter(bubble), 32, 32);
assert.strictEqual(again.text, "Hey");
assert.strictEqual(again.tail.dx, 12.5);
assert.strictEqual(again.tail.dy, 80);
assert.strictEqual(again.fontStyle, "italic");
assert.strictEqual(again.fontWeight, 400);
assert.strictEqual(again.x, bubble.x + 32);
assert.strictEqual(again.y, bubble.y + 32);
assert.strictEqual(session.undo(), true);
assert.ok(!session.doc.letters.some(function (letter) { return letter.id === again.id; }));

var held = cloneLetter(bubble);
session.newPage({ keepBank: true });
assert.strictEqual(session.doc.letters.length, 0);
var afterNew = session.pasteLetter(held, 16, 16);
assert.ok(afterNew);
assert.strictEqual(afterNew.text, "Hey");
assert.strictEqual(afterNew.tail.dx, 12.5);
assert.strictEqual(session.doc.letters.length, 1);

assert.strictEqual(session.applyLayout("four"), true);
assert.strictEqual(session.doc.panels.length, 4);
var sourceId = session.doc.panels[0].id;
var targetId = session.doc.panels[1].id;
assert.strictEqual(session.setImage(sourceId, { dataUrl: png, width: 1, height: 1, name: "dot" }), true);
var img = session.doc.panels[0].image;
img.rotation = 33;
img.flipX = true;
img.flipY = true;
img.scale = img.scale * 1.5;
img.cx += 10;
img.cy -= 4;
var anchor = session.panelAnchor(sourceId);
var payload = {
  id: img.id,
  dataUrl: png,
  width: img.width,
  height: img.height,
  scale: img.scale,
  rotation: img.rotation,
  flipX: true,
  flipY: true,
  relX: img.cx - anchor.x,
  relY: img.cy - anchor.y
};
assert.strictEqual(session.pastePanelImage(targetId, payload, 16, 16), true);
var copy = session.doc.panels.find(function (panel) { return panel.id === targetId; }).image;
var targetAnchor = session.panelAnchor(targetId);
assert.strictEqual(copy.id, img.id);
assert.strictEqual(copy.rotation, 33);
assert.strictEqual(copy.flipX, true);
assert.strictEqual(copy.flipY, true);
assert.strictEqual(copy.scale, img.scale);
assert.strictEqual(copy.width, img.width);
assert.strictEqual(copy.height, img.height);
assert.ok(Math.abs(copy.cx - (targetAnchor.x + payload.relX + 16)) < 0.001);
assert.ok(Math.abs(copy.cy - (targetAnchor.y + payload.relY + 16)) < 0.001);
assert.strictEqual(session.undo(), true);
assert.strictEqual(session.doc.panels.find(function (panel) { return panel.id === targetId; }).image, null);
assert.ok(session.doc.panels.find(function (panel) { return panel.id === sourceId; }).image);

assert.strictEqual(session.pastePanelImage(targetId, {
  id: "missing",
  dataUrl: "",
  scale: 1,
  width: 1,
  height: 1,
  relX: 0,
  relY: 0
}, 0, 0), false);

assert.strictEqual(session.pastePanelImage(targetId, {
  id: "i-restored",
  dataUrl: png,
  width: 8,
  height: 9,
  scale: 2,
  rotation: -8,
  flipX: true,
  flipY: false,
  relX: 5,
  relY: -3
}, 0, 0), true);
assert.strictEqual(session.images.get("i-restored"), png);
var restored = session.doc.panels.find(function (panel) { return panel.id === targetId; }).image;
assert.strictEqual(restored.scale, 2);
assert.strictEqual(restored.rotation, -8);
assert.strictEqual(restored.flipX, true);
assert.strictEqual(restored.width, 8);
assert.strictEqual(restored.height, 9);

assert.strictEqual(session.pasteLetter({ type: "nope" }, 0, 0), null);

console.log("clipboard tests passed");
