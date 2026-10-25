/* Panel polygons, straight cuts, gutter insets. No DOM. */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ComicStudioGeometry = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function signedArea(points) {
    var a = 0;
    for (var i = 0; i < points.length; i++) {
      var p = points[i];
      var q = points[(i + 1) % points.length];
      a += p.x * q.y - q.x * p.y;
    }
    return a / 2;
  }

  function pointInPoly(p, points) {
    var inside = false;
    for (var i = 0, j = points.length - 1; i < points.length; j = i++) {
      var a = points[i];
      var b = points[j];
      var hit = (a.y > p.y) !== (b.y > p.y) &&
        p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x;
      if (hit) inside = !inside;
    }
    return inside;
  }

  function distToSegment(p, a, b) {
    var dx = b.x - a.x;
    var dy = b.y - a.y;
    var len2 = dx * dx + dy * dy;
    if (len2 < 1e-12) return Math.hypot(p.x - a.x, p.y - a.y);
    var t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
  }

  function bounds(points) {
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (var i = 0; i < points.length; i++) {
      var p = points[i];
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }

  function snapAxis(a, b) {
    if (Math.abs(b.x - a.x) >= Math.abs(b.y - a.y)) return { x: b.x, y: a.y };
    return { x: a.x, y: b.y };
  }

  function rectPanel(w, h) {
    return {
      points: [
        { x: 0, y: 0 },
        { x: w, y: 0 },
        { x: w, y: h },
        { x: 0, y: h }
      ],
      edgeCuts: [null, null, null, null]
    };
  }

  function reversePoly(poly) {
    var n = poly.points.length;
    var points = poly.points.slice().reverse();
    var edgeCuts = new Array(n);
    for (var j = 0; j < n; j++) {
      var oldIndex = (n - 2 - j) % n;
      if (oldIndex < 0) oldIndex += n;
      edgeCuts[j] = poly.edgeCuts[oldIndex];
    }
    return { id: poly.id, image: poly.image, points: points, edgeCuts: edgeCuts };
  }

  function ensureCW(poly) {
    if (signedArea(poly.points) >= 0) return poly;
    return reversePoly(poly);
  }

  function cross(a, b, c) {
    return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  }

function samePt(a, b) {
  return Math.abs(a.x - b.x) <= 0.25 && Math.abs(a.y - b.y) <= 0.25;
}

function pointUsed(pt, polys) {
  if (!polys) return false;
  for (var i = 0; i < polys.length; i++) {
    var pts = polys[i].points;
    for (var k = 0; k < pts.length; k++) {
      if (samePt(pts[k], pt)) return true;
    }
  }
  return false;
}

function cleanupCollinear(poly, others) {
  var points = poly.points.slice();
  var edgeCuts = poly.edgeCuts.slice();
  var guard = 0;
  while (guard++ < 24) {
    if (points.length <= 3) break;
    var removed = false;
    for (var i = 0; i < points.length; i++) {
      var prev = (i - 1 + points.length) % points.length;
      if (edgeCuts[prev] !== edgeCuts[i]) continue;
      if (pointUsed(points[i], others)) continue;
      var next = (i + 1) % points.length;
      var len = Math.hypot(points[next].x - points[prev].x, points[next].y - points[prev].y);
      if (len < 1e-6) continue;
      var deviation = Math.abs(cross(points[prev], points[i], points[next])) / len;
      if (deviation <= 0.02) {
        points.splice(i, 1);
        edgeCuts.splice(i, 1);
        removed = true;
        break;
      }
    }
    if (!removed) break;
  }
  return { id: poly.id, image: poly.image, points: points, edgeCuts: edgeCuts };
}

  function lineHits(points, a, b) {
    var abx = b.x - a.x;
    var aby = b.y - a.y;
    var hits = [];
    var n = points.length;
    for (var i = 0; i < n; i++) {
      var c = points[i];
      var d = points[(i + 1) % n];
      var cdx = d.x - c.x;
      var cdy = d.y - c.y;
      var denom = abx * cdy - aby * cdx;
      if (Math.abs(denom) < 1e-9) continue;
      var acx = c.x - a.x;
      var acy = c.y - a.y;
      var t = (acx * cdy - acy * cdx) / denom;
      var u = (acx * aby - acy * abx) / denom;
      if (u < -1e-5 || u > 1 + 1e-5) continue;
      var uu = u < 0 ? 0 : u > 1 ? 1 : u;
      hits.push({
        x: c.x + uu * cdx,
        y: c.y + uu * cdy,
        u: uu,
        edge: i,
        t: t
      });
    }
    var unique = [];
    for (var h = 0; h < hits.length; h++) {
      var hit = hits[h];
      var dup = false;
      for (var k = 0; k < unique.length; k++) {
        if (Math.hypot(unique[k].x - hit.x, unique[k].y - hit.y) < 0.05) {
          dup = true;
          break;
        }
      }
      if (!dup) unique.push(hit);
    }
    return unique;
  }

  function overlapLength(a, b, hits) {
    var len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 1e-6) return 0;
    var t0 = Math.min(hits[0].t, hits[1].t);
    var t1 = Math.max(hits[0].t, hits[1].t);
    var lo = Math.max(t0, 0);
    var hi = Math.min(t1, 1);
    return Math.max(0, hi - lo) * len;
  }

  function buildRing(poly, hits) {
    var n = poly.points.length;
    var mark = new Array(n);
    var inserts = [];
    for (var i = 0; i < n; i++) inserts.push([]);
    var keys = ["A", "B"];
    for (var k = 0; k < 2; k++) {
      var h = hits[k];
      var key = keys[k];
      if (h.u <= 1e-4) {
        if (mark[h.edge] && mark[h.edge] !== key) return null;
        mark[h.edge] = key;
      } else if (h.u >= 1 - 1e-4) {
        var v = (h.edge + 1) % n;
        if (mark[v] && mark[v] !== key) return null;
        mark[v] = key;
      } else {
        inserts[h.edge].push({ u: h.u, x: h.x, y: h.y, key: key });
      }
    }
    for (var e = 0; e < n; e++) inserts[e].sort(function (p, q) { return p.u - q.u; });
    var ring = [];
    for (var i2 = 0; i2 < n; i2++) {
      ring.push({
        x: poly.points[i2].x,
        y: poly.points[i2].y,
        outCut: poly.edgeCuts[i2],
        key: mark[i2] || null
      });
      var extras = inserts[i2];
      for (var j = 0; j < extras.length; j++) {
        ring.push({
          x: extras[j].x,
          y: extras[j].y,
          outCut: poly.edgeCuts[i2],
          key: extras[j].key
        });
      }
    }
    var found = [];
    for (var r = 0; r < ring.length; r++) if (ring[r].key) found.push(ring[r].key);
    if (found.length !== 2 || found[0] === found[1]) return null;
    return ring;
  }

  function walk(base, ring, from, to, cutId) {
    var points = [];
    var edgeCuts = [];
    var i = from;
    var guard = 0;
    while (guard++ <= ring.length + 1) {
      points.push({ x: ring[i].x, y: ring[i].y });
      if (i === to) break;
      edgeCuts.push(ring[i].outCut);
      i = (i + 1) % ring.length;
    }
    edgeCuts.push(cutId);
    if (points.length !== edgeCuts.length || points.length < 3) return null;
    return { id: base.id, image: base.image, points: points, edgeCuts: edgeCuts };
  }

  function adjacent(n, i, j) {
    return (i + 1) % n === j || (j + 1) % n === i;
  }

  function splitPanel(poly, a, b, cutId) {
    if (!poly || poly.points.length < 3) return null;
    var hits = lineHits(poly.points, a, b);
    if (hits.length !== 2) return null;
    if (overlapLength(a, b, hits) < 0.5) return null;
    var ring = buildRing(poly, hits);
    if (!ring) return null;
    var iA = -1;
    var iB = -1;
    for (var i = 0; i < ring.length; i++) {
      if (ring[i].key === "A") iA = i;
      if (ring[i].key === "B") iB = i;
    }
    if (iA < 0 || iB < 0 || iA === iB) return null;
    if (adjacent(ring.length, iA, iB)) return null;
    var p1 = walk(poly, ring, iA, iB, cutId);
    var p2 = walk(poly, ring, iB, iA, cutId);
    if (!p1 || !p2) return null;
    p1 = ensureCW(p1);
    p2 = ensureCW(p2);
    if (p1.points.length < 3 || p2.points.length < 3) return null;
    if (Math.abs(signedArea(p1.points)) < 4 || Math.abs(signedArea(p2.points)) < 4) return null;
    return [p1, p2];
  }

  function applyCut(panels, a, b, cutId) {
    if (Math.hypot(b.x - a.x, b.y - a.y) < 8) return { panels: panels, count: 0 };
    var next = [];
    var count = 0;
    for (var i = 0; i < panels.length; i++) {
      var pieces = splitPanel(panels[i], a, b, cutId);
      if (!pieces) {
        next.push(panels[i]);
        continue;
      }
      count++;
      next.push(pieces[0], pieces[1]);
    }
    if (!count) return { panels: panels, count: 0 };
    return { panels: weldJunctions(next), count: count };
  }

  function findShared(panels, cutId) {
    for (var i = 0; i < panels.length; i++) {
      var A = panels[i];
      var nA = A.points.length;
      for (var si = 0; si < nA; si++) {
        if (A.edgeCuts[si] !== cutId) continue;
        var a0 = A.points[si];
        var a1 = A.points[(si + 1) % nA];
        for (var j = 0; j < panels.length; j++) {
          if (i === j) continue;
          var B = panels[j];
          var nB = B.points.length;
          for (var sj = 0; sj < nB; sj++) {
            if (B.edgeCuts[sj] !== cutId) continue;
            var b0 = B.points[sj];
            var b1 = B.points[(sj + 1) % nB];
            if (samePt(a0, b1) && samePt(a1, b0)) return { a: A, b: B, si: si, sj: sj };
          }
        }
      }
    }
    return null;
  }

  function pickImage(a, b) {
    if (a.image && !b.image) return Object.assign({}, a.image);
    if (b.image && !a.image) return Object.assign({}, b.image);
    if (a.image && b.image) {
      var src = Math.abs(signedArea(a.points)) >= Math.abs(signedArea(b.points)) ? a.image : b.image;
      return Object.assign({}, src);
    }
    return null;
  }

  function mergePanels(A, B, si, sj, others) {
    var nA = A.points.length;
    var nB = B.points.length;
    var points = [];
    var edgeCuts = [];
    var e = (si + 1) % nA;
    points.push({ x: A.points[e].x, y: A.points[e].y });
    var guard = 0;
    while (e !== si && guard++ < nA + 2) {
      edgeCuts.push(A.edgeCuts[e]);
      var next = (e + 1) % nA;
      points.push({ x: A.points[next].x, y: A.points[next].y });
      e = next;
    }
    e = (sj + 1) % nB;
    guard = 0;
    while (e !== sj && guard++ < nB + 2) {
      edgeCuts.push(B.edgeCuts[e]);
      var nextB = (e + 1) % nB;
      if (nextB !== sj) points.push({ x: B.points[nextB].x, y: B.points[nextB].y });
      e = nextB;
    }
    if (points.length !== edgeCuts.length || points.length < 3) return null;
    var id = Math.abs(signedArea(A.points)) >= Math.abs(signedArea(B.points)) ? A.id : B.id;
    return cleanupCollinear(ensureCW({
      id: id,
      image: pickImage(A, B),
      points: points,
      edgeCuts: edgeCuts
    }), others);
  }

  function clonePoly(p) {
    return {
      id: p.id,
      image: p.image ? Object.assign({}, p.image) : null,
      points: p.points.map(function (pt) { return { x: pt.x, y: pt.y }; }),
      edgeCuts: p.edgeCuts.slice()
    };
  }

  function weldJunctions(panels) {
    var list = panels.map(clonePoly);
    var guard = 0;
    var changed = true;
    while (changed && guard++ < 800) {
      changed = false;
      var vertices = [];
      for (var i = 0; i < list.length; i++) {
        for (var k = 0; k < list[i].points.length; k++) vertices.push(list[i].points[k]);
      }
      for (var p = 0; p < list.length && !changed; p++) {
        var poly = list[p];
        for (var e = 0; e < poly.points.length && !changed; e++) {
          var a = poly.points[e];
          var b = poly.points[(e + 1) % poly.points.length];
          var best = null;
          var bestT = 2;
          for (var v = 0; v < vertices.length; v++) {
            var pt = vertices[v];
            if (samePt(pt, a) || samePt(pt, b)) continue;
            var already = false;
            for (var q = 0; q < poly.points.length; q++) {
              if (samePt(poly.points[q], pt)) { already = true; break; }
            }
            if (already) continue;
            if (distToSegment(pt, a, b) > 0.25) continue;
            var dx = b.x - a.x;
            var dy = b.y - a.y;
            var len2 = dx * dx + dy * dy;
            if (len2 < 1e-8) continue;
            var t = ((pt.x - a.x) * dx + (pt.y - a.y) * dy) / len2;
            if (t <= 0.002 || t >= 0.998) continue;
            if (t < bestT) { bestT = t; best = pt; }
          }
          if (best) {
            poly.points.splice(e + 1, 0, { x: best.x, y: best.y });
            poly.edgeCuts.splice(e + 1, 0, poly.edgeCuts[e]);
            changed = true;
          }
        }
      }
    }
    return list;
  }

  function removeSpurs(poly) {
    var pts = poly.points.map(function (p) { return { x: p.x, y: p.y }; });
    var cuts = poly.edgeCuts.slice();
    var guard = 0;
    while (pts.length > 3 && guard++ < 40) {
      var n = pts.length;
      var found = -1;
      for (var i = 0; i < n; i++) {
        var prev = pts[(i - 1 + n) % n];
        var next = pts[(i + 1) % n];
        if (samePt(prev, next)) { found = i; break; }
      }
      if (found < 0) break;
      var ip = (found - 1 + n) % n;
      var inn = (found + 1) % n;
      var newPts = [];
      var newCuts = [];
      for (var j = 0; j < n; j++) {
        if (j === found || j === inn) continue;
        newPts.push(pts[j]);
        newCuts.push(j === ip ? cuts[inn] : cuts[j]);
      }
      if (newPts.length < 3 || newPts.length !== newCuts.length) break;
      pts = newPts;
      cuts = newCuts;
    }
    return { id: poly.id, image: poly.image, points: pts, edgeCuts: cuts };
  }

  function faceCentroid(points) {
    var a = 0;
    var cx = 0;
    var cy = 0;
    for (var i = 0; i < points.length; i++) {
      var p = points[i];
      var q = points[(i + 1) % points.length];
      var cr = p.x * q.y - q.x * p.y;
      a += cr;
      cx += (p.x + q.x) * cr;
      cy += (p.y + q.y) * cr;
    }
    a *= 0.5;
    if (Math.abs(a) < 1e-6) {
      var b = bounds(points);
      return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
    }
    return { x: cx / (6 * a), y: cy / (6 * a) };
  }

  function ptKey(p) {
    return Math.round(p.x * 1000) + "," + Math.round(p.y * 1000);
  }

  function deleteCut(panels, cutId) {
    var list = weldJunctions(panels);
    var edges = [];
    var seen = new Set();
    for (var p = 0; p < list.length; p++) {
      var poly = list[p];
      for (var i = 0; i < poly.points.length; i++) {
        if (poly.edgeCuts[i] === cutId) continue;
        var a = poly.points[i];
        var b = poly.points[(i + 1) % poly.points.length];
        if (Math.hypot(a.x - b.x, a.y - b.y) < 0.05) continue;
        var key = ptKey(a) + ">" + ptKey(b);
        if (seen.has(key)) continue;
        seen.add(key);
        edges.push({ a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y }, cut: poly.edgeCuts[i], used: false });
      }
    }
    var adj = new Map();
    for (var e = 0; e < edges.length; e++) {
      var ak = ptKey(edges[e].a);
      if (!adj.has(ak)) adj.set(ak, []);
      adj.get(ak).push(e);
    }
    function chooseNext(edge) {
      var outs = adj.get(ptKey(edge.b)) || [];
      var vx = edge.b.x - edge.a.x;
      var vy = edge.b.y - edge.a.y;
      var best = -1;
      var bestD = 99;
      var straight = -1;
      var a0 = Math.atan2(vy, vx);
      for (var o = 0; o < outs.length; o++) {
        var ei = outs[o];
        if (edges[ei].used) continue;
        var wx = edges[ei].b.x - edges[ei].a.x;
        var wy = edges[ei].b.y - edges[ei].a.y;
        var d = Math.atan2(wy, wx) - a0;
        if (d < 0) d += Math.PI * 2;
        if (d > Math.PI * 2 - 1e-3) d = 0;
        if (d <= 1e-3) {
          if (straight < 0) straight = ei;
          continue;
        }
        if (d < bestD) { bestD = d; best = ei; }
      }
      return best >= 0 ? best : straight;
    }
    var faces = [];
    for (var s = 0; s < edges.length; s++) {
      if (edges[s].used) continue;
      var facePts = [];
      var faceCuts = [];
      var curr = s;
      var guard = 0;
      while (guard++ < edges.length + 3) {
        var edge = edges[curr];
        edge.used = true;
        facePts.push({ x: edge.a.x, y: edge.a.y });
        faceCuts.push(edge.cut);
        if (facePts.length >= 3 && ptKey(edge.b) === ptKey(facePts[0])) break;
        var next = chooseNext(edge);
        if (next < 0) break;
        curr = next;
      }
      if (facePts.length < 3 || facePts.length !== faceCuts.length) continue;
      var cleaned = ensureCW(removeSpurs({ id: null, image: null, points: facePts, edgeCuts: faceCuts }));
      if (cleaned.points.length >= 3 && Math.abs(signedArea(cleaned.points)) > 4) faces.push(cleaned);
    }
    faces.forEach(function (face) {
      var inside = [];
      for (var i = 0; i < list.length; i++) {
        var c = faceCentroid(list[i].points);
        if (pointInPoly(c, face.points)) inside.push(list[i]);
      }
      inside.sort(function (a, b) { return Math.abs(signedArea(b.points)) - Math.abs(signedArea(a.points)); });
      face.id = inside.length ? inside[0].id : null;
      var donor = null;
      for (var k = 0; k < inside.length; k++) if (inside[k].image) { donor = inside[k]; break; }
      if (!donor) {
        for (var m = 0; m < inside.length; m++) {
          if (inside[m].image && (!donor || Math.abs(signedArea(inside[m].points)) > Math.abs(signedArea(donor.points)))) donor = inside[m];
        }
      }
      face.image = donor && donor.image ? Object.assign({}, donor.image) : null;
    });
    return weldJunctions(faces);
  }

  function nearestCut(panels, point, maxDist) {
    var best = null;
    for (var i = 0; i < panels.length; i++) {
      var panel = panels[i];
      var n = panel.points.length;
      for (var e = 0; e < n; e++) {
        var id = panel.edgeCuts[e];
        if (!id) continue;
        var d = distToSegment(point, panel.points[e], panel.points[(e + 1) % n]);
        if (d <= maxDist && (!best || d < best.dist)) best = { cutId: id, dist: d };
      }
    }
    return best;
  }

  function isPageBoundary(a, b, w, h) {
    var e = 0.75;
    if (Math.abs(a.y) <= e && Math.abs(b.y) <= e) return true;
    if (Math.abs(a.y - h) <= e && Math.abs(b.y - h) <= e) return true;
    if (Math.abs(a.x) <= e && Math.abs(b.x) <= e) return true;
    if (Math.abs(a.x - w) <= e && Math.abs(b.x - w) <= e) return true;
    return false;
  }

  function lineIntersect(l1, l2) {
    var crossD = l1.dx * l2.dy - l1.dy * l2.dx;
    if (Math.abs(crossD) < 1e-10) return null;
    var dx = l2.px - l1.px;
    var dy = l2.py - l1.py;
    var t = (dx * l2.dy - dy * l2.dx) / crossD;
    return { x: l1.px + l1.dx * t, y: l1.py + l1.dy * t };
  }

  function offsetInset(points, dists) {
    var n = points.length;
    if (n < 3) return null;
    var lines = [];
    for (var i = 0; i < n; i++) {
      var a = points[i];
      var b = points[(i + 1) % n];
      var dx = b.x - a.x;
      var dy = b.y - a.y;
      var len = Math.hypot(dx, dy);
      if (len < 1e-6) return null;
      dx /= len;
      dy /= len;
      var d = dists[i] || 0;
      lines.push({
        px: a.x + (-dy) * d,
        py: a.y + dx * d,
        dx: dx,
        dy: dy
      });
    }
    var out = [];
    for (var k = 0; k < n; k++) {
      var pt = lineIntersect(lines[(k + n - 1) % n], lines[k]);
      if (!pt || !isFinite(pt.x) || !isFinite(pt.y)) return null;
      out.push(pt);
    }
    var area = signedArea(out);
    var orig = Math.abs(signedArea(points));
    if (area <= 1 || area > orig * 1.02) return null;
    return out;
  }

  function insetPolygon(panel, page) {
    var gutter = Math.max(0, page.gutter || 0);
    if (gutter <= 0) return panel.points.map(function (p) { return { x: p.x, y: p.y }; });
    var cw = ensureCW(panel);
    var dists = [];
    for (var i = 0; i < cw.points.length; i++) {
      var a = cw.points[i];
      var b = cw.points[(i + 1) % cw.points.length];
      if (!cw.edgeCuts[i] && isPageBoundary(a, b, page.width, page.height)) dists.push(0);
      else dists.push(gutter / 2);
    }
    return offsetInset(cw.points, dists);
  }

  return {
    signedArea: signedArea,
    pointInPoly: pointInPoly,
    distToSegment: distToSegment,
    bounds: bounds,
    snapAxis: snapAxis,
    rectPanel: rectPanel,
    ensureCW: ensureCW,
    splitPanel: splitPanel,
    applyCut: applyCut,
    deleteCut: deleteCut,
    nearestCut: nearestCut,
    insetPolygon: insetPolygon
  };
});
