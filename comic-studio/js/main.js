/* Comic Studio UI. Everything stays in the browser. */
(function () {
  "use strict";
  var G = window.ComicStudioGeometry;
  var Doc = window.ComicStudioDocument;
  var R = window.ComicStudioRender;
  var session = Doc.createSession();

  var canvas = document.getElementById("page");
  var stage = document.getElementById("stage");
  var editor = document.getElementById("editor");
  var fileImage = document.getElementById("file-image");
  var fileProject = document.getElementById("file-project");
  var statusEl = document.getElementById("status");
  var metaEl = document.getElementById("meta");
  var selProps = document.getElementById("sel-props");

  var tool = "select";
  var selection = null;
  var drag = null;
  var cutStart = null;
  var cutCursor = null;
  var hoverCut = null;
  var dropId = null;
  var preview = null;
  var editingId = null;
  var editorCancel = false;
  var propsKey = "";
  var imageTarget = null;
  var wheelTimer = 0;
  var cache = new Map();

  var HINTS = {
    select: "Select: drag an image to pan, scroll to zoom, drag the round handle to rotate. Click a gutter to merge panels. Double-click text to edit.",
    cut: "Cut: click the start, then the end. The line splits every panel it crosses. Hold Shift to snap horizontal or vertical.",
    bubble: "Drag to place a speech bubble. The orange handle moves the tail.",
    thought: "Drag to place a thought bubble. The orange handle moves the little circles.",
    caption: "Drag to place a caption box.",
    sfx: "Drag to place sound-effect lettering. Drag the top handle to rotate it."
  };

  function $(id) { return document.getElementById(id); }

  function setStatus(text) { statusEl.textContent = text; }

  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

  function pageUnit() {
    var rect = canvas.getBoundingClientRect();
    return rect.width > 0 ? session.doc.page.width / rect.width : 1;
  }

  function eventPoint(e) {
    var rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * session.doc.page.width,
      y: ((e.clientY - rect.top) / rect.height) * session.doc.page.height
    };
  }

  function clientFromPage(x, y) {
    var rect = canvas.getBoundingClientRect();
    return {
      x: rect.left + (x / session.doc.page.width) * rect.width,
      y: rect.top + (y / session.doc.page.height) * rect.height
    };
  }

  function getImage(id) {
    if (!session.images.has(id)) { cache.delete(id); return null; }
    if (cache.has(id)) return cache.get(id);
    var img = new Image();
    img.onload = render;
    img.src = session.images.get(id);
    cache.set(id, img);
    return img;
  }

  function pruneCache() {
    Array.from(cache.keys()).forEach(function (id) {
      if (!session.images.has(id)) cache.delete(id);
    });
  }

  function panelById(id) {
    return session.doc.panels.find(function (p) { return p.id === id; }) || null;
  }
  function letterById(id) {
    return session.doc.letters.find(function (l) { return l.id === id; }) || null;
  }

  function selectionAlive() {
    if (!selection) return;
    if (selection.type === "panel" && !panelById(selection.id)) selection = null;
    if (selection.type === "letter" && !letterById(selection.id)) selection = null;
  }

  function shapeOf(panel) {
    return G.insetPolygon(panel, session.doc.page) || panel.points;
  }

  function hitPanel(pt) {
    var best = null;
    var bestArea = Infinity;
    session.doc.panels.forEach(function (panel) {
      var shape = shapeOf(panel);
      if (!G.pointInPoly(pt, shape)) return;
      var area = Math.abs(G.signedArea(shape));
      if (area < bestArea) { best = panel; bestArea = area; }
    });
    return best;
  }

  function hitCut(pt) {
    var gutter = session.doc.page.gutter;
    var slop = Math.max(gutter / 2, pageUnit() * 8);
    return G.nearestCut(session.doc.panels, pt, slop);
  }

  function letterCenter(letter) {
    return { x: letter.x + letter.w / 2, y: letter.y + letter.h / 2 };
  }

  function toLocal(letter, pt) {
    var c = letterCenter(letter);
    var a = -(letter.rotation || 0) * Math.PI / 180;
    var dx = pt.x - c.x;
    var dy = pt.y - c.y;
    var cos = Math.cos(a);
    var sin = Math.sin(a);
    return { x: dx * cos - dy * sin, y: dx * sin + dy * cos };
  }

  function rotPoint(letter, lx, ly) {
    var c = letterCenter(letter);
    var a = (letter.rotation || 0) * Math.PI / 180;
    return {
      x: c.x + lx * Math.cos(a) - ly * Math.sin(a),
      y: c.y + lx * Math.sin(a) + ly * Math.cos(a)
    };
  }

  function hitLetter(pt) {
    var unit = pageUnit();
    for (var i = session.doc.letters.length - 1; i >= 0; i--) {
      var letter = session.doc.letters[i];
      var local = toLocal(letter, pt);
      if (Math.abs(local.x) <= letter.w / 2 + 6 * unit && Math.abs(local.y) <= letter.h / 2 + 6 * unit) return letter;
      if (letter.tail) {
        var tip = { x: letterCenter(letter).x + letter.tail.dx, y: letterCenter(letter).y + letter.tail.dy };
        if (Math.hypot(pt.x - tip.x, pt.y - tip.y) <= 14 * unit) return letter;
      }
      var knob = rotPoint(letter, 0, -letter.h / 2 - 22 * unit);
      if (Math.hypot(pt.x - knob.x, pt.y - knob.y) <= 14 * unit) return letter;
    }
    return null;
  }

  function hitImageRotate(id, pt) {
    var panel = panelById(id);
    if (!panel || !panel.image) return false;
    var unit = pageUnit();
    var knob = R.imageKnob(panel.image, unit, session.doc.page);
    return Math.hypot(pt.x - knob.x, pt.y - knob.y) <= 12 * unit;
  }

  function hitHandle(id, pt) {
    var letter = letterById(id);
    if (!letter) return null;
    var unit = pageUnit();
    var reach = 11 * unit;
    if (letter.tail) {
      var tip = { x: letterCenter(letter).x + letter.tail.dx, y: letterCenter(letter).y + letter.tail.dy };
      if (Math.hypot(pt.x - tip.x, pt.y - tip.y) <= reach) return "tail";
    }
    var knob = rotPoint(letter, 0, -letter.h / 2 - 22 * unit);
    if (Math.hypot(pt.x - knob.x, pt.y - knob.y) <= reach) return "rotate";
    var spots = [
      ["nw", -letter.w / 2, -letter.h / 2], ["n", 0, -letter.h / 2], ["ne", letter.w / 2, -letter.h / 2],
      ["e", letter.w / 2, 0], ["se", letter.w / 2, letter.h / 2], ["s", 0, letter.h / 2],
      ["sw", -letter.w / 2, letter.h / 2], ["w", -letter.w / 2, 0]
    ];
    for (var i = 0; i < spots.length; i++) {
      var p = rotPoint(letter, spots[i][1], spots[i][2]);
      if (Math.hypot(pt.x - p.x, pt.y - p.y) <= reach) return spots[i][0];
    }
    return null;
  }

  function resizeCursor(handle, rotation) {
    var base = { e: 0, se: 45, s: 90, sw: 135, w: 180, nw: 225, n: 270, ne: 315 }[handle];
    if (base == null) return "move";
    var names = ["ew-resize", "nwse-resize", "ns-resize", "nesw-resize"];
    return names[Math.round(((base + rotation + 360) % 180) / 45) % 4];
  }

  function setTool(next) {
    tool = next;
    cutStart = null;
    cutCursor = null;
    preview = null;
    document.querySelectorAll(".tool").forEach(function (btn) {
      btn.setAttribute("aria-pressed", btn.getAttribute("data-tool") === next ? "true" : "false");
    });
    setStatus(HINTS[next] || "");
    render();
  }

  function select(next) {
    var key = next ? next.type + ":" + next.id : "";
    var prev = selection ? selection.type + ":" + selection.id : "";
    selection = next;
    if (key !== prev) propsKey = "";
    syncProps();
  }

  function fitCanvas() {
    var rect = stage.getBoundingClientRect();
    var pad = 36;
    var availW = Math.max(40, rect.width - pad);
    var availH = Math.max(40, rect.height - pad);
    var page = session.doc.page;
    var cssW = availW;
    var cssH = cssW * page.height / page.width;
    if (cssH > availH) {
      cssH = availH;
      cssW = cssH * page.width / page.height;
    }
    canvas.style.width = cssW + "px";
    canvas.style.height = cssH + "px";
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var bw = Math.max(1, Math.round(cssW * dpr));
    var bh = Math.max(1, Math.round(cssH * dpr));
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
    }
  }

  function render() {
    fitCanvas();
    var ctx = canvas.getContext("2d");
    var page = session.doc.page;
    ctx.setTransform(canvas.width / page.width, 0, 0, canvas.height / page.height, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    R.renderPage(ctx, session.doc, getImage, {
      ui: true,
      unit: pageUnit(),
      selection: selection,
      hoverCut: hoverCut,
      dropId: dropId,
      previewLetter: preview,
      hideTextId: editingId,
      cutLine: cutStart && cutCursor ? { a: cutStart, b: cutCursor } : null
    });
  }

  function syncPageFields() {
    var page = session.doc.page;
    var preset = $("page-preset");
    var match = "custom";
    Object.keys(Doc.PAGE_PRESETS).forEach(function (id) {
      var p = Doc.PAGE_PRESETS[id];
      if (p.width === Math.round(page.width) && p.height === Math.round(page.height)) match = id;
    });
    if (document.activeElement !== preset) preset.value = match;
    if (document.activeElement !== $("page-w")) $("page-w").value = Math.round(page.width);
    if (document.activeElement !== $("page-h")) $("page-h").value = Math.round(page.height);
    if (document.activeElement !== $("page-bg")) $("page-bg").value = page.background;
    if (document.activeElement !== $("gutter")) $("gutter").value = String(Math.round(page.gutter));
    $("gutter-val").textContent = Math.round(page.gutter) + " px";
    $("border-on").checked = !!page.border.enabled;
    if (document.activeElement !== $("border-color")) $("border-color").value = page.border.color;
    if (document.activeElement !== $("border-width")) $("border-width").value = String(Math.round(page.border.width));
    $("border-val").textContent = Math.round(page.border.width) + " px";
    metaEl.textContent = Math.round(page.width) + "×" + Math.round(page.height) + " · " + session.doc.panels.length + " panels";
    $("undo").disabled = !session.canUndo();
    $("redo").disabled = !session.canRedo();
  }

  function field(label, node) {
    var wrap = document.createElement("label");
    wrap.appendChild(document.createTextNode(label));
    wrap.appendChild(node);
    return wrap;
  }

  function button(text, className, fn) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = text;
    if (className) btn.className = className;
    btn.addEventListener("click", fn);
    return btn;
  }

  function bindGesture(input, apply) {
    input.addEventListener("input", function () {
      session.begin();
      apply();
      render();
    });
    input.addEventListener("change", function () { session.end(); syncPageFields(); });
  }

  function syncProps() {
    selectionAlive();
    var key = selection ? selection.type + ":" + selection.id : "";
    if (key === propsKey && selProps.childElementCount) {
      updateLiveValues();
      return;
    }
    propsKey = key;
    selProps.textContent = "";
    if (!selection) {
      var p = document.createElement("p");
      p.className = "hint";
      p.textContent = "Nothing selected. Click a panel or a piece of lettering.";
      selProps.appendChild(p);
      return;
    }
    if (selection.type === "panel") buildPanelProps();
    else buildLetterProps();
  }

  function updateLiveValues() {
    if (selProps.contains(document.activeElement)) return;
    if (!selection || selection.type !== "panel") return;
    var panel = panelById(selection.id);
    var zoom = $("prop-zoom");
    if (panel && panel.image && zoom) {
      zoom.value = scaleToSlider(panel.image.scale);
      var val = $("prop-zoom-val");
      if (val) val.textContent = Math.round(panel.image.scale * 100) + "%";
    }
    if (panel && panel.image) {
      var shown = String(Math.round(panel.image.rotation || 0));
      var rot = $("prop-rot");
      var rotNum = $("prop-rot-num");
      var rotVal = $("prop-rot-val");
      if (rot) rot.value = shown;
      if (rotNum) rotNum.value = shown;
      if (rotVal) rotVal.textContent = shown + "°";
    }
  }

  var ZOOM_MIN = 0.02;
  var ZOOM_MAX = 10000;
  function scaleToSlider(scale) {
    var min = Math.log(ZOOM_MIN);
    var max = Math.log(ZOOM_MAX);
    var t = (Math.log(clamp(scale, ZOOM_MIN, ZOOM_MAX)) - min) / (max - min);
    return String(Math.round(t * 1000));
  }
  function sliderToScale(v) {
    var min = Math.log(ZOOM_MIN);
    var max = Math.log(ZOOM_MAX);
    return Math.exp(min + (Number(v) / 1000) * (max - min));
  }

  function buildPanelProps() {
    var panel = panelById(selection.id);
    if (!panel) return;
    var title = document.createElement("p");
    title.className = "hint";
    title.textContent = panel.image
      ? "Drag to pan. Scroll to zoom. Drag the handle above the picture to rotate. Hold Shift to snap. Delete removes the image."
      : "This panel is empty. Drop an image here or choose a file.";
    selProps.appendChild(title);
    if (panel.image) {
      var zoom = document.createElement("input");
      zoom.type = "range";
      zoom.id = "prop-zoom";
      zoom.min = "0";
      zoom.max = "1000";
      zoom.value = scaleToSlider(panel.image.scale);
      var val = document.createElement("span");
      val.id = "prop-zoom-val";
      val.textContent = Math.round(panel.image.scale * 100) + "%";
      var label = field("Zoom ", zoom);
      label.appendChild(val);
      selProps.appendChild(label);
      bindGesture(zoom, function () {
        var current = panelById(selection.id);
        if (!current || !current.image) return;
        session.zoomImage(current.id, sliderToScale(zoom.value), null);
        val.textContent = Math.round(current.image.scale * 100) + "%";
      });

      var rot = document.createElement("input");
      rot.type = "range";
      rot.id = "prop-rot";
      rot.min = "-180";
      rot.max = "180";
      rot.step = "1";
      rot.value = String(Math.round(panel.image.rotation || 0));
      var rotVal = document.createElement("span");
      rotVal.id = "prop-rot-val";
      rotVal.textContent = rot.value + "°";
      var rotLabel = field("Rotation ", rot);
      rotLabel.appendChild(rotVal);
      selProps.appendChild(rotLabel);

      var rotNum = document.createElement("input");
      rotNum.type = "number";
      rotNum.id = "prop-rot-num";
      rotNum.min = "-180";
      rotNum.max = "180";
      rotNum.step = "1";
      rotNum.value = rot.value;
      rotNum.setAttribute("aria-label", "Rotation degrees");
      var deg = document.createElement("span");
      deg.className = "deg";
      deg.appendChild(rotNum);
      deg.appendChild(document.createTextNode("°"));
      var degLabel = field("Degrees", deg);
      selProps.appendChild(degLabel);

      function showRotation(image) {
        var shown = String(Math.round(image.rotation || 0));
        rot.value = shown;
        rotNum.value = shown;
        rotVal.textContent = shown + "°";
      }
      function applyRotation(raw) {
        if (!/^-?\d+(\.\d+)?$/.test(String(raw).trim())) return;
        var current = panelById(selection.id);
        if (!current || !current.image) return;
        session.setImageRotation(current.id, Number(raw));
        showRotation(current.image);
      }
      bindGesture(rot, function () { applyRotation(rot.value); });
      bindGesture(rotNum, function () { applyRotation(rotNum.value); });
    }
    var actions = document.createElement("div");
    actions.className = "prop-actions";
    actions.appendChild(button(panel.image ? "Replace image" : "Choose image", "", function () {
      chooseImage(selection.id);
    }));
    if (panel.image) {
      actions.appendChild(button("Rotate left 90°", "", function () {
        session.turnImage(selection.id, -90);
        propsKey = "";
        syncProps();
        render();
      }));
      actions.appendChild(button("Rotate right 90°", "", function () {
        session.turnImage(selection.id, 90);
        propsKey = "";
        syncProps();
        render();
      }));
      actions.appendChild(button("Flip horizontal", "", function () {
        session.flipImage(selection.id, "x");
        propsKey = "";
        syncProps();
        render();
      }));
      actions.appendChild(button("Flip vertical", "", function () {
        session.flipImage(selection.id, "y");
        propsKey = "";
        syncProps();
        render();
      }));
      actions.appendChild(button("Reset rotation", "", function () {
        session.resetImageRotation(selection.id);
        propsKey = "";
        syncProps();
        render();
      }));
      actions.appendChild(button("Reset framing", "", function () {
        session.resetImage(selection.id);
        propsKey = "";
        syncProps();
        render();
      }));
      actions.appendChild(button("Remove image", "danger", function () {
        session.removeImage(selection.id);
        propsKey = "";
        syncProps();
        render();
      }));
    }
    selProps.appendChild(actions);
  }

  function buildLetterProps() {
    var letter = letterById(selection.id);
    if (!letter) return;
    var names = { bubble: "Speech bubble", thought: "Thought bubble", caption: "Caption", sfx: "Sound effect" };
    var heading = document.createElement("p");
    heading.className = "hint";
    heading.textContent = names[letter.type] + ". Drag to move. Double-click to edit. Delete removes it.";
    selProps.appendChild(heading);
    var text = document.createElement("textarea");
    text.value = letter.text;
    selProps.appendChild(field("Text", text));
    text.addEventListener("focus", function () { session.begin(); });
    text.addEventListener("input", function () {
      session.updateLetter(letter.id, { text: text.value });
      render();
    });
    text.addEventListener("blur", function () { session.end(); });

    var font = document.createElement("select");
    Doc.FONTS.forEach(function (item) {
      var opt = document.createElement("option");
      opt.value = item.id;
      opt.textContent = item.label;
      font.appendChild(opt);
    });
    font.value = letter.font + "|" + letter.fontWeight + "|" + letter.fontStyle;
    if (font.selectedIndex < 0) font.selectedIndex = 0;
    selProps.appendChild(field("Font", font));
    font.addEventListener("change", function () {
      var parts = font.value.split("|");
      session.begin();
      session.updateLetter(letter.id, { font: parts[0], fontWeight: Number(parts[1]), fontStyle: parts[2] });
      session.end();
      render();
    });

    var size = document.createElement("input");
    size.type = "range";
    size.min = "8";
    size.max = "280";
    size.value = String(Math.round(letter.fontSize));
    var sizeVal = document.createElement("span");
    sizeVal.textContent = Math.round(letter.fontSize) + " px";
    var sizeLabel = field("Size ", size);
    sizeLabel.appendChild(sizeVal);
    selProps.appendChild(sizeLabel);
    bindGesture(size, function () {
      session.updateLetter(letter.id, { fontSize: Number(size.value) });
      sizeVal.textContent = Math.round(letterById(letter.id).fontSize) + " px";
    });

    var fill = document.createElement("input");
    fill.type = "color";
    fill.value = letter.fill;
    selProps.appendChild(field("Text color", fill));
    bindGesture(fill, function () { session.updateLetter(letter.id, { fill: fill.value }); });

    var stroke = document.createElement("input");
    stroke.type = "color";
    stroke.value = /^#[0-9a-fA-F]{6}$/.test(letter.stroke) ? letter.stroke : "#141414";
    selProps.appendChild(field("Outline color", stroke));
    bindGesture(stroke, function () { session.updateLetter(letter.id, { stroke: stroke.value }); });

    var sw = document.createElement("input");
    sw.type = "range";
    sw.min = "0";
    sw.max = "48";
    sw.value = String(Math.round(letter.strokeWidth));
    selProps.appendChild(field("Outline width", sw));
    bindGesture(sw, function () { session.updateLetter(letter.id, { strokeWidth: Number(sw.value) }); });

    if (letter.type !== "sfx") {
      var shapeFill = document.createElement("input");
      shapeFill.type = "color";
      shapeFill.value = letter.shapeFill;
      selProps.appendChild(field("Fill", shapeFill));
      bindGesture(shapeFill, function () { session.updateLetter(letter.id, { shapeFill: shapeFill.value }); });
      var shapeStroke = document.createElement("input");
      shapeStroke.type = "color";
      shapeStroke.value = letter.shapeStroke;
      selProps.appendChild(field("Shape border", shapeStroke));
      bindGesture(shapeStroke, function () { session.updateLetter(letter.id, { shapeStroke: shapeStroke.value }); });
      var ssw = document.createElement("input");
      ssw.type = "range";
      ssw.min = "0";
      ssw.max = "28";
      ssw.value = String(Math.round(letter.shapeStrokeWidth));
      selProps.appendChild(field("Border width", ssw));
      bindGesture(ssw, function () { session.updateLetter(letter.id, { shapeStrokeWidth: Number(ssw.value) }); });
    }

    var rot = document.createElement("input");
    rot.type = "range";
    rot.min = "-180";
    rot.max = "180";
    rot.value = String(Math.round(letter.rotation || 0));
    selProps.appendChild(field("Rotation", rot));
    bindGesture(rot, function () { session.updateLetter(letter.id, { rotation: Number(rot.value) }); });

    var actions = document.createElement("div");
    actions.className = "prop-actions";
    actions.appendChild(button("Delete", "danger", function () {
      session.deleteLetter(letter.id);
      selection = null;
      propsKey = "";
      syncProps();
      render();
    }));
    selProps.appendChild(actions);
  }

  function clampLetter(letter) {
    var cx = clamp(letter.x + letter.w / 2, 0, session.doc.page.width);
    var cy = clamp(letter.y + letter.h / 2, 0, session.doc.page.height);
    letter.x = cx - letter.w / 2;
    letter.y = cy - letter.h / 2;
  }

  function applyHandle(state, pt, shift) {
    var letter = letterById(state.id);
    if (!letter) return;
    var c = letterCenter(state.start);
    if (state.handle === "tail" && letter.tail) {
      var dx = pt.x - c.x;
      var dy = pt.y - c.y;
      if (shift) {
        if (Math.abs(dx) >= Math.abs(dy)) dy = 0;
        else dx = 0;
      }
      session.updateLetter(letter.id, { tail: { dx: dx, dy: dy } });
      return;
    }
    if (state.handle === "rotate") {
      var ang = Math.atan2(pt.y - c.y, pt.x - c.x);
      var deg = state.start.rotation + (ang - state.angle) * 180 / Math.PI;
      if (shift) deg = Math.round(deg / 15) * 15;
      session.updateLetter(letter.id, { rotation: deg });
      return;
    }
    var rot = state.start.rotation * Math.PI / 180;
    var dx = pt.x - c.x;
    var dy = pt.y - c.y;
    var cos = Math.cos(-rot);
    var sin = Math.sin(-rot);
    var lx = dx * cos - dy * sin;
    var ly = dx * sin + dy * cos;
    var left = -state.start.w / 2;
    var right = state.start.w / 2;
    var top = -state.start.h / 2;
    var bottom = state.start.h / 2;
    if (state.handle.indexOf("e") >= 0) right = Math.max(left + 48, lx);
    if (state.handle.indexOf("w") >= 0) left = Math.min(right - 48, lx);
    if (state.handle.indexOf("s") >= 0) bottom = Math.max(top + 36, ly);
    if (state.handle.indexOf("n") >= 0) top = Math.min(bottom - 36, ly);
    var newW = right - left;
    var newH = bottom - top;
    var localCx = (left + right) / 2;
    var localCy = (top + bottom) / 2;
    var cosR = Math.cos(rot);
    var sinR = Math.sin(rot);
    var ox = localCx * cosR - localCy * sinR;
    var oy = localCx * sinR + localCy * cosR;
    session.updateLetter(letter.id, {
      x: c.x + ox - newW / 2,
      y: c.y + oy - newH / 2,
      w: newW,
      h: newH
    });
  }

  function defaultRect(type, x, y) {
    var preset = Doc.LETTER_PRESETS[type];
    return { x: x - preset.w / 2, y: y - preset.h / 2, w: preset.w, h: preset.h };
  }

  function normalizeRect(x0, y0, x1, y1, type) {
    var w = Math.abs(x1 - x0);
    var h = Math.abs(y1 - y0);
    if (w < 16 && h < 16) return defaultRect(type, x0, y0);
    return { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.max(48, w), h: Math.max(36, h) };
  }

  function buildPreview(state, pt) {
    var rect = normalizeRect(state.x, state.y, pt.x, pt.y, state.type);
    var preset = Doc.LETTER_PRESETS[state.type];
    var letter = structuredClone(preset);
    letter.x = rect.x;
    letter.y = rect.y;
    letter.w = rect.w;
    letter.h = rect.h;
    if (letter.tail) {
      letter.tail = {
        dx: preset.tail.dx * rect.w / preset.w,
        dy: preset.tail.dy * rect.h / preset.h
      };
    }
    return letter;
  }

  function onDown(e) {
    if (e.button !== 0) return;
    if (editingId && e.target === canvas) editor.blur();
    canvas.setPointerCapture(e.pointerId);
    var pt = eventPoint(e);
    if (tool === "cut") {
      if (e.shiftKey && cutStart) pt = G.snapAxis(cutStart, pt);
      if (!cutStart) {
        cutStart = pt;
        cutCursor = pt;
        setStatus(HINTS.cut);
      } else if (Math.hypot(pt.x - cutStart.x, pt.y - cutStart.y) < 8) {
        setStatus("That cut is too short.");
      } else {
        var ok = session.cut(cutStart, pt);
        cutStart = null;
        cutCursor = null;
        setStatus(ok ? "Cut added. Switch to Select and click the gutter to merge it back." : "That line didn't split a panel. Drag across the panel.");
        syncPageFields();
      }
      render();
      return;
    }
    if (tool !== "select") {
      drag = { kind: "place", type: tool, x: pt.x, y: pt.y, cx: e.clientX, cy: e.clientY };
      return;
    }
    var handle = selection && selection.type === "letter" ? hitHandle(selection.id, pt) : null;
    var letter = handle ? letterById(selection.id) : hitLetter(pt);
    var spinning = !letter && !handle && selection && selection.type === "panel" && hitImageRotate(selection.id, pt);
    if (spinning) {
      var spinPanel = panelById(selection.id);
      drag = {
        kind: "image-rotate",
        id: spinPanel.id,
        rotation: spinPanel.image.rotation || 0,
        ox: spinPanel.image.cx,
        oy: spinPanel.image.cy,
        angle: Math.atan2(pt.y - spinPanel.image.cy, pt.x - spinPanel.image.cx),
        cx: e.clientX,
        cy: e.clientY,
        started: false
      };
      render();
      return;
    }
    var panel = letter || handle ? null : hitPanel(pt);
    var cut = !panel && !letter ? hitCut(pt) : null;
    if (handle) {
      var current = letterById(selection.id);
      drag = {
        kind: "handle",
        handle: handle,
        id: current.id,
        start: structuredClone(current),
        origin: pt,
        angle: Math.atan2(pt.y - (current.y + current.h / 2), pt.x - (current.x + current.w / 2)),
        cx: e.clientX,
        cy: e.clientY,
        started: false
      };
    } else if (letter) {
      select({ type: "letter", id: letter.id });
      drag = { kind: "letter", id: letter.id, start: structuredClone(letter), origin: pt, cx: e.clientX, cy: e.clientY, started: false };
    } else if (panel) {
      select({ type: "panel", id: panel.id });
      drag = {
        kind: "panel",
        id: panel.id,
        origin: pt,
        img: panel.image ? { cx: panel.image.cx, cy: panel.image.cy } : null,
        cx: e.clientX,
        cy: e.clientY,
        started: false
      };
    } else if (cut) {
      drag = { kind: "gutter", cutId: cut.cutId, cx: e.clientX, cy: e.clientY, started: false };
    } else {
      select(null);
      drag = { kind: "none", cx: e.clientX, cy: e.clientY, started: false };
    }
    render();
  }

  function onMove(e) {
    var pt = eventPoint(e);
    if (tool === "cut" && cutStart) {
      cutCursor = e.shiftKey ? G.snapAxis(cutStart, pt) : pt;
      render();
      return;
    }
    if (!drag) {
      var prevHover = hoverCut;
      hoverCut = null;
      if (tool === "select") {
        var panel = hitPanel(pt);
        if (!panel) {
          var cut = hitCut(pt);
          hoverCut = cut ? cut.cutId : null;
        }
        var handle = selection && selection.type === "letter" ? hitHandle(selection.id, pt) : null;
        var spinning = selection && selection.type === "panel" && hitImageRotate(selection.id, pt);
        if (handle === "rotate" || handle === "tail" || spinning) canvas.style.cursor = "crosshair";
        else if (handle) canvas.style.cursor = resizeCursor(handle, (letterById(selection.id) || {}).rotation || 0);
        else if (hitLetter(pt)) canvas.style.cursor = "move";
        else if (hoverCut) canvas.style.cursor = "pointer";
        else if (panel && panel.image) canvas.style.cursor = "grab";
        else canvas.style.cursor = "default";
      } else canvas.style.cursor = "crosshair";
      if (prevHover !== hoverCut) render();
      return;
    }
    var moved = Math.hypot(e.clientX - drag.cx, e.clientY - drag.cy) > 4;
    if (drag.kind === "place") {
      preview = buildPreview(drag, pt);
      render();
      return;
    }
    if (moved && !drag.started && (drag.kind === "letter" || drag.kind === "handle" || drag.kind === "image-rotate" || (drag.kind === "panel" && drag.img))) {
      drag.started = true;
      session.begin();
    }
    if (!drag.started) return;
    if (drag.kind === "letter") {
      var letter = letterById(drag.id);
      letter.x = drag.start.x + (pt.x - drag.origin.x);
      letter.y = drag.start.y + (pt.y - drag.origin.y);
      clampLetter(letter);
    } else if (drag.kind === "handle") {
      applyHandle(drag, pt, e.shiftKey);
    } else if (drag.kind === "image-rotate") {
      var ang = Math.atan2(pt.y - drag.oy, pt.x - drag.ox);
      var deg = drag.rotation + (ang - drag.angle) * 180 / Math.PI;
      if (e.shiftKey) deg = Math.round(deg / 15) * 15;
      session.setImageRotation(drag.id, deg);
      canvas.style.cursor = "crosshair";
      updateLiveValues();
    } else if (drag.kind === "panel" && drag.img) {
      var panel = panelById(drag.id);
      if (panel && panel.image) {
        panel.image.cx = drag.img.cx + (pt.x - drag.origin.x);
        panel.image.cy = drag.img.cy + (pt.y - drag.origin.y);
      }
      canvas.style.cursor = "grabbing";
    }
    render();
  }

  function onUp(e) {
    if (!drag) return;
    var pt = eventPoint(e);
    var moved = Math.hypot(e.clientX - drag.cx, e.clientY - drag.cy) > 4;
    if (drag.kind === "place") {
      var rect = normalizeRect(drag.x, drag.y, pt.x, pt.y, drag.type);
      var created = session.addLetter(drag.type, rect);
      preview = null;
      if (created) {
        select({ type: "letter", id: created.id });
        setStatus("Lettering added. Double-click it to edit the words.");
      }
    } else if (drag.kind === "gutter" && !moved) {
      var removed = session.deleteCut(drag.cutId);
      selectionAlive();
      propsKey = "";
      setStatus(removed ? "Cut removed. Panels merged back." : "That gutter is already gone.");
    } else if (drag.kind === "panel" && !moved) {
      var panel = panelById(drag.id);
      if (panel && !panel.image) chooseImage(panel.id);
    }
    if (drag.started) session.end();
    drag = null;
    hoverCut = null;
    syncPageFields();
    syncProps();
    render();
  }

  function onWheel(e) {
    if (tool !== "select" || drag) return;
    var pt = eventPoint(e);
    var panel = hitPanel(pt);
    if (!panel || !panel.image) return;
    e.preventDefault();
    if (!selection || selection.id !== panel.id) select({ type: "panel", id: panel.id });
    if (!wheelTimer) session.begin();
    var dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    session.zoomImage(panel.id, panel.image.scale * Math.exp(-dy * 0.0012), pt);
    clearTimeout(wheelTimer);
    wheelTimer = setTimeout(function () {
      wheelTimer = 0;
      session.end();
      syncPageFields();
      updateLiveValues();
    }, 320);
    updateLiveValues();
    render();
  }

  function openEditor(letter) {
    if (!letter) return;
    session.end();
    session.begin();
    editingId = letter.id;
    editor.value = letter.text;
    editor.style.fontFamily = "\"" + letter.font + "\", sans-serif";
    editor.style.fontWeight = String(letter.fontWeight || 400);
    editor.style.fontStyle = letter.fontStyle === "italic" ? "italic" : "normal";
    var rect = canvas.getBoundingClientRect();
    var sx = rect.width / session.doc.page.width;
    var sy = rect.height / session.doc.page.height;
    var hw = letter.w / 2;
    var hh = letter.h / 2;
    var corners = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(function (c) { return rotPoint(letter, c[0], c[1]); });
    var minX = Math.min.apply(null, corners.map(function (c) { return c.x; }));
    var minY = Math.min.apply(null, corners.map(function (c) { return c.y; }));
    var maxX = Math.max.apply(null, corners.map(function (c) { return c.x; }));
    var maxY = Math.max.apply(null, corners.map(function (c) { return c.y; }));
    editor.style.left = (rect.left + minX * sx) + "px";
    editor.style.top = (rect.top + minY * sy) + "px";
    editor.style.width = Math.max(90, (maxX - minX) * sx) + "px";
    editor.style.height = Math.max(56, (maxY - minY) * sy) + "px";
    editor.style.fontSize = Math.max(14, letter.fontSize * sx) + "px";
    editor.classList.add("show");
    editor.focus();
    editor.select();
    render();
  }

  function closeEditor(commit) {
    if (!editingId) return;
    editingId = null;
    editor.classList.remove("show");
    if (commit) session.end();
    else session.cancelDraft();
    render();
  }

  editor.addEventListener("input", function () {
    if (!editingId) return;
    session.updateLetter(editingId, { text: editor.value });
    var area = selProps.querySelector("textarea");
    if (area && document.activeElement !== area) area.value = editor.value;
    render();
  });
  editor.addEventListener("blur", function () {
    if (editorCancel || !editingId) return;
    closeEditor(true);
  });
  editor.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      editorCancel = true;
      closeEditor(false);
      editor.blur();
      editorCancel = false;
    }
  });

  function chooseImage(panelId) {
    imageTarget = panelId;
    fileImage.value = "";
    fileImage.click();
  }

  function sniff(buf) {
    var u = new Uint8Array(buf);
    if (u.length > 8 && u[0] === 0x89 && u[1] === 0x50 && u[2] === 0x4e && u[3] === 0x47) return "image/png";
    if (u.length > 3 && u[0] === 0xff && u[1] === 0xd8) return "image/jpeg";
    if (u.length > 12 && u[0] === 0x52 && u[1] === 0x49 && u[2] === 0x46 && u[3] === 0x46 && u[8] === 0x57 && u[9] === 0x45 && u[10] === 0x42 && u[11] === 0x50) return "image/webp";
    return null;
  }

  function readImageFile(file) {
    return file.arrayBuffer().then(function (buf) {
      var type = sniff(buf);
      if (!type) throw new Error("Use a PNG, JPG, or WebP image.");
      return new Promise(function (resolve, reject) {
        var blob = new Blob([buf], { type: type });
        var reader = new FileReader();
        reader.onload = function () {
          var img = new Image();
          img.onload = function () {
            resolve({ dataUrl: reader.result, width: img.naturalWidth, height: img.naturalHeight });
          };
          img.onerror = function () { reject(new Error("Could not read that image.")); };
          img.src = reader.result;
        };
        reader.onerror = function () { reject(new Error("Could not read that image.")); };
        reader.readAsDataURL(blob);
      });
    });
  }

  function useImageFile(panelId, file) {
    readImageFile(file).then(function (info) {
      session.setImage(panelId, info);
      select({ type: "panel", id: panelId });
      propsKey = "";
      setStatus("Image added. Drag to pan, scroll to zoom.");
      syncPageFields();
      syncProps();
      render();
    }).catch(function (err) {
      setStatus(err.message || "Could not read that image.");
    });
  }

  fileImage.addEventListener("change", function () {
    var file = fileImage.files && fileImage.files[0];
    var target = imageTarget;
    fileImage.value = "";
    if (file && target) useImageFile(target, file);
  });

  function downloadBlob(blob, name) {
    var a = document.createElement("a");
    var url = URL.createObjectURL(blob);
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  function saveProject() {
    var json = JSON.stringify(session.toJSON());
    downloadBlob(new Blob([json], { type: "application/json" }), "comic-studio-project.json");
    setStatus("Project saved on this device. It contains your images.");
  }

  function exportPage(mime) {
    setStatus("Exporting…");
    var page = session.doc.page;
    R.renderBlob(session.doc, session.images, mime).then(function (blob) {
      var ext = mime === "image/jpeg" ? "jpg" : "png";
      downloadBlob(blob, "comic-" + Math.round(page.width) + "x" + Math.round(page.height) + "." + ext);
      setStatus("Exported " + Math.round(page.width) + "×" + Math.round(page.height) + " " + ext.toUpperCase() + ".");
    }).catch(function () {
      setStatus("Export failed. Try a smaller page size.");
    });
  }

  function doUndo() {
    if (editingId) { editorCancel = true; closeEditor(false); editor.blur(); editorCancel = false; }
    drag = null;
    cutStart = null;
    preview = null;
    if (!session.undo()) return;
    selectionAlive();
    propsKey = "";
    pruneCache();
    setStatus("Undid the last change.");
    syncPageFields();
    syncProps();
    render();
  }
  function doRedo() {
    if (!session.redo()) return;
    selectionAlive();
    propsKey = "";
    pruneCache();
    setStatus("Redid the change.");
    syncPageFields();
    syncProps();
    render();
  }

  function deleteSelection() {
    if (!selection) return;
    if (selection.type === "letter") {
      session.deleteLetter(selection.id);
      selection = null;
      setStatus("Lettering deleted.");
    } else if (selection.type === "panel") {
      var panel = panelById(selection.id);
      if (!panel || !panel.image) return;
      session.removeImage(selection.id);
      setStatus("Image removed.");
    }
    propsKey = "";
    syncPageFields();
    syncProps();
    render();
  }

  document.querySelectorAll(".tool").forEach(function (btn) {
    btn.addEventListener("click", function () { setTool(btn.getAttribute("data-tool")); });
  });

  var layouts = $("layouts");
  Doc.LAYOUTS.forEach(function (layout) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.layout = layout.id;
    btn.innerHTML = layout.name + "<small>" + layout.hint + "</small>";
    btn.addEventListener("click", function () {
      session.applyLayout(layout.id);
      if (selection && selection.type === "panel") selection = null;
      propsKey = "";
      setStatus(layout.name + " layout, " + session.doc.panels.length + " panels. You can still cut or merge.");
      syncPageFields();
      syncProps();
      render();
    });
    layouts.appendChild(btn);
  });

  var preset = $("page-preset");
  Object.keys(Doc.PAGE_PRESETS).forEach(function (id) {
    var opt = document.createElement("option");
    opt.value = id;
    opt.textContent = Doc.PAGE_PRESETS[id].label;
    preset.appendChild(opt);
  });
  var custom = document.createElement("option");
  custom.value = "custom";
  custom.textContent = "Custom pixels";
  preset.appendChild(custom);
  preset.addEventListener("change", function () {
    if (preset.value === "custom") return;
    var size = Doc.PAGE_PRESETS[preset.value];
    session.setPageSize(size.width, size.height);
    syncPageFields();
    render();
  });

  function commitSize() {
    session.setPageSize($("page-w").value, $("page-h").value);
    syncPageFields();
    render();
  }
  $("page-w").addEventListener("change", commitSize);
  $("page-h").addEventListener("change", commitSize);

  bindGesture($("page-bg"), function () { session.patchPage({ background: $("page-bg").value }); });
  bindGesture($("gutter"), function () {
    session.patchPage({ gutter: Number($("gutter").value) });
    $("gutter-val").textContent = Math.round(session.doc.page.gutter) + " px";
  });
  $("border-on").addEventListener("change", function () {
    session.begin();
    session.patchPage({ border: { enabled: $("border-on").checked } });
    session.end();
    render();
  });
  bindGesture($("border-color"), function () { session.patchPage({ border: { color: $("border-color").value } }); });
  bindGesture($("border-width"), function () {
    session.patchPage({ border: { width: Number($("border-width").value) } });
    $("border-val").textContent = Math.round(session.doc.page.border.width) + " px";
  });

  $("undo").addEventListener("click", doUndo);
  $("redo").addEventListener("click", doRedo);
  $("save").addEventListener("click", saveProject);
  $("load").addEventListener("click", function () { fileProject.value = ""; fileProject.click(); });
  $("export-png").addEventListener("click", function () { exportPage("image/png"); });
  $("export-jpg").addEventListener("click", function () { exportPage("image/jpeg"); });

  fileProject.addEventListener("change", function () {
    var file = fileProject.files && fileProject.files[0];
    fileProject.value = "";
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        session.loadJSON(String(reader.result));
        selection = null;
        cutStart = null;
        preview = null;
        propsKey = "";
        pruneCache();
        setStatus("Project loaded.");
        syncPageFields();
        syncProps();
        render();
      } catch (err) {
        setStatus(err.message || "Could not load that file.");
      }
    };
    reader.readAsText(file);
  });

  canvas.addEventListener("dblclick", function (e) {
    if (tool !== "select" || e.button !== 0) return;
    var letter = hitLetter(eventPoint(e));
    if (!letter) return;
    select({ type: "letter", id: letter.id });
    openEditor(letter);
  });
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);
  canvas.addEventListener("pointerleave", function () {
    if (drag) return;
    if (hoverCut) { hoverCut = null; render(); }
  });
  canvas.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("dragover", function (e) {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    var panel = hitPanel(eventPoint(e));
    var next = panel ? panel.id : null;
    if (next !== dropId) { dropId = next; render(); }
  });
  canvas.addEventListener("dragleave", function () {
    if (dropId) { dropId = null; render(); }
  });
  canvas.addEventListener("drop", function (e) {
    e.preventDefault();
    dropId = null;
    var files = e.dataTransfer && e.dataTransfer.files;
    if (!files || !files.length) return;
    var file = null;
    for (var i = 0; i < files.length; i++) {
      var name = (files[i].name || "").toLowerCase();
      if (/^image\/(png|jpeg|webp)$/.test(files[i].type) || /\.(png|jpe?g|webp)$/.test(name)) { file = files[i]; break; }
    }
    if (!file) { setStatus("Drop a PNG, JPG, or WebP image."); render(); return; }
    var panel = hitPanel(eventPoint(e));
    if (!panel) {
      var pt = eventPoint(e);
      var best = null;
      var bestD = Infinity;
      session.doc.panels.forEach(function (item) {
        var b = G.bounds(item.points);
        var d = Math.hypot(b.x + b.w / 2 - pt.x, b.y + b.h / 2 - pt.y);
        if (d < bestD) { bestD = d; best = item; }
      });
      panel = best;
    }
    if (panel) useImageFile(panel.id, file);
    render();
  });
  window.addEventListener("dragover", function (e) { e.preventDefault(); });
  window.addEventListener("drop", function (e) { e.preventDefault(); });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && editingId) return;
    var typing = e.target && (e.target.matches("input, textarea, select"));
    var key = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && key === "z") {
      if (typing) return;
      e.preventDefault();
      if (e.shiftKey) doRedo(); else doUndo();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && key === "y") {
      if (typing) return;
      e.preventDefault();
      doRedo();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && key === "s") {
      e.preventDefault();
      saveProject();
      return;
    }
    if (typing) return;
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      deleteSelection();
    } else if (e.key === "Escape") {
      if (cutStart) { cutStart = null; cutCursor = null; setStatus("Cut cancelled."); render(); }
      else setTool("select");
    } else if (key === "v") setTool("select");
    else if (key === "c") setTool("cut");
    else if (key === "b") setTool("bubble");
    else if (key === "t") setTool("thought");
    else if (key === "k") setTool("caption");
    else if (key === "s") setTool("sfx");
  });

  window.addEventListener("resize", render);
  if (window.ResizeObserver) new ResizeObserver(render).observe(stage);

  window.comicStudio = {
    session: session,
    exportBlob: function (mime) { return R.renderBlob(session.doc, session.images, mime); },
    pageToClient: clientFromPage,
    setTool: setTool
  };

  R.ensureFonts().then(render);
  setTool("select");
  syncPageFields();
  syncProps();
  render();
})();
