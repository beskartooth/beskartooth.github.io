/* A multi-point cut is one gutter, and its corner can move. */
var assert = require("assert");
var Doc = require("../js/document.js");

var session = Doc.createSession();
session.setPageSize(240, 180);
assert.strictEqual(session.cutPolyline([
  { x: 0, y: 40 },
  { x: 120, y: 40 },
  { x: 120, y: 140 },
  { x: 240, y: 140 }
]), true);
assert.ok(session.doc.panels.length >= 2, "polyline splits the page");
var ids = {};
session.doc.panels.forEach(function (panel) {
  panel.edgeCuts.forEach(function (id) { if (id) ids[id] = true; });
});
var cutIds = Object.keys(ids);
assert.strictEqual(cutIds.length, 1, "one cut id for the whole path");
var corner = null;
session.doc.panels.forEach(function (panel) {
  panel.points.forEach(function (pt, i) {
    if (panel.edgeCuts[i] === cutIds[0] && Math.abs(pt.x - 120) < 2 && Math.abs(pt.y - 40) < 2) corner = { x: pt.x, y: pt.y };
  });
});
assert.ok(corner, "step corner exists");
assert.strictEqual(session.moveCutVertex(corner, { x: corner.x + 15, y: corner.y + 10 }), true);
var moved = false;
session.doc.panels.forEach(function (panel) {
  panel.points.forEach(function (pt) {
    if (Math.abs(pt.x - (corner.x + 15)) < 1 && Math.abs(pt.y - (corner.y + 10)) < 1) moved = true;
  });
});
assert.ok(moved, "corner moved");
assert.strictEqual(session.deleteCut(cutIds[0]), true);
assert.strictEqual(session.doc.panels.length, 1, "removing the gutter merges the page");
assert.strictEqual(session.cutPolyline([{ x: 10, y: 10 }, { x: 12, y: 12 }]), false);

console.log("polyline tests passed");
