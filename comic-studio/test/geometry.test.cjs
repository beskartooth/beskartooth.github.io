"use strict";

const G = require("../js/geometry.js");
const Doc = require("../js/document.js");

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    failed++;
    console.error("FAIL:", msg);
  }
}
function near(a, b, eps) {
  return Math.abs(a - b) <= (eps || 0.5);
}

function totalArea(panels) {
  return panels.reduce((s, p) => s + G.signedArea(p.points), 0);
}

function cutCounts(panels) {
  const m = new Map();
  panels.forEach((p) => p.edgeCuts.forEach((id) => {
    if (id) m.set(id, (m.get(id) || 0) + 1);
  }));
  return m;
}

function coverage(panels, w, h, step) {
  let misses = 0;
  let max = 0;
  let samples = 0;
  for (let y = step / 2; y < h; y += step) {
    for (let x = step / 2; x < w; x += step) {
      samples++;
      let c = 0;
      for (const p of panels) if (G.pointInPoly({ x, y }, p.points)) c++;
      if (c === 0) misses++;
      if (c > max) max = c;
    }
  }
  return { misses, max, samples };
}

function checkLayout(panels, w, h, label) {
  const area = totalArea(panels);
  assert(near(area, w * h, 1), label + " area " + area + " != " + (w * h));
  const cov = coverage(panels, w, h, Math.max(8, Math.round(Math.min(w, h) / 18)));
  assert(cov.misses === 0, label + " misses " + cov.misses + "/" + cov.samples);
  assert(cov.max === 1, label + " overlap max " + cov.max);
  cutCounts(panels).forEach((n, id) => {
    assert(n >= 2 && n % 2 === 0, label + " cut " + id + " count " + n);
  });
  panels.forEach((p) => {
    assert(p.points.length === p.edgeCuts.length, label + " edge mismatch");
    assert(p.points.length >= 3, label + " degenerate");
    assert(G.signedArea(p.points) > 0, label + " winding");
  });
}

// Horizontal split of a rectangle.
{
  const page = G.rectPanel(200, 100);
  const res = G.applyCut([page], { x: 0, y: 50 }, { x: 200, y: 50 }, "h");
  assert(res.count === 1, "horizontal split count");
  assert(res.panels.length === 2, "horizontal panels");
  checkLayout(res.panels, 200, 100, "horizontal");
  const shared = res.panels[0].edgeCuts.filter((id) => id === "h").length;
  assert(shared === 1, "one shared edge per piece");
}

// Diagonal.
{
  const page = G.rectPanel(100, 100);
  const res = G.applyCut([page], { x: 0, y: 0 }, { x: 100, y: 100 }, "d");
  assert(res.count === 1, "diagonal split");
  assert(near(totalArea(res.panels), 10000, 1), "diagonal area");
  assert(res.panels.every((p) => p.points.length === 3), "two triangles");
}

// Interior segment still splits the panel edge to edge.
{
  const page = G.rectPanel(100, 100);
  const res = G.applyCut([page], { x: 20, y: 40 }, { x: 80, y: 70 }, "in");
  assert(res.count === 1, "interior segment splits");
  checkLayout(res.panels, 100, 100, "interior");
}

// Six-panel via sequential cuts, then delete each cut.
{
  const w = 300, h = 450;
  let panels = [Object.assign({ id: "p" }, G.rectPanel(w, h))];
  const cuts = Doc.layoutCuts("six", w, h);
  cuts.forEach((seg, i) => {
    const res = G.applyCut(panels, { x: seg[0][0], y: seg[0][1] }, { x: seg[1][0], y: seg[1][1] }, "c" + i);
    panels = res.panels;
  });
  assert(panels.length === 6, "six panel count " + panels.length);
  checkLayout(panels, w, h, "six");
  ["c0", "c1", "c2"].forEach((id) => {
    panels = G.deleteCut(panels, id);
    checkLayout(panels, w, h, "delete " + id);
    const left = Array.from(cutCounts(panels).keys());
    assert(!left.includes(id), "removed " + id);
  });
  assert(panels.length === 1, "back to one panel " + panels.length);
}

// All starter layouts, then remove every cut.
["six", "tiers", "four", "splash", "strip", "slant"].forEach((id) => {
  const session = Doc.createSession();
  session.setPageSize(400, 600);
  const ok = session.applyLayout(id);
  assert(ok, "layout " + id);
  const expect = { six: 6, tiers: 3, four: 4, splash: 3, strip: 6, slant: 4 };
  assert(session.doc.panels.length === expect[id], id + " count " + session.doc.panels.length);
  checkLayout(session.doc.panels, 400, 600, id);
  if (id === "slant") {
    const angled = session.doc.panels.some((p) => p.points.some((pt, i) => {
      const q = p.points[(i + 1) % p.points.length];
      return Math.abs(q.x - pt.x) > 2 && Math.abs(q.y - pt.y) > 2;
    }));
    assert(angled, "slant has an angled edge");
  }
  const ids = Array.from(cutCounts(session.doc.panels).keys());
  ids.forEach((cutId) => {
    if (!cutCounts(session.doc.panels).has(cutId)) return;
    const removed = session.deleteCut(cutId);
    assert(removed, id + " delete " + cutId);
    checkLayout(session.doc.panels, 400, 600, id + " after " + cutId);
  });
  assert(session.doc.panels.length === 1, id + " merged to 1 (" + session.doc.panels.length + ")");
});

// Gutter inset opens a gap only on the cut.
{
  const page = Object.assign({ id: "p" }, G.rectPanel(200, 100));
  const res = G.applyCut([page], { x: 100, y: 0 }, { x: 100, y: 100 }, "v");
  const left = res.panels.find((p) => G.bounds(p.points).x < 1);
  const right = res.panels.find((p) => G.bounds(p.points).x > 50);
  const li = G.insetPolygon(left, { width: 200, height: 100, gutter: 20 });
  const ri = G.insetPolygon(right, { width: 200, height: 100, gutter: 20 });
  assert(li && ri, "inset exists");
  const leftMax = Math.max.apply(null, li.map((p) => p.x));
  const rightMin = Math.min.apply(null, ri.map((p) => p.x));
  assert(near(leftMax, 90, 0.6), "left inset " + leftMax);
  assert(near(rightMin, 110, 0.6), "right inset " + rightMin);
  assert(near(Math.min.apply(null, li.map((p) => p.x)), 0, 0.6), "left edge stays");
  assert(near(Math.min.apply(null, li.map((p) => p.y)), 0, 0.6), "top edge stays");
}

// A T-junction keeps a full gutter, and insets stay on the page.
{
  const page = { width: 240, height: 180, gutter: 20 };
  let panels = [Object.assign({ id: "p" }, G.rectPanel(page.width, page.height))];
  panels = G.applyCut(panels, { x: 0, y: 90 }, { x: 240, y: 90 }, "h").panels;
  panels = G.applyCut(panels, { x: 80, y: 0 }, { x: 110, y: 90 }, "stem").panels;
  assert(panels.length === 3, "T has 3 panels");
  const insets = panels.map((panel) => G.insetPolygon(panel, page));
  insets.forEach((poly, i) => assert(poly && poly.length >= 3, "T inset " + i));
  insets.forEach((poly) => poly.forEach((pt) => {
    assert(pt.x >= -0.6 && pt.y >= -0.6 && pt.x <= page.width + 0.6 && pt.y <= page.height + 0.6, "inset stays on the page");
  }));
  const bottom = insets[panels.findIndex((panel) => G.bounds(panel.points).y > 40)];
  const topYs = [];
  insets.forEach((poly, i) => {
    if (G.bounds(panels[i].points).y > 40) return;
    poly.forEach((pt) => { if (pt.y > 70 && pt.y < 100) topYs.push(pt.y); });
  });
  const bottomYs = bottom.filter((pt) => pt.y > 70 && pt.y < 110).map((pt) => pt.y);
  const gap = Math.min.apply(null, bottomYs) - Math.max.apply(null, topYs);
  assert(near(gap, 20, 1.5), "T gutter stays full width " + gap);
  let angled = [Object.assign({ id: "p" }, G.rectPanel(page.width, page.height))];
  angled = G.applyCut(angled, { x: 0, y: 8 }, { x: 240, y: 30 }, "shallow").panels;
  angled.forEach((panel) => {
    const poly = G.insetPolygon(panel, page);
    assert(poly, "shallow inset");
    poly.forEach((pt) => {
      assert(pt.x >= -0.6 && pt.y >= -0.6 && pt.x <= page.width + 0.6 && pt.y <= page.height + 0.6, "shallow inset stays on the page");
    });
  });
}

// A segment in the lower half does not slice the upper panel.
{
  const w = 100, h = 100;
  let panels = [Object.assign({ id: "p" }, G.rectPanel(w, h))];
  let res = G.applyCut(panels, { x: 0, y: 68 }, { x: 100, y: 68 }, "h");
  panels = res.panels;
  res = G.applyCut(panels, { x: 50, y: 72 }, { x: 50, y: 100 }, "v");
  assert(res.count === 1, "splash lower cut splits one panel");
  assert(res.panels.length === 3, "splash panels " + res.panels.length);
  checkLayout(res.panels, w, h, "splash manual");
}

// Random cuts then full uncut. Seeded.
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
{
  const rng = mulberry32(7);
  const w = 240, h = 360;
  let panels = [Object.assign({ id: "p" }, G.rectPanel(w, h))];
  for (let i = 0; i < 12; i++) {
    const a = { x: rng() * w, y: rng() * h };
    const b = { x: rng() * w, y: rng() * h };
    const res = G.applyCut(panels, a, b, "r" + i);
    panels = res.panels;
    checkLayout(panels, w, h, "fuzz " + i);
  }
  const ids = Array.from(cutCounts(panels).keys());
  ids.forEach((id) => {
    panels = G.deleteCut(panels, id);
    checkLayout(panels, w, h, "fuzz delete " + id);
  });
  assert(panels.length === 1, "fuzz back to 1 (" + panels.length + ")");
}

// History, images kept out of the document snapshot, JSON roundtrip.
{
  const s = Doc.createSession();
  s.setPageSize(200, 300);
  s.applyLayout("four");
  assert(s.doc.panels.length === 4, "doc four");
  const id = s.doc.panels[0].id;
  s.setImage(id, { dataUrl: "data:image/png;base64,aaaa", width: 20, height: 40 });
  assert(!JSON.stringify(s.doc).includes("data:image"), "bytes stay out of doc");
  assert(s.images.get(s.doc.panels.find((p) => p.id === id).image.id).startsWith("data:image"), "store has bytes");
  const before = s.doc.panels.length;
  s.cut({ x: 10, y: 10 }, { x: 180, y: 40 });
  assert(s.doc.panels.length > before, "cut added panels");
  assert(s.undo(), "undo cut");
  assert(s.doc.panels.length === before, "undo restored panels");
  assert(s.redo(), "redo cut");
  assert(s.doc.panels.length > before, "redo restored cut");
  s.undo();
  const text = JSON.stringify(s.toJSON());
  assert(text.includes("data:image/png;base64,aaaa"), "json embeds image");
  const s2 = Doc.createSession();
  s2.loadJSON(text);
  assert(s2.doc.panels.length === 4, "loaded panels");
  assert(s2.doc.page.width === 200 && s2.doc.page.height === 300, "loaded size");
  const loaded = s2.doc.panels.find((p) => p.image);
  assert(loaded && s2.images.get(loaded.image.id).includes("aaaa"), "loaded image");
  assert(s2.undo(), "undo load");
  assert(s2.doc.panels.length === 1, "undo load restores blank");
}

// Image rotation, flips, and older project files.
{
  const s = Doc.createSession();
  s.setPageSize(400, 300);
  const id = s.doc.panels[0].id;
  s.setImage(id, { dataUrl: "data:image/png;base64,bbbb", width: 100, height: 50 });
  const fresh = s.doc.panels[0].image;
  assert(fresh.rotation === 0 && fresh.flipX === false && fresh.flipY === false, "new image is upright");
  assert(s.turnImage(id, 90), "turn right");
  assert(s.doc.panels[0].image.rotation === 90, "rotation 90");
  s.turnImage(id, 90);
  s.turnImage(id, 90);
  assert(near(s.doc.panels[0].image.rotation, -90), "third quarter turn wraps to -90");
  assert(s.flipImage(id, "x"), "flip horizontal");
  assert(s.doc.panels[0].image.flipX === true && s.doc.panels[0].image.flipY === false, "flip x only");
  assert(s.undo(), "undo flip");
  assert(s.doc.panels[0].image.flipX === false, "flip undone");
  assert(near(s.doc.panels[0].image.rotation, -90), "rotation survives undo");
  assert(s.redo(), "redo flip");
  assert(s.doc.panels[0].image.flipX === true, "flip redone");
  s.setImageRotation(id, 190);
  assert(near(s.doc.panels[0].image.rotation, -170), "190 degrees wraps");
  const raw = s.toJSON();
  assert(raw.panels[0].image.rotation === s.doc.panels[0].image.rotation, "json keeps rotation");
  assert(raw.panels[0].image.flipX === true, "json keeps flip");
  const s3 = Doc.createSession();
  s3.loadJSON(JSON.stringify(raw));
  const again = s3.doc.panels.find((p) => p.image);
  assert(again && near(again.image.rotation, -170) && again.image.flipX === true, "reload rotation");
  const old = JSON.parse(JSON.stringify(raw));
  delete old.panels[0].image.rotation;
  delete old.panels[0].image.flipX;
  delete old.panels[0].image.flipY;
  const s2 = Doc.createSession();
  s2.loadJSON(old);
  const legacy = s2.doc.panels.find((p) => p.image);
  assert(legacy && legacy.image.rotation === 0 && legacy.image.flipX === false && legacy.image.flipY === false, "v1 file without rotation still loads");
  assert(s2.images.get(legacy.image.id).includes("bbbb"), "legacy image bytes");
  assert(s.resetImageRotation(id), "reset rotation");
  assert(s.doc.panels[0].image.rotation === 0 && s.doc.panels[0].image.flipX === false, "rotation cleared");
  assert(s.doc.panels[0].image.scale === fresh.scale, "reset rotation keeps zoom");
  assert(s.undo(), "undo rotation reset");
  s.turnImage(id, 35);
  s.resetImage(id);
  assert(s.doc.panels[0].image.rotation === 0 && s.doc.panels[0].image.flipX === false, "reset framing clears rotation");
}

// Snap helper.
{
  const s = G.snapAxis({ x: 10, y: 10 }, { x: 40, y: 18 });
  assert(s.y === 10 && s.x === 40, "snap horizontal");
  const v = G.snapAxis({ x: 10, y: 10 }, { x: 12, y: 50 });
  assert(v.x === 10 && v.y === 50, "snap vertical");
}

// New page, blank layout, and the image bank.
{
  const s = Doc.createSession();
  assert(!s.isDirty(), "fresh page is clean");
  assert(Array.isArray(s.doc.bank) && s.doc.bank.length === 0, "bank starts empty");
  s.setPageSize(640, 400);
  s.applyLayout("four");
  const kept = s.addLetter("caption", { x: 10, y: 10, w: 80, h: 40 });
  const panelId = s.doc.panels[0].id;
  assert(s.setImage(panelId, { dataUrl: "data:image/png;base64,bbbb", width: 20, height: 30, name: "hero.png" }), "place image");
  assert(s.doc.bank.length === 1 && s.doc.bank[0].name === "hero.png", "place also stores the bank");
  const bankId = s.doc.bank[0].id;
  assert(s.doc.panels[0].image.id === bankId, "panel uses the bank id");
  assert(s.isDirty(), "edits are unsaved");
  s.removeImage(panelId);
  assert(!s.doc.panels.find((p) => p.id === panelId).image, "panel image removed");
  assert(s.images.has(bankId), "bank keeps the bytes");
  assert(s.placeBankImage(panelId, bankId), "place from bank");
  assert(s.doc.panels.find((p) => p.id === panelId).image.id === bankId, "same bank image placed");
  const raw = s.toJSON();
  assert(raw.bank && raw.bank.length === 1 && raw.bank[0].dataUrl.indexOf("data:image/") === 0, "json stores the bank");
  const legacy = JSON.parse(JSON.stringify(raw));
  delete legacy.bank;
  const s2 = Doc.createSession();
  s2.loadJSON(legacy);
  assert(s2.doc.bank.length === 0, "older project loads with an empty bank");
  assert(s2.doc.panels.some((p) => p.image), "older project still loads placed images");
  const s3 = Doc.createSession();
  s3.loadJSON(raw);
  assert(s3.doc.bank.length === 1 && s3.doc.bank[0].name === "hero.png", "reload bank");
  assert(s3.images.has(s3.doc.bank[0].id), "reload bank bytes");
  assert(s.applyLayout("blank"), "blank layout");
  assert(s.doc.panels.length === 1 && !s.doc.panels[0].image, "blank is one empty panel");
  assert(s.doc.letters.length === 1, "blank keeps lettering");
  assert(s.doc.bank.length === 1, "blank keeps the bank");
  assert(s.doc.page.width === 640 && s.doc.page.height === 400, "blank keeps page size");
  assert(s.undo(), "undo blank");
  assert(s.doc.panels.length === 4, "undo blank restores panels");
  assert(s.newPage({ keepBank: true }), "new page");
  assert(s.doc.panels.length === 1 && !s.doc.panels[0].image && s.doc.letters.length === 0, "new page is blank");
  assert(s.doc.page.width === 640 && s.doc.page.height === 400, "new page keeps size");
  assert(s.doc.bank.length === 1, "new page can keep the bank");
  s.markClean();
  assert(!s.isDirty(), "new page is clean");
  assert(s.undo(), "undo new page");
  assert(s.doc.panels.length === 4 && s.doc.letters.some((l) => l.id === kept.id), "undo new restores the page");
  assert(s.isDirty(), "restored page is unsaved again");
  s.redo();
  assert(s.newPage({ keepBank: false }), "new page clearing bank");
  assert(s.doc.bank.length === 0, "bank cleared");
  assert(s.undo(), "undo clear bank");
  assert(s.doc.bank.length === 1 && s.images.has(bankId), "undo restores bank bytes");
}

if (failed) {
  console.error(failed + " assertion(s) failed");
  process.exit(1);
}
console.log("geometry tests passed");
