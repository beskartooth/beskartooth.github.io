/* Draws the page. UI chrome is omitted when opts.ui is false (export). */
(function () {
  "use strict";
  var G = window.ComicStudioGeometry;

  function fontString(letter) {
    var style = letter.fontStyle === "italic" ? "italic" : "normal";
    var weight = letter.fontWeight || 400;
    return style + " " + weight + " " + letter.fontSize + "px \"" + letter.font + "\"";
  }

  function wrapLines(ctx, text, maxWidth) {
    var lines = [];
    String(text || "").split("\n").forEach(function (para) {
      var words = para.split(/\s+/).filter(Boolean);
      if (!words.length) { lines.push(""); return; }
      var line = words[0];
      for (var i = 1; i < words.length; i++) {
        var test = line + " " + words[i];
        if (ctx.measureText(test).width <= maxWidth) line = test;
        else { lines.push(line); line = words[i]; }
      }
      lines.push(line);
    });
    return lines.slice(0, 16);
  }

  function trace(ctx, points) {
    ctx.beginPath();
    addLoop(ctx, points, false);
  }

  function addLoop(ctx, points, reverse) {
    if (!points || !points.length) return;
    if (!reverse) {
      ctx.moveTo(points[0].x, points[0].y);
      for (var i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
    } else {
      ctx.moveTo(points[0].x, points[0].y);
      for (var j = points.length - 1; j >= 1; j--) ctx.lineTo(points[j].x, points[j].y);
    }
    ctx.closePath();
  }

  function devicePixel(ctx) {
    var m = ctx.getTransform();
    var scale = Math.hypot(m.a, m.b);
    return scale > 1e-6 ? 1 / scale : 1;
  }

  function dotSettings(page) {
    var d = page && page.dots;
    if (!d || !d.enabled) return null;
    var size = Number(d.size);
    var strength = Number(d.strength);
    if (!isFinite(size)) size = 6;
    if (!isFinite(strength)) strength = 85;
    size = Math.max(3, Math.min(22, size));
    strength = Math.max(0, Math.min(100, strength)) / 100;
    if (strength <= 0.001) return null;
    return { size: size, strength: strength };
  }

  function paintPlacedImage(ctx, img, placed) {
    var w = img.naturalWidth * placed.scale;
    var h = img.naturalHeight * placed.scale;
    ctx.translate(placed.cx, placed.cy);
    ctx.rotate((placed.rotation || 0) * Math.PI / 180);
    ctx.scale(placed.flipX ? -1 : 1, placed.flipY ? -1 : 1);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
  }

  // Clustered CMYK dots. Coverage sets the radius, so shadows print bigger dots
  // and highlights fall back to paper. Angles are the usual process set.
  function screenBitmap(canvas, originX, originY, pitch, strength) {
    var w = canvas.width;
    var h = canvas.height;
    var ctx = canvas.getContext("2d", { willReadFrequently: true });
    var image = ctx.getImageData(0, 0, w, h);
    var d = image.data;
    var inv = 1 / pitch;
    var edge = inv;
    if (edge > 0.42) edge = 0.42;
    var gain = 0.35 + 0.65 * strength;
    var keep = 1 - strength;
    var diag = 1.41421356237;
    var c15 = Math.cos(15 * Math.PI / 180);
    var s15 = Math.sin(15 * Math.PI / 180);
    var c75 = Math.cos(75 * Math.PI / 180);
    var s75 = Math.sin(75 * Math.PI / 180);
    var c45 = Math.cos(Math.PI / 4);
    var s45 = Math.sin(Math.PI / 4);
    for (var y = 0; y < h; y++) {
      var gy = originY + y;
      var row = y * w * 4;
      for (var x = 0; x < w; x++) {
        var i = row + x * 4;
        var a = d[i + 3];
        if (a < 8) continue;
        var r = d[i] / 255;
        var g = d[i + 1] / 255;
        var b = d[i + 2] / 255;
        var max = r > g ? (r > b ? r : b) : (g > b ? g : b);
        var k0 = 1 - max;
        var denom = 1 - k0;
        var C = (denom < 1e-4 ? 0 : (1 - r - k0) / denom) * gain;
        var M = (denom < 1e-4 ? 0 : (1 - g - k0) / denom) * gain;
        var Y = (denom < 1e-4 ? 0 : (1 - b - k0) / denom) * gain;
        k0 *= gain;
        var gx = originX + x;
        var inkR = 1;
        var inkG = 1;
        var inkB = 1;
        var u = (gx * c15 + gy * s15) * inv;
        var v = (-gx * s15 + gy * c15) * inv;
        var dx = (u - Math.floor(u)) - 0.5;
        var dy = (v - Math.floor(v)) - 0.5;
        var dist = Math.sqrt(dx * dx + dy * dy) * diag;
        var fade = (C - dist) / edge;
        if (fade > 0) {
          if (fade > 1) fade = 1;
          inkR *= 1 - fade;
        }
        u = (gx * c75 + gy * s75) * inv;
        v = (-gx * s75 + gy * c75) * inv;
        dx = (u - Math.floor(u)) - 0.5;
        dy = (v - Math.floor(v)) - 0.5;
        dist = Math.sqrt(dx * dx + dy * dy) * diag;
        fade = (M - dist) / edge;
        if (fade > 0) {
          if (fade > 1) fade = 1;
          inkG *= 1 - fade;
        }
        u = gx * inv;
        v = gy * inv;
        dx = (u - Math.floor(u)) - 0.5;
        dy = (v - Math.floor(v)) - 0.5;
        dist = Math.sqrt(dx * dx + dy * dy) * diag;
        fade = (Y - dist) / edge;
        if (fade > 0) {
          if (fade > 1) fade = 1;
          inkB *= 1 - fade;
        }
        u = (gx * c45 + gy * s45) * inv;
        v = (-gx * s45 + gy * c45) * inv;
        dx = (u - Math.floor(u)) - 0.5;
        dy = (v - Math.floor(v)) - 0.5;
        dist = Math.sqrt(dx * dx + dy * dy) * diag;
        fade = (k0 - dist) / edge;
        if (fade > 0) {
          if (fade > 1) fade = 1;
          var nk = 1 - fade;
          inkR *= nk;
          inkG *= nk;
          inkB *= nk;
        }
        d[i] = d[i] * keep + inkR * 255 * strength;
        d[i + 1] = d[i + 1] * keep + inkG * 255 * strength;
        d[i + 2] = d[i + 2] * keep + inkB * 255 * strength;
      }
    }
    ctx.putImageData(image, 0, 0);
  }

  function clamp01(n) { return n < 0 ? 0 : n > 1 ? 1 : n; }

  function gradeSettings(page) {
    var g = page && page.grade;
    function n(v) {
      var x = Number(v);
      if (!isFinite(x)) x = 0;
      return Math.max(-100, Math.min(100, x));
    }
    var look = g && (g.look === "bw" || g.look === "pencil") ? g.look : "none";
    return {
      exposure: n(g && g.exposure),
      contrast: n(g && g.contrast),
      highlights: n(g && g.highlights),
      shadows: n(g && g.shadows),
      saturation: n(g && g.saturation),
      warmth: n(g && g.warmth),
      tint: n(g && g.tint),
      look: look
    };
  }

  function gradeActive(g) {
    if (!g) return false;
    return g.look !== "none" || g.exposure || g.contrast || g.highlights || g.shadows || g.saturation || g.warmth || g.tint;
  }

  function toneRGB(r, g, b, grade) {
    var exp = Math.pow(2, grade.exposure / 70);
    r *= exp;
    g *= exp;
    b *= exp;
    var contrast = 1 + grade.contrast / 100;
    r = (r - 0.5) * contrast + 0.5;
    g = (g - 0.5) * contrast + 0.5;
    b = (b - 0.5) * contrast + 0.5;
    var luma = r * 0.2126 + g * 0.7152 + b * 0.0722;
    var shadowW = (1 - clamp01(luma));
    shadowW *= shadowW;
    var highW = clamp01(luma);
    highW *= highW;
    var lift = grade.shadows / 100 * 0.45 * shadowW + grade.highlights / 100 * 0.35 * highW;
    r += lift;
    g += lift;
    b += lift;
    luma = r * 0.2126 + g * 0.7152 + b * 0.0722;
    var sat = 1 + grade.saturation / 100;
    r = luma + (r - luma) * sat;
    g = luma + (g - luma) * sat;
    b = luma + (b - luma) * sat;
    var warm = grade.warmth / 100 * 0.22;
    var tint = grade.tint / 100 * 0.18;
    r += warm;
    b -= warm;
    g += tint;
    r -= tint * 0.35;
    b -= tint * 0.35;
    return [r, g, b];
  }

  function applyLook(r, g, b, grade, edge) {
    r = clamp01(r);
    g = clamp01(g);
    b = clamp01(b);
    if (grade.look !== "bw" && grade.look !== "pencil") return [r, g, b];
    var luma = r * 0.2126 + g * 0.7152 + b * 0.0722;
    if (grade.look === "bw") return [luma, luma, luma];
    var line = Math.min(1, (edge || 0) * 6 + (1 - luma) * 0.12);
    var v = 0.96 * (1 - Math.min(1, line));
    return [v * 0.98, v * 0.95, v * 0.9];
  }

  function gradeCss(hex, grade) {
    if (!gradeActive(grade) || !/^#[0-9a-fA-F]{6}$/.test(hex)) return hex;
    var r = parseInt(hex.slice(1, 3), 16) / 255;
    var g = parseInt(hex.slice(3, 5), 16) / 255;
    var b = parseInt(hex.slice(5, 7), 16) / 255;
    var t = toneRGB(r, g, b, grade);
    var o = applyLook(t[0], t[1], t[2], grade, 0);
    function h(n) {
      var v = Math.round(clamp01(n) * 255);
      return (v < 16 ? "0" : "") + v.toString(16);
    }
    return "#" + h(o[0]) + h(o[1]) + h(o[2]);
  }

  function gradeBitmap(canvas, grade) {
    if (!gradeActive(grade)) return;
    var w = canvas.width;
    var h = canvas.height;
    var ctx = canvas.getContext("2d", { willReadFrequently: true });
    var image = ctx.getImageData(0, 0, w, h);
    var d = image.data;
    var lum = new Float32Array(w * h);
    var pencil = grade.look === "pencil";
    var y;
    var x;
    for (y = 0; y < h; y++) {
      for (x = 0; x < w; x++) {
        var i = (y * w + x) * 4;
        if (d[i + 3] < 8) continue;
        var t = toneRGB(d[i] / 255, d[i + 1] / 255, d[i + 2] / 255, grade);
        lum[y * w + x] = t[0] * 0.2126 + t[1] * 0.7152 + t[2] * 0.0722;
        d[i] = t[0] * 255;
        d[i + 1] = t[1] * 255;
        d[i + 2] = t[2] * 255;
      }
    }
    for (y = 0; y < h; y++) {
      for (x = 0; x < w; x++) {
        var p = y * w + x;
        var j = p * 4;
        if (d[j + 3] < 8) continue;
        var edge = 0;
        if (pencil) {
          if (x > 0) edge += Math.abs(lum[p] - lum[p - 1]);
          if (y > 0) edge += Math.abs(lum[p] - lum[p - w]);
        }
        var o = applyLook(d[j] / 255, d[j + 1] / 255, d[j + 2] / 255, grade, edge);
        if (pencil) {
          var n = (x * 374761393 + y * 668265263) | 0;
          n = Math.imul(n ^ (n >>> 13), 1274126177);
          var grain = ((n ^ (n >>> 16)) >>> 0) / 4294967296;
          o[0] = clamp01(o[0] * (0.97 + grain * 0.045));
          o[1] = clamp01(o[1] * (0.97 + grain * 0.045));
          o[2] = clamp01(o[2] * (0.97 + grain * 0.045));
        }
        d[j] = o[0] * 255;
        d[j + 1] = o[1] * 255;
        d[j + 2] = o[2] * 255;
      }
    }
    ctx.putImageData(image, 0, 0);
  }

  var dotCache = new Map();
  function screenedImage(ctx, img, placed, clipShape, settings, grade) {
    var scale = 1 / devicePixel(ctx);
    var b = G.bounds(clipShape);
    var pad = 2;
    var x0 = Math.floor(b.x * scale) - pad;
    var y0 = Math.floor(b.y * scale) - pad;
    var cw = Math.max(1, Math.ceil((b.x + b.w) * scale) + pad - x0);
    var ch = Math.max(1, Math.ceil((b.y + b.h) * scale) + pad - y0);
    var pts = "";
    for (var p = 0; p < clipShape.length; p++) {
      pts += Math.round(clipShape[p].x) + "," + Math.round(clipShape[p].y) + ";";
    }
    var key = [
      placed.id, img.naturalWidth, img.naturalHeight,
      Math.round(placed.cx * 10), Math.round(placed.cy * 10),
      Math.round(placed.scale * 1000), Math.round((placed.rotation || 0) * 10),
      placed.flipX ? 1 : 0, placed.flipY ? 1 : 0,
      settings ? settings.size : 0, settings ? Math.round(settings.strength * 100) : 0,
      grade ? [grade.exposure, grade.contrast, grade.highlights, grade.shadows, grade.saturation, grade.warmth, grade.tint, grade.look].join(",") : "",
      Math.round(scale * 100),
      cw, ch, pts
    ].join("|");
    var off = dotCache.get(key);
    if (!off) {
      off = document.createElement("canvas");
      off.width = cw;
      off.height = ch;
      var octx = off.getContext("2d", { willReadFrequently: true });
      octx.setTransform(scale, 0, 0, scale, -x0, -y0);
      octx.beginPath();
      addLoop(octx, clipShape, false);
      octx.clip();
      paintPlacedImage(octx, img, placed);
      if (grade && gradeActive(grade)) gradeBitmap(off, grade);
      if (settings) screenBitmap(off, x0, y0, Math.max(1.5, settings.size * scale), settings.strength);
      dotCache.set(key, off);
      if (dotCache.size > 8) dotCache.delete(dotCache.keys().next().value);
    }
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(off, x0, y0);
    ctx.restore();
  }

  function panelShape(panel, page) {
    return G.insetPolygon(panel, page) || panel.points;
  }

  function inEllipse(cx, cy, rx, ry, x, y) {
    var dx = (x - cx) / Math.max(rx, 1);
    var dy = (y - cy) / Math.max(ry, 1);
    return dx * dx + dy * dy <= 1;
  }

  function traceBalloon(ctx, cx, cy, rx, ry, tx, ty) {
    rx = Math.max(rx, 1);
    ry = Math.max(ry, 1);
    if (inEllipse(cx, cy, rx, ry, tx, ty)) {
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      return;
    }
    var t = Math.atan2((ty - cy) / ry, (tx - cx) / rx);
    var spread = 0.42;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, t + spread, t - spread, false);
    ctx.lineTo(tx, ty);
    ctx.closePath();
  }

  function traceCloud(ctx, cx, cy, rx, ry) {
    var n = 16;
    var amp = Math.min(rx, ry) * 0.14;
    ctx.beginPath();
    for (var i = 0; i < n; i++) {
      var t0 = (i / n) * Math.PI * 2;
      var t1 = ((i + 0.5) / n) * Math.PI * 2;
      var t2 = ((i + 1) / n) * Math.PI * 2;
      var x0 = cx + Math.cos(t0) * rx;
      var y0 = cy + Math.sin(t0) * ry;
      var x1 = cx + Math.cos(t1) * (rx + amp);
      var y1 = cy + Math.sin(t1) * (ry + amp);
      var x2 = cx + Math.cos(t2) * rx;
      var y2 = cy + Math.sin(t2) * ry;
      if (i === 0) ctx.moveTo(x0, y0);
      ctx.quadraticCurveTo(x1, y1, x2, y2);
    }
    ctx.closePath();
  }

  function traceRoundRect(ctx, x, y, w, h, r) {
    var radius = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  function fillStroke(ctx, fill, stroke, width) {
    ctx.fillStyle = fill;
    ctx.fill();
    if (width > 0) {
      ctx.lineWidth = width;
      ctx.strokeStyle = stroke;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.stroke();
    }
  }

  function fillScreenedText(ctx, letter, text, page) {
    var dots = dotSettings(page);
    if (!dots) {
      ctx.fillStyle = letter.fill;
      ctx.fillText(text, 0, 0);
      return;
    }
    var metrics = ctx.measureText(text);
    var scale = 1 / devicePixel(ctx);
    var pad = letter.fontSize * 0.85;
    var pw = Math.max(1, metrics.width + pad * 2);
    var ph = letter.fontSize * 2.5;
    var bw = Math.max(1, Math.ceil(pw * scale));
    var bh = Math.max(1, Math.ceil(ph * scale));
    if (bw * bh > 1500000) {
      ctx.fillStyle = letter.fill;
      ctx.fillText(text, 0, 0);
      return;
    }
    var c = document.createElement("canvas");
    c.width = bw;
    c.height = bh;
    var o = c.getContext("2d", { willReadFrequently: true });
    o.setTransform(scale, 0, 0, scale, bw / 2, bh / 2);
    o.font = ctx.font;
    o.textAlign = "center";
    o.textBaseline = "middle";
    o.fillStyle = letter.fill || "#111111";
    o.fillText(text, 0, 0);
    screenBitmap(c, 0, 0, Math.max(1.5, dots.size * scale), dots.strength);
    ctx.drawImage(c, -pw / 2, -ph / 2, pw, ph);
  }

  function paintGlyph(ctx, letter, text, x, y, rot, scale, page) {
    ctx.save();
    ctx.translate(x, y);
    if (rot) ctx.rotate(rot);
    if (scale && scale !== 1) ctx.scale(scale, scale);
    ctx.lineJoin = "round";
    ctx.miterLimit = 2;
    var hi = Math.max(0, Number(letter.highlightWidth) || 0);
    if (hi > 0 && /^#[0-9a-fA-F]{6}$/.test(letter.highlight || "")) {
      ctx.lineWidth = hi;
      ctx.strokeStyle = letter.highlight;
      ctx.strokeText(text, 0, 0);
    }
    var sketch = Math.max(0, Math.min(100, Number(letter.sketch) || 0));
    if (sketch > 0) {
      var amp = Math.max(0.35, letter.fontSize * sketch / 100 * 0.055);
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = Math.max(1, letter.fontSize * (0.03 + sketch / 900));
      ctx.strokeStyle = "#3a342c";
      for (var s = 0; s < 4; s++) {
        var ox = ((s % 2) ? 1 : -1) * amp * (0.55 + (s % 3) * 0.22);
        var oy = (s < 2 ? -1 : 1) * amp * 0.4;
        ctx.strokeText(text, ox, oy);
      }
      ctx.restore();
    }
    if (letter.strokeWidth > 0) {
      ctx.lineWidth = letter.strokeWidth;
      ctx.strokeStyle = letter.stroke;
      ctx.strokeText(text, 0, 0);
    }
    if (letter.halftone && page) fillScreenedText(ctx, letter, text, page);
    else {
      ctx.fillStyle = letter.fill;
      ctx.fillText(text, 0, 0);
    }
    ctx.restore();
  }

  function drawWarpedLine(ctx, letter, text, yBase, page) {
    var widths = [];
    var total = 0;
    for (var i = 0; i < text.length; i++) {
      var w = ctx.measureText(text.charAt(i)).width;
      widths.push(w);
      total += w;
    }
    if (!total) return;
    var amount = Math.max(-100, Math.min(100, Number(letter.warpAmount) || 0)) / 100;
    var kind = letter.warp || "";
    var persp = Math.max(-1, Math.min(1, Number(letter.perspective) || 0));
    var cursor = -total / 2;
    for (var c = 0; c < text.length; c++) {
      var gx = cursor + widths[c] / 2;
      var gy = yBase;
      var rot = 0;
      var scale = 1;
      if (kind === "arc" && amount) {
        var sweep = amount * Math.PI * 0.85;
        var u = (gx + total / 2) / total;
        var ang = (u - 0.5) * sweep;
        var radius = Math.abs(sweep) < 0.08 ? total : total / sweep;
        gx = Math.sin(ang) * radius;
        gy = yBase + (1 - Math.cos(ang)) * radius * (amount < 0 ? -0.45 : 0.45);
        rot = ang;
      } else if (kind === "wave" && amount) {
        var freq = Math.PI * 2 / Math.max(letter.fontSize * 2.2, 24);
        gy = yBase + Math.sin(gx * freq) * amount * letter.fontSize * 0.65;
        rot = Math.cos(gx * freq) * amount * 0.55;
      } else if (kind === "bulge" && amount) {
        var t = Math.min(1, Math.abs(gx) / (total / 2));
        scale = Math.max(0.35, 1 + (1 - t) * amount * 0.85);
      }
      if (persp) scale *= Math.max(0.3, 1 + persp * (gy / Math.max(letter.h / 2, 1)));
      paintGlyph(ctx, letter, text.charAt(c), gx, gy, rot, scale, page);
      cursor += widths[c];
    }
  }

  function drawText(ctx, letter, maxWidth, page) {
    ctx.save();
    ctx.font = fontString(letter);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.miterLimit = 2;
    var shearX = (Number(letter.skewX) || 0) / Math.max(letter.h, 1);
    var shearY = (Number(letter.skewY) || 0) / Math.max(letter.w, 1);
    if (shearX || shearY) ctx.transform(1, shearY, shearX, 1, 0, 0);
    var lines = wrapLines(ctx, letter.text, Math.max(8, maxWidth));
    var lh = letter.fontSize * 1.15;
    var y = -((lines.length - 1) * lh) / 2;
    var warped = (letter.warp === "arc" || letter.warp === "wave" || letter.warp === "bulge") && Number(letter.warpAmount);
    var persp = Number(letter.perspective);
    for (var i = 0; i < lines.length; i++) {
      if (warped || persp) drawWarpedLine(ctx, letter, lines[i], y, page);
      else paintGlyph(ctx, letter, lines[i], 0, y, 0, 1, page);
      y += lh;
    }
    ctx.restore();
  }

  function drawTrail(ctx, letter, cx, cy) {
    if (!letter.tail) return;
    var tx = cx + letter.tail.dx;
    var ty = cy + letter.tail.dy;
    var rx = letter.w / 2;
    var ry = letter.h / 2;
    var ts = [0.58, 0.76, 0.92];
    var rs = [0.16, 0.1, 0.055];
    ctx.fillStyle = letter.shapeFill;
    ctx.strokeStyle = letter.shapeStroke;
    ctx.lineWidth = Math.max(2, letter.shapeStrokeWidth * 0.65);
    for (var i = 0; i < 3; i++) {
      var x = cx + (tx - cx) * ts[i];
      var y = cy + (ty - cy) * ts[i];
      var dx = (x - cx) / Math.max(rx, 1);
      var dy = (y - cy) / Math.max(ry, 1);
      if (dx * dx + dy * dy < 0.92) continue;
      ctx.beginPath();
      ctx.arc(x, y, Math.max(3, Math.min(rx, ry) * rs[i]), 0, Math.PI * 2);
      ctx.fill();
      if (letter.shapeStrokeWidth > 0) ctx.stroke();
    }
  }

  function drawLetter(ctx, letter, hideText, page) {
    var cx = letter.x + letter.w / 2;
    var cy = letter.y + letter.h / 2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((letter.rotation || 0) * Math.PI / 180);
    if (letter.type === "bubble") {
      var tx = letter.tail ? letter.tail.dx : 0;
      var ty = letter.tail ? letter.tail.dy : letter.h;
      traceBalloon(ctx, 0, 0, letter.w / 2, letter.h / 2, tx, ty);
      fillStroke(ctx, letter.shapeFill, letter.shapeStroke, letter.shapeStrokeWidth);
    } else if (letter.type === "thought") {
      traceCloud(ctx, 0, 0, letter.w / 2, letter.h / 2);
      fillStroke(ctx, letter.shapeFill, letter.shapeStroke, letter.shapeStrokeWidth);
      ctx.restore();
      drawTrail(ctx, letter, cx, cy);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate((letter.rotation || 0) * Math.PI / 180);
    } else if (letter.type === "caption") {
      traceRoundRect(ctx, -letter.w / 2, -letter.h / 2, letter.w, letter.h, 10);
      fillStroke(ctx, letter.shapeFill, letter.shapeStroke, letter.shapeStrokeWidth);
    }
    if (!hideText) {
      var maxW = letter.w * (letter.type === "sfx" ? 0.98 : letter.type === "caption" ? 0.86 : letter.type === "thought" ? 0.62 : 0.72);
      if (letter.type !== "sfx") {
        ctx.save();
        if (letter.type === "caption") {
          traceRoundRect(ctx, -letter.w / 2 + 8, -letter.h / 2 + 6, letter.w - 16, letter.h - 12, 6);
        } else {
          ctx.beginPath();
          ctx.ellipse(0, 0, Math.max(1, letter.w * 0.36), Math.max(1, letter.h * 0.32), 0, 0, Math.PI * 2);
        }
        ctx.clip();
        drawText(ctx, letter, maxW, page);
        ctx.restore();
      } else {
        drawText(ctx, letter, maxW, page);
      }
    }
    ctx.restore();
  }

  function imagePoint(image, lx, ly) {
    var a = (image.rotation || 0) * Math.PI / 180;
    var cos = Math.cos(a);
    var sin = Math.sin(a);
    return {
      x: image.cx + lx * cos - ly * sin,
      y: image.cy + lx * sin + ly * cos
    };
  }

  function imageKnob(image, unit, page) {
    var h = Math.max(1, image.height * image.scale);
    var margin = 16 * unit;
    var outside = imagePoint(image, 0, -h / 2 - 22 * unit);
    var onPage = !page || (
      outside.x >= margin && outside.y >= margin &&
      outside.x <= page.width - margin && outside.y <= page.height - margin
    );
    if (onPage) return outside;
    var inside = imagePoint(image, 0, -Math.max(0, h / 2 - 34 * unit));
    if (page) {
      inside.x = Math.max(margin, Math.min(page.width - margin, inside.x));
      inside.y = Math.max(margin, Math.min(page.height - margin, inside.y));
    }
    return inside;
  }

  function drawImageFrame(ctx, image, unit, page) {
    var w = image.width * image.scale;
    var h = image.height * image.scale;
    var corners = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]];
    ctx.save();
    ctx.strokeStyle = "#8eb6ff";
    ctx.lineWidth = 1.5 * unit;
    ctx.setLineDash([5 * unit, 4 * unit]);
    ctx.beginPath();
    corners.forEach(function (c, i) {
      var p = imagePoint(image, c[0], c[1]);
      if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
    });
    ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);
    var top = imagePoint(image, 0, -h / 2);
    var knob = imageKnob(image, unit, page);
    ctx.beginPath();
    ctx.moveTo(top.x, top.y);
    ctx.lineTo(knob.x, knob.y);
    ctx.strokeStyle = "#8eb6ff";
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(knob.x, knob.y, 6 * unit, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = "#2d6adf";
    ctx.lineWidth = 1.5 * unit;
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function rot(letter, lx, ly) {
    var cx = letter.x + letter.w / 2;
    var cy = letter.y + letter.h / 2;
    var a = (letter.rotation || 0) * Math.PI / 180;
    var cos = Math.cos(a);
    var sin = Math.sin(a);
    return { x: cx + lx * cos - ly * sin, y: cy + lx * sin + ly * cos };
  }

  function drawHandles(ctx, letter, unit) {
    var hw = letter.w / 2;
    var hh = letter.h / 2;
    var corners = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]];
    ctx.save();
    ctx.strokeStyle = "#8eb6ff";
    ctx.lineWidth = 1.5 * unit;
    ctx.setLineDash([5 * unit, 4 * unit]);
    ctx.beginPath();
    corners.forEach(function (c, i) {
      var p = rot(letter, c[0], c[1]);
      if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
    });
    ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);
    var s = 8 * unit;
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = "#2d6adf";
    ctx.lineWidth = 1.25 * unit;
    [[-hw, -hh], [0, -hh], [hw, -hh], [hw, 0], [hw, hh], [0, hh], [-hw, hh], [-hw, 0]].forEach(function (c) {
      var p = rot(letter, c[0], c[1]);
      ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
      ctx.strokeRect(p.x - s / 2, p.y - s / 2, s, s);
    });
    var knob = rot(letter, 0, -hh - 22 * unit);
    var top = rot(letter, 0, -hh);
    ctx.beginPath();
    ctx.moveTo(top.x, top.y);
    ctx.lineTo(knob.x, knob.y);
    ctx.strokeStyle = "#8eb6ff";
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(knob.x, knob.y, 5.5 * unit, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.stroke();
    if (letter.tail) {
      var tip = { x: letter.x + letter.w / 2 + letter.tail.dx, y: letter.y + letter.h / 2 + letter.tail.dy };
      ctx.beginPath();
      ctx.arc(tip.x, tip.y, 6 * unit, 0, Math.PI * 2);
      ctx.fillStyle = "#e2a23a";
      ctx.strokeStyle = "#241a09";
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  function renderPage(ctx, doc, getImage, opts) {
    opts = opts || {};
    var page = doc.page;
    var unit = opts.unit || 1;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, page.width, page.height);
    ctx.clip();
    var grade = gradeSettings(page);
    ctx.fillStyle = gradeCss(page.background, grade);
    ctx.fillRect(0, 0, page.width, page.height);
    var borderOn = page.border && page.border.enabled && page.border.width > 0;
    doc.panels.forEach(function (panel) {
      var shape = panelShape(panel, page);
      var inner = borderOn ? G.insetPoints(shape, page.border.width) : null;
      var clipShape = shape;
      if (inner) {
        var tuck = Math.min(page.border.width * 0.5, devicePixel(ctx) * 1.5);
        clipShape = G.insetPoints(shape, Math.max(page.border.width - tuck, 0)) || inner;
      }
      if (panel.image) {
        var img = getImage(panel.image.id);
        if (img && img.complete && img.naturalWidth) {
          var dots = dotSettings(page);
          if (dots || gradeActive(grade)) {
            screenedImage(ctx, img, panel.image, clipShape, dots, grade);
          } else {
            ctx.save();
            trace(ctx, clipShape);
            ctx.clip();
            paintPlacedImage(ctx, img, panel.image);
            ctx.restore();
          }
        }
      }
      if (inner) {
        // One filled band, overlapped a fraction of a pixel into the gutter.
        // A stroke clipped to the artwork edge leaves a hairline of the picture there.
        var overlap = devicePixel(ctx) * 0.75;
        var outer = G.insetPoints(shape, -overlap) || shape;
        ctx.save();
        ctx.beginPath();
        addLoop(ctx, outer, false);
        addLoop(ctx, inner, true);
        ctx.fillStyle = gradeCss(page.border.color, grade);
        ctx.fill("evenodd");
        ctx.restore();
      } else if (borderOn) {
        ctx.save();
        trace(ctx, shape);
        ctx.clip();
        ctx.lineWidth = page.border.width * 2;
        ctx.strokeStyle = gradeCss(page.border.color, grade);
        ctx.lineJoin = "round";
        ctx.stroke();
        ctx.restore();
      }
      if (opts.dropId === panel.id) {
        ctx.save();
        trace(ctx, shape);
        ctx.fillStyle = "rgba(226, 162, 58, 0.28)";
        ctx.fill();
        ctx.restore();
      }
    });
    doc.letters.forEach(function (letter) {
      drawLetter(ctx, letter, opts.hideTextId === letter.id, page);
    });
    if (opts.previewLetter) {
      ctx.save();
      ctx.globalAlpha = 0.9;
      drawLetter(ctx, opts.previewLetter, false, page);
      ctx.restore();
    }
    if (!opts.ui) { ctx.restore(); return; }

    if (opts.cutPoints && opts.cutPoints.length) {
      var preview = opts.cutPoints.slice();
      if (opts.cutCursor) preview.push(opts.cutCursor);
      if (preview.length >= 2) {
        var lastA = preview[preview.length - 2];
        var lastB = preview[preview.length - 1];
        doc.panels.forEach(function (panel) {
          if (G.splitPanel(panel, lastA, lastB, "preview")) {
            ctx.save();
            trace(ctx, panelShape(panel, page));
            ctx.fillStyle = "rgba(226, 162, 58, 0.16)";
            ctx.fill();
            ctx.restore();
          }
        });
      }
      ctx.save();
      ctx.strokeStyle = "#e2a23a";
      ctx.fillStyle = "#e2a23a";
      ctx.lineWidth = 2 * unit;
      ctx.setLineDash([7 * unit, 5 * unit]);
      ctx.beginPath();
      ctx.moveTo(preview[0].x, preview[0].y);
      for (var c = 1; c < preview.length; c++) ctx.lineTo(preview[c].x, preview[c].y);
      ctx.stroke();
      ctx.setLineDash([]);
      preview.forEach(function (p) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4 * unit, 0, Math.PI * 2);
        ctx.fill();
      });
      if (opts.cutSnap) {
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(opts.cutSnap.x, opts.cutSnap.y, 6 * unit, 0, Math.PI * 2);
        ctx.fillStyle = "#fff";
        ctx.fill();
        ctx.lineWidth = 2 * unit;
        ctx.stroke();
      }
      ctx.restore();
    } else if (opts.cutLine) {
      doc.panels.forEach(function (panel) {
        if (G.splitPanel(panel, opts.cutLine.a, opts.cutLine.b, "preview")) {
          ctx.save();
          trace(ctx, panelShape(panel, page));
          ctx.fillStyle = "rgba(226, 162, 58, 0.16)";
          ctx.fill();
          ctx.restore();
        }
      });
      ctx.save();
      ctx.strokeStyle = "#e2a23a";
      ctx.lineWidth = 2 * unit;
      ctx.setLineDash([7 * unit, 5 * unit]);
      ctx.beginPath();
      ctx.moveTo(opts.cutLine.a.x, opts.cutLine.a.y);
      ctx.lineTo(opts.cutLine.b.x, opts.cutLine.b.y);
      ctx.stroke();
      ctx.restore();
    }
    if (opts.cutHandles && opts.cutHandles.length) {
      ctx.save();
      opts.cutHandles.forEach(function (p) {
        var r = 7 * unit;
        if (p.kind === "x") {
          ctx.strokeStyle = "#e36b5d";
          ctx.lineWidth = 2 * unit;
          ctx.beginPath();
          ctx.moveTo(p.x - r, p.y - r);
          ctx.lineTo(p.x + r, p.y + r);
          ctx.moveTo(p.x + r, p.y - r);
          ctx.lineTo(p.x - r, p.y + r);
          ctx.stroke();
          return;
        }
        ctx.beginPath();
        if (p.kind === "mid") ctx.arc(p.x, p.y, r * 0.75, 0, Math.PI * 2);
        else ctx.rect(p.x - r, p.y - r, r * 2, r * 2);
        ctx.fillStyle = "#fff";
        ctx.strokeStyle = "#e2a23a";
        ctx.lineWidth = 2 * unit;
        ctx.fill();
        ctx.stroke();
      });
      ctx.restore();
    }
    if (opts.hoverCut) {
      ctx.save();
      ctx.strokeStyle = "rgba(226, 162, 58, 0.95)";
      ctx.lineWidth = 4 * unit;
      ctx.lineCap = "round";
      doc.panels.forEach(function (panel) {
        for (var i = 0; i < panel.points.length; i++) {
          if (panel.edgeCuts[i] !== opts.hoverCut) continue;
          var a = panel.points[i];
          var b = panel.points[(i + 1) % panel.points.length];
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      });
      ctx.restore();
    }
    if (opts.selection && opts.selection.type === "panel") {
      var selected = null;
      for (var i = 0; i < doc.panels.length; i++) if (doc.panels[i].id === opts.selection.id) selected = doc.panels[i];
      if (selected) {
        ctx.save();
        trace(ctx, panelShape(selected, page));
        ctx.strokeStyle = "#8eb6ff";
        ctx.lineWidth = 2 * unit;
        ctx.setLineDash([6 * unit, 4 * unit]);
        ctx.stroke();
        ctx.restore();
        if (selected.image) drawImageFrame(ctx, selected.image, unit, page);
      }
    }
    if (opts.selection && opts.selection.type === "letter") {
      var letter = null;
      for (var j = 0; j < doc.letters.length; j++) if (doc.letters[j].id === opts.selection.id) letter = doc.letters[j];
      if (letter) drawHandles(ctx, letter, unit);
    }
    if (doc.panels.length === 1 && !doc.panels[0].image && !doc.letters.length && !opts.previewLetter) {
      ctx.save();
      ctx.fillStyle = "rgba(20, 20, 20, 0.45)";
      ctx.font = (22 * unit) + "px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("Drop an image, or pick a layout", page.width / 2, page.height / 2);
      ctx.restore();
    }
    ctx.restore();
  }

  var fontsReady = null;
  function ensureFonts() {
    if (!fontsReady) {
      var families = (window.ComicStudioDocument && window.ComicStudioDocument.FONTS) || [];
      fontsReady = Promise.all(families.map(function (item) {
        var style = item.style === "italic" ? "italic" : "normal";
        return document.fonts.load(style + " " + (item.weight || 400) + " 16px \"" + item.family + "\"");
      })).then(function () { return document.fonts.ready; });
    }
    return fontsReady;
  }

  function decodeAll(doc, imageMap) {
    var cache = new Map();
    var jobs = [];
    doc.panels.forEach(function (panel) {
      if (!panel.image) return;
      var url = imageMap.get(panel.image.id);
      if (!url) return;
      jobs.push(new Promise(function (resolve, reject) {
        var img = new Image();
        img.onload = function () { cache.set(panel.image.id, img); resolve(); };
        img.onerror = function () { reject(new Error("Could not draw an image.")); };
        img.src = url;
      }));
    });
    return Promise.all(jobs).then(function () { return cache; });
  }

  function renderBlob(doc, imageMap, mime) {
    return ensureFonts().then(function () {
      return decodeAll(doc, imageMap);
    }).then(function (cache) {
      var pw = Math.max(1, Math.round(doc.page.width));
      var ph = Math.max(1, Math.round(doc.page.height));
      var longEdge = Math.max(pw, ph);
      var scale = longEdge >= 3840 ? 1 : Math.min(3, 3840 / longEdge);
      var maxPixels = 48 * 1024 * 1024;
      if (pw * scale * ph * scale > maxPixels) scale = Math.sqrt(maxPixels / (pw * ph));
      if (!(scale > 1.05)) scale = 1;
      var canvas = document.createElement("canvas");
      canvas.width = pw;
      canvas.height = ph;
      var ctx = canvas.getContext("2d", { alpha: false });
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      var paint = function (target, drawScale) {
        var tctx = target.getContext("2d", { alpha: false });
        tctx.imageSmoothingEnabled = true;
        tctx.imageSmoothingQuality = "high";
        tctx.setTransform(drawScale, 0, 0, drawScale, 0, 0);
        renderPage(tctx, doc, function (id) { return cache.get(id) || null; }, { ui: false, unit: 1 });
      };
      if (scale === 1) paint(canvas, 1);
      else {
        var hi = document.createElement("canvas");
        hi.width = Math.max(1, Math.round(pw * scale));
        hi.height = Math.max(1, Math.round(ph * scale));
        paint(hi, hi.width / pw);
        ctx.drawImage(hi, 0, 0, pw, ph);
      }
      return new Promise(function (resolve, reject) {
        canvas.toBlob(function (blob) {
          if (!blob) reject(new Error("Export failed."));
          else resolve(blob);
        }, mime, mime === "image/jpeg" ? 0.92 : undefined);
      });
    });
  }

  window.ComicStudioRender = {
    renderPage: renderPage,
    renderBlob: renderBlob,
    ensureFonts: ensureFonts,
    fontString: fontString,
    imageKnob: imageKnob
  };
})();
