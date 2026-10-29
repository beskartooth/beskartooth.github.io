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
    if (!points.length) return;
    ctx.moveTo(points[0].x, points[0].y);
    for (var i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
    ctx.closePath();
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

  function paintGlyph(ctx, letter, text, x, y, rot, scale) {
    ctx.save();
    ctx.translate(x, y);
    if (rot) ctx.rotate(rot);
    if (scale && scale !== 1) ctx.scale(scale, scale);
    if (letter.strokeWidth > 0) {
      ctx.lineWidth = letter.strokeWidth;
      ctx.strokeStyle = letter.stroke;
      ctx.strokeText(text, 0, 0);
    }
    ctx.fillStyle = letter.fill;
    ctx.fillText(text, 0, 0);
    ctx.restore();
  }

  function drawWarpedLine(ctx, letter, text, yBase) {
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
      paintGlyph(ctx, letter, text.charAt(c), gx, gy, rot, scale);
      cursor += widths[c];
    }
  }

  function drawText(ctx, letter, maxWidth) {
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
      if (warped || persp) drawWarpedLine(ctx, letter, lines[i], y);
      else {
        if (letter.strokeWidth > 0) {
          ctx.lineWidth = letter.strokeWidth;
          ctx.strokeStyle = letter.stroke;
          ctx.strokeText(lines[i], 0, y);
        }
        ctx.fillStyle = letter.fill;
        ctx.fillText(lines[i], 0, y);
      }
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

  function drawLetter(ctx, letter, hideText) {
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
        drawText(ctx, letter, maxW);
        ctx.restore();
      } else {
        drawText(ctx, letter, maxW);
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
    ctx.fillStyle = page.background;
    ctx.fillRect(0, 0, page.width, page.height);
    doc.panels.forEach(function (panel) {
      var shape = panelShape(panel, page);
      if (panel.image) {
        var img = getImage(panel.image.id);
        if (img && img.complete && img.naturalWidth) {
          ctx.save();
          trace(ctx, shape);
          ctx.clip();
          var w = img.naturalWidth * panel.image.scale;
          var h = img.naturalHeight * panel.image.scale;
          var placed = panel.image;
          ctx.translate(placed.cx, placed.cy);
          ctx.rotate((placed.rotation || 0) * Math.PI / 180);
          ctx.scale(placed.flipX ? -1 : 1, placed.flipY ? -1 : 1);
          ctx.drawImage(img, -w / 2, -h / 2, w, h);
          ctx.restore();
        }
      }
      if (opts.dropId === panel.id) {
        ctx.save();
        trace(ctx, shape);
        ctx.fillStyle = "rgba(226, 162, 58, 0.28)";
        ctx.fill();
        ctx.restore();
      }
    });
    if (page.border && page.border.enabled && page.border.width > 0) {
      doc.panels.forEach(function (panel) {
        var shape = panelShape(panel, page);
        ctx.save();
        trace(ctx, shape);
        ctx.clip();
        ctx.lineWidth = page.border.width * 2;
        ctx.strokeStyle = page.border.color;
        ctx.lineJoin = "miter";
        ctx.miterLimit = 2;
        ctx.stroke();
        ctx.restore();
      });
    }
    doc.letters.forEach(function (letter) {
      drawLetter(ctx, letter, opts.hideTextId === letter.id);
    });
    if (opts.previewLetter) {
      ctx.save();
      ctx.globalAlpha = 0.9;
      drawLetter(ctx, opts.previewLetter, false);
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
      var canvas = document.createElement("canvas");
      canvas.width = Math.round(doc.page.width);
      canvas.height = Math.round(doc.page.height);
      var ctx = canvas.getContext("2d", { alpha: false });
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      renderPage(ctx, doc, function (id) { return cache.get(id) || null; }, { ui: false, unit: 1 });
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
