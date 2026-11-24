/* Old projects keep the original balloon fields. New options round-trip only when set. */
var assert = require("assert");
var Doc = require("../js/document.js");

var EXTRA = ["shape", "captionStyle", "shadow", "shadowDx", "shadowDy", "shadowColor", "shapeAlpha", "tailCurve", "tailWidth", "tail2", "puffCount", "puffSize", "align", "leading", "autoFit", "linkTo", "texture", "slantCorners", "characterId"];

function oldProject() {
  return {
    type: "comic-studio",
    version: 1,
    page: { width: 900, height: 700, background: "#ffffff", gutter: 16, border: { enabled: true, color: "#111111", width: 6 } },
    panels: [{
      id: "p1",
      points: [{ x: 0, y: 0 }, { x: 900, y: 0 }, { x: 900, y: 700 }, { x: 0, y: 700 }],
      edgeCuts: [null, null, null, null],
      image: null
    }],
    letters: [
      {
        id: "b1", type: "bubble", x: 40, y: 50, w: 340, h: 210, rotation: 0,
        font: "Comic Neue", fontWeight: 700, fontStyle: "normal", fontSize: 42,
        fill: "#1c1c1c", stroke: "#ffffff", strokeWidth: 0,
        shapeFill: "#ffffff", shapeStroke: "#161616", shapeStrokeWidth: 6,
        text: "Hello there friend", tail: { dx: 48, dy: 200 }
      },
      {
        id: "t1", type: "thought", x: 80, y: 280, w: 300, h: 180, rotation: 0,
        font: "Comic Neue", fontWeight: 400, fontStyle: "italic", fontSize: 36,
        fill: "#1c1c1c", stroke: "#ffffff", strokeWidth: 0,
        shapeFill: "#ffffff", shapeStroke: "#161616", shapeStrokeWidth: 5,
        text: "Hmm", tail: { dx: 10, dy: 160 }
      },
      {
        id: "c1", type: "caption", x: 30, y: 20, w: 260, h: 70, rotation: 0,
        font: "Comic Neue", fontWeight: 700, fontStyle: "normal", fontSize: 28,
        fill: "#1c1c1c", stroke: "#ffffff", strokeWidth: 0,
        shapeFill: "#fffdf6", shapeStroke: "#161616", shapeStrokeWidth: 4,
        text: "Later", tail: null
      }
    ]
  };
}

var session = Doc.createSession();
session.loadJSON(oldProject());
assert.strictEqual(session.doc.letters.length, 3);
session.doc.letters.forEach(function (letter) {
  EXTRA.forEach(function (key) {
    assert.strictEqual(Object.prototype.hasOwnProperty.call(letter, key), false, letter.type + " gained " + key);
  });
});
assert.strictEqual(session.doc.letters[0].text, "Hello there friend");
assert.deepStrictEqual(session.doc.letters[0].tail, { dx: 48, dy: 200 });
assert.strictEqual(session.doc.letters[0].shapeFill, "#ffffff");
assert.strictEqual(session.doc.letters[0].font, "Comic Neue");
assert.strictEqual(session.doc.letters[1].fontStyle, "italic");
assert.strictEqual(session.doc.letters[1].text, "Hmm");
assert.strictEqual(session.doc.letters[2].tail, null);
assert.strictEqual(session.doc.letters[2].shapeFill, "#fffdf6");

var saved = session.toJSON();
assert.strictEqual(saved.characters, undefined);
assert.strictEqual(Object.prototype.hasOwnProperty.call(saved.pages[0].letters[0], "shape"), false);
assert.strictEqual(saved.pages[0].letters[0].text, "Hello there friend");
assert.deepStrictEqual(saved.pages[0].letters[0].tail, { dx: 48, dy: 200 });
var again = Doc.createSession();
again.loadJSON(JSON.parse(JSON.stringify(saved)));
EXTRA.forEach(function (key) {
  assert.strictEqual(Object.prototype.hasOwnProperty.call(again.doc.letters[0], key), false, "round trip added " + key);
});
assert.deepStrictEqual(again.doc.letters[0].tail, { dx: 48, dy: 200 });
assert.strictEqual(again.doc.letters[2].text, "Later");

session.updateLetter("b1", {
  shape: "burst",
  shadow: true,
  shadowDx: 14,
  shadowDy: -6,
  shadowColor: "#331111",
  shapeAlpha: 70,
  tailCurve: 36,
  tailWidth: 60,
  tail2: { dx: 120, dy: 180 },
  align: "left",
  leading: 140,
  autoFit: true,
  linkTo: "t1"
});
session.updateLetter("t1", { puffCount: 22, puffSize: 28, tail2: { dx: -40, dy: 150 } });
session.updateLetter("c1", { captionStyle: "torn", texture: "parchment", slantCorners: true, align: "right" });
var packed = session.toJSON();
var back = Doc.createSession();
back.loadJSON(packed);
var bubble = back.doc.letters[0];
assert.strictEqual(bubble.shape, "burst");
assert.strictEqual(bubble.shadow, true);
assert.strictEqual(bubble.shadowDx, 14);
assert.strictEqual(bubble.shadowDy, -6);
assert.strictEqual(bubble.shadowColor, "#331111");
assert.strictEqual(bubble.shapeAlpha, 70);
assert.strictEqual(bubble.tailCurve, 36);
assert.strictEqual(bubble.tailWidth, 60);
assert.deepStrictEqual(bubble.tail2, { dx: 120, dy: 180 });
assert.strictEqual(bubble.align, "left");
assert.strictEqual(bubble.leading, 140);
assert.strictEqual(bubble.autoFit, true);
assert.strictEqual(bubble.linkTo, "t1");
assert.strictEqual(bubble.text, "Hello there friend");
assert.deepStrictEqual(bubble.tail, { dx: 48, dy: 200 });
assert.strictEqual(back.doc.letters[1].puffCount, 22);
assert.strictEqual(back.doc.letters[1].puffSize, 28);
assert.deepStrictEqual(back.doc.letters[1].tail2, { dx: -40, dy: 150 });
assert.strictEqual(back.doc.letters[2].captionStyle, "torn");
assert.strictEqual(back.doc.letters[2].texture, "parchment");
assert.strictEqual(back.doc.letters[2].slantCorners, true);
assert.strictEqual(back.doc.letters[2].align, "right");
assert.strictEqual(back.doc.letters[2].tail, null);
assert.strictEqual(Object.prototype.hasOwnProperty.call(back.doc.letters[2], "tail2"), false);

session.updateLetter("b1", {
  shape: "",
  tailCurve: 0,
  tailWidth: 42,
  shapeAlpha: 100,
  align: "center",
  leading: 115,
  autoFit: false,
  shadow: false,
  tail2: null,
  linkTo: ""
});
["shape", "tailCurve", "tailWidth", "shapeAlpha", "align", "leading", "autoFit", "shadow", "tail2", "linkTo"].forEach(function (key) {
  assert.strictEqual(Object.prototype.hasOwnProperty.call(session.doc.letters[0], key), false, "default stored " + key);
});
assert.deepStrictEqual(session.doc.letters[0].tail, { dx: 48, dy: 200 });

assert.strictEqual(session.applyLetterStyle("b1", {
  type: "bubble",
  font: "Bungee",
  fontWeight: 400,
  fontStyle: "normal",
  fontSize: 52,
  fill: "#fffdf8",
  stroke: "#ffffff",
  strokeWidth: 0,
  shapeFill: "#c42727",
  shapeStroke: "#5c1010",
  shapeStrokeWidth: 7,
  rotation: -4,
  tail: { dx: 70, dy: 190 }
}), true);
var shouted = session.doc.letters[0];
assert.strictEqual(shouted.font, "Bungee");
assert.strictEqual(shouted.shapeFill, "#c42727");
assert.strictEqual(shouted.text, "Hello there friend");
assert.deepStrictEqual(shouted.tail, { dx: 70, dy: 190 });
assert.strictEqual(Object.prototype.hasOwnProperty.call(shouted, "shape"), false);
assert.strictEqual(Object.prototype.hasOwnProperty.call(shouted, "shadow"), false);

session.setCharacters([{
  id: "phoebe",
  name: "Phoebe",
  font: "Bangers",
  fontWeight: 400,
  fontStyle: "normal",
  fill: "#1c1c1c",
  stroke: "#ffffff",
  strokeWidth: 0,
  shapeFill: "#ffffff",
  shapeStroke: "#ff4fa3",
  shapeStrokeWidth: 6
}]);
var withChars = session.toJSON();
assert.strictEqual(withChars.characters.length, 1);
assert.strictEqual(withChars.characters[0].name, "Phoebe");
assert.strictEqual(withChars.characters[0].shapeStroke, "#ff4fa3");
assert.strictEqual(withChars.pages[0].letters[0].font, "Bungee");
var bare = JSON.parse(JSON.stringify(withChars));
delete bare.characters;
var plain = Doc.createSession();
plain.loadJSON(bare);
assert.strictEqual(plain.characters().length, 0);
assert.strictEqual(plain.doc.letters[0].font, "Bungee");
assert.strictEqual(plain.doc.letters[0].text, "Hello there friend");
var kept = Doc.createSession();
kept.setCharacters([{ id: "local", name: "Local", font: "Kalam", fontWeight: 400, fontStyle: "normal", fill: "#111111", stroke: "#ffffff", strokeWidth: 0, shapeFill: "#ffffff", shapeStroke: "#111111", shapeStrokeWidth: 4 }]);
kept.loadJSON(withChars);
assert.strictEqual(kept.characters().length, 1);
assert.strictEqual(kept.characters()[0].id, "phoebe");
assert.strictEqual(kept.doc.letters[1].text, "Hmm");

session.updateLetter("t1", { shape: "radio" });
var clip = JSON.parse(JSON.stringify(session.doc.letters[1]));
delete clip.id;
var pasted = session.pasteLetter(clip, 12, 8);
assert.strictEqual(pasted.shape, "radio");
assert.strictEqual(pasted.puffCount, 22);
assert.strictEqual(pasted.x, session.doc.letters[1].x + 12);

console.log("bubble tests passed");
