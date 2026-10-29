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
  var fileBank = document.getElementById("file-bank");
  var fileProject = document.getElementById("file-project");
  var statusEl = document.getElementById("status");
  var metaEl = document.getElementById("meta");
  var selProps = document.getElementById("sel-props");

  var tool = "select";
  var selection = null;
  var drag = null;
  var cutPoints = [];
  var cutCursor = null;
  var hoverCut = null;
  var selectedSeg = null;
  var hoverSeg = null;
  var dropId = null;
  var preview = null;
  var editingId = null;
  var editorCancel = false;
  var propsKey = "";
  var imageTarget = null;
  var wheelTimer = 0;
  var rotAccum = 0;
  var viewMode = "fit";
  var viewScale = 1;
  var viewStageW = -1;
  var viewStageH = -1;
  var spaceDown = false;
  var viewPan = null;
  var cache = new Map();
  var PASTE_NUDGE = 16;
  var CLIP_PREFIX = "comic-studio-element:";
  var CLIP_TYPE = "web application/x-comic-studio-element";
  // Page-independent so a later multi-page document can paste the same payload.
  // Kept off the document so New, layouts, and project load leave it in place.
  var elementClipboard = null;

  var HINTS = {
    select: "Select: drag a picture to pan it, scroll to zoom it. Ctrl+scroll zooms the view. ? opens shortcuts.",
    cut: "Cut: click to add points. Double-click or Enter finishes. Esc cancels. Shift snaps the next segment straight.",
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

  function cutVertexList() {
    var seen = new Set();
    var list = [];
    session.doc.panels.forEach(function (panel) {
      var n = panel.points.length;
      panel.points.forEach(function (p, i) {
        var prev = panel.edgeCuts[(i - 1 + n) % n];
        var next = panel.edgeCuts[i];
        if (!prev && !next) return;
        var key = Math.round(p.x * 10) + "," + Math.round(p.y * 10);
        if (seen.has(key)) return;
        seen.add(key);
        list.push({ x: p.x, y: p.y });
      });
    });
    return list;
  }

  function activeCutId() {
    if (selectedSeg && selectedSeg.cutId) return selectedSeg.cutId;
    return hoverCut;
  }

  function cutEditHandles() {
    var id = activeCutId();
    if (!id || tool !== "select") return [];
    var seen = {};
    var list = [];
    function add(p, kind, a, b) {
      var key = kind + Math.round(p.x) + "," + Math.round(p.y);
      if (seen[key]) return;
      seen[key] = true;
      list.push({ x: p.x, y: p.y, kind: kind, a: a, b: b });
    }
    session.doc.panels.forEach(function (panel) {
      var n = panel.points.length;
      for (var i = 0; i < n; i++) {
        if (panel.edgeCuts[i] !== id) continue;
        var a = panel.points[i];
        var b = panel.points[(i + 1) % n];
        add(a, "point");
        add(b, "point");
        add({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, "mid", { x: a.x, y: a.y }, { x: b.x, y: b.y });
      }
    });
    if (selectedSeg) {
      var mx = (selectedSeg.a.x + selectedSeg.b.x) / 2;
      var my = (selectedSeg.a.y + selectedSeg.b.y) / 2;
      var nx = selectedSeg.b.y - selectedSeg.a.y;
      var ny = selectedSeg.a.x - selectedSeg.b.x;
      var len = Math.hypot(nx, ny) || 1;
      add({ x: mx + nx / len * 22 * pageUnit(), y: my + ny / len * 22 * pageUnit() }, "x");
    }
    return list;
  }

  function hitCutHandle(pt) {
    var reach = 18 * pageUnit();
    var best = null;
    var bestD = reach;
    cutEditHandles().forEach(function (p) {
      var d = Math.hypot(pt.x - p.x, pt.y - p.y);
      if (d < bestD) { bestD = d; best = p; }
    });
    return best;
  }

  function finishCut() {
    if (cutPoints.length < 2) {
      cutPoints = [];
      cutCursor = null;
      setStatus("A cut needs two points. Click to start again.");
      render();
      return;
    }
    var ok = session.cutPolyline(cutPoints);
    cutPoints = [];
    cutCursor = null;
    setStatus(ok ? "Cut added. Switch to Select and click the gutter to merge it back." : "That line didn't split a panel. Try crossing from one edge to another.");
    syncPageFields();
    render();
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
    cutPoints = [];
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

  function fitScale() {
    var availW = Math.max(40, stage.clientWidth - 48);
    var availH = Math.max(40, stage.clientHeight - 48);
    var page = session.doc.page;
    return Math.min(availW / page.width, availH / page.height);
  }

  function activeScale() {
    return viewMode === "fit" ? fitScale() : viewScale;
  }

  function syncViewControls() {
    var sel = $("view-zoom");
    if (!sel) return;
    var custom = sel.querySelector("[data-custom]");
    if (viewMode === "fit") {
      if (custom) custom.remove();
      if (sel.value !== "fit") sel.value = "fit";
      return;
    }
    var match = null;
    [0.5, 1, 2, 4].forEach(function (value) {
      if (Math.abs(viewScale - value) < 0.001) match = String(value);
    });
    if (match) {
      if (custom) custom.remove();
      if (sel.value !== match) sel.value = match;
      return;
    }
    var label = Math.round(viewScale * 100) + "%";
    if (!custom) {
      custom = document.createElement("option");
      custom.dataset.custom = "1";
      custom.value = "custom";
      sel.appendChild(custom);
    }
    custom.textContent = label;
    if (sel.value !== "custom") sel.value = "custom";
  }

  function fitCanvas() {
    var page = session.doc.page;
    var scale = activeScale();
    var cssW = Math.max(1, page.width * scale);
    var cssH = Math.max(1, page.height * scale);
    var slackW = Math.max(1, stage.clientWidth);
    var slackH = Math.max(1, stage.clientHeight);
    var viewEl = $("view");
    viewEl.style.width = (cssW + slackW) + "px";
    viewEl.style.height = (cssH + slackH) + "px";
    canvas.style.left = (slackW / 2) + "px";
    canvas.style.top = (slackH / 2) + "px";
    canvas.style.width = cssW + "px";
    canvas.style.height = cssH + "px";
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var bw = cssW * dpr;
    var bh = cssH * dpr;
    var maxPixels = 12 * 1024 * 1024;
    if (bw * bh > maxPixels) {
      var shrink = Math.sqrt(maxPixels / (bw * bh));
      bw *= shrink;
      bh *= shrink;
    }
    bw = Math.max(1, Math.round(bw));
    bh = Math.max(1, Math.round(bh));
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
    }
    syncViewControls();
  }

  function centerView() {
    var view = $("view");
    stage.scrollLeft = Math.max(0, (view.scrollWidth - stage.clientWidth) / 2);
    stage.scrollTop = Math.max(0, (view.scrollHeight - stage.clientHeight) / 2);
  }

  function pinView(point, clientX, clientY) {
    var page = session.doc.page;
    var stageRect = stage.getBoundingClientRect();
    var contentX = canvas.offsetLeft + (point.x / page.width) * canvas.offsetWidth;
    var contentY = canvas.offsetTop + (point.y / page.height) * canvas.offsetHeight;
    stage.scrollLeft = contentX - (clientX - stageRect.left);
    stage.scrollTop = contentY - (clientY - stageRect.top);
  }

  function setViewScale(next, anchor) {
    var point = anchor ? eventPoint(anchor) : null;
    var clientX = anchor ? anchor.clientX : 0;
    var clientY = anchor ? anchor.clientY : 0;
    viewMode = "scale";
    viewScale = clamp(next, 0.02, 8);
    fitCanvas();
    if (point) pinView(point, clientX, clientY);
    render();
    if (point) pinView(point, clientX, clientY);
  }

  function stageCenterAnchor() {
    var rect = stage.getBoundingClientRect();
    return { clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 };
  }

  function zoomViewBy(factor, anchor) {
    setViewScale(activeScale() * factor, anchor || stageCenterAnchor());
  }

  function setFit() {
    viewMode = "fit";
    fitCanvas();
    centerView();
    render();
  }

  function setActual() {
    setViewScale(1, stageCenterAnchor());
  }

  function render() {
    var sw = stage.clientWidth;
    var sh = stage.clientHeight;
    var stageChanged = viewStageW > 0 && (sw !== viewStageW || sh !== viewStageH);
    fitCanvas();
    if (viewMode === "fit" && (viewStageW < 0 || stageChanged)) centerView();
    else if (viewMode === "scale" && stageChanged) {
      stage.scrollLeft += (sw - viewStageW) / 2;
      stage.scrollTop += (sh - viewStageH) / 2;
    }
    viewStageW = sw;
    viewStageH = sh;
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
      cutPoints: cutPoints.length ? cutPoints.slice() : null,
      cutCursor: cutPoints.length ? cutCursor : null,
      cutHandles: cutEditHandles()
    });
    renderPages();
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
    metaEl.textContent = "Page " + (session.pageIndex() + 1) + " of " + session.pageCount()
      + " · " + Math.round(page.width) + "×" + Math.round(page.height)
      + " · " + session.doc.panels.length + " panels";
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
      appendStyles(selProps, false);
      return;
    }
    if (selection.type === "panel") buildPanelProps();
    else buildLetterProps();
  }

  function updateLiveValues() {
    if (selProps.contains(document.activeElement)) return;
    if (!selection) return;
    if (selection.type === "letter") {
      var letter = letterById(selection.id);
      var sizeInput = $("prop-letter-size");
      var rotInput = $("prop-letter-rot");
      if (letter && sizeInput) {
        sizeInput.value = String(Math.round(letter.fontSize));
        var sizeVal = $("prop-letter-size-val");
        if (sizeVal) sizeVal.textContent = Math.round(letter.fontSize) + " px";
      }
      if (letter && rotInput) rotInput.value = String(Math.round(letter.rotation || 0));
      return;
    }
    if (selection.type !== "panel") return;
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
      ? "Drag to pan the picture. Scroll, or Ctrl+scroll, zooms it toward the pointer. Alt+scroll rotates 1° (Shift snaps to 15°). Delete removes it."
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
        renderBank();
        render();
      }));
    }
    selProps.appendChild(actions);
    appendStyles(selProps, false);
  }

  function buildLetterProps() {
    var letter = letterById(selection.id);
    if (!letter) return;
    var names = { bubble: "Speech bubble", thought: "Thought bubble", caption: "Caption", sfx: "Sound effect" };
    var heading = document.createElement("p");
    heading.className = "hint";
    heading.textContent = names[letter.type] + ". Drag to move. Double-click to edit. Ctrl+scroll resizes. Alt+scroll rotates 1°. Delete removes it.";
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
    size.id = "prop-letter-size";
    size.min = "8";
    size.max = "400";
    size.value = String(Math.round(letter.fontSize));
    var sizeVal = document.createElement("span");
    sizeVal.id = "prop-letter-size-val";
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
    rot.id = "prop-letter-rot";
    rot.min = "-180";
    rot.max = "180";
    rot.value = String(Math.round(letter.rotation || 0));
    selProps.appendChild(field("Rotation", rot));
    bindGesture(rot, function () { session.updateLetter(letter.id, { rotation: Number(rot.value) }); });

    var warp = document.createElement("select");
    [["", "None"], ["arc", "Arc"], ["wave", "Wave"], ["bulge", "Bulge"]].forEach(function (pair) {
      var opt = document.createElement("option");
      opt.value = pair[0];
      opt.textContent = pair[1];
      warp.appendChild(opt);
    });
    warp.value = letter.warp === "arc" || letter.warp === "wave" || letter.warp === "bulge" ? letter.warp : "";
    selProps.appendChild(field("Warp", warp));
    warp.addEventListener("change", function () {
      session.begin();
      session.updateLetter(letter.id, { warp: warp.value || "none" });
      session.end();
      render();
    });
    var warpAmt = document.createElement("input");
    warpAmt.type = "range";
    warpAmt.min = "-100";
    warpAmt.max = "100";
    warpAmt.value = String(Math.round(letter.warpAmount || 0));
    selProps.appendChild(field("Warp strength", warpAmt));
    bindGesture(warpAmt, function () {
      session.updateLetter(letter.id, { warpAmount: Number(warpAmt.value) });
    });

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
    appendStyles(selProps, true);
  }

  function clampLetter(letter) {
    var cx = clamp(letter.x + letter.w / 2, 0, session.doc.page.width);
    var cy = clamp(letter.y + letter.h / 2, 0, session.doc.page.height);
    letter.x = cx - letter.w / 2;
    letter.y = cy - letter.h / 2;
  }

  function applyHandle(state, pt, shift, alt, ctrl) {
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
    if ((alt || ctrl) && state.handle !== "tail" && state.handle !== "rotate") {
      var dragX = pt.x - state.origin.x;
      var dragY = pt.y - state.origin.y;
      if (alt && !ctrl) {
        session.updateLetter(letter.id, {
          skewX: (state.start.skewX || 0) + dragY,
          skewY: (state.start.skewY || 0) + dragX
        });
      } else {
        session.updateLetter(letter.id, {
          perspective: Math.max(-1, Math.min(1, (state.start.perspective || 0) + dragY / Math.max(state.start.h, 1)))
        });
      }
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
    if (e.button !== 0 || spaceDown || viewPan) return;
    finishWheelGesture();
    if (editingId && e.target === canvas) editor.blur();
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* pointer already released */ }
    var pt = eventPoint(e);
    if (tool === "cut") {
      var last = cutPoints.length ? cutPoints[cutPoints.length - 1] : null;
      if (last && e.shiftKey) pt = G.snapAxis(last, pt);
      if (last && Math.hypot(pt.x - last.x, pt.y - last.y) < 8) {
        render();
        return;
      }
      cutPoints.push({ x: pt.x, y: pt.y });
      cutCursor = { x: pt.x, y: pt.y };
      setStatus("Point " + cutPoints.length + " added. Double-click or Enter finishes the cut. Esc cancels.");
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
    var vertex = !letter && !handle ? hitCutHandle(pt) : null;
    if (vertex && vertex.kind === "x") {
      if (session.deleteSegment(selectedSeg.a, selectedSeg.b)) {
        selectedSeg = null;
        setStatus("Removed that part of the cut. The panels beside it merged.");
      }
      render();
      return;
    }
    if (vertex && vertex.kind === "point") {
      drag = { kind: "cut-vertex", current: { x: vertex.x, y: vertex.y }, refs: null, cx: e.clientX, cy: e.clientY, started: false };
      canvas.style.cursor = "move";
      render();
      return;
    }
    if (vertex && vertex.kind === "mid") {
      drag = { kind: "cut-mid", a: vertex.a, b: vertex.b, cx: e.clientX, cy: e.clientY, started: false };
      canvas.style.cursor = "move";
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
      drag = { kind: "gutter", cutId: cut.cutId, a: cut.a, b: cut.b, cx: e.clientX, cy: e.clientY, started: false };
    } else {
      select(null);
      drag = { kind: "none", cx: e.clientX, cy: e.clientY, started: false };
    }
    render();
  }

  function onMove(e) {
    if (viewPan) return;
    var pt = eventPoint(e);
    if (spaceDown && !drag) {
      canvas.style.cursor = "grab";
      return;
    }
    if (tool === "cut" && cutPoints.length) {
      var lastPoint = cutPoints[cutPoints.length - 1];
      cutCursor = e.shiftKey ? G.snapAxis(lastPoint, pt) : pt;
      render();
      return;
    }
    if (!drag) {
      var prevHover = hoverCut;
      hoverCut = null;
      if (tool === "select") {
        var panel = hitPanel(pt);
        var cut = hitCut(pt);
        if (cut) {
          hoverCut = cut.cutId;
          if (!selectedSeg || selectedSeg.cutId !== cut.cutId) {
            hoverSeg = { cutId: cut.cutId, a: cut.a, b: cut.b };
          }
        } else hoverSeg = null;
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
    if (moved && !drag.started && (drag.kind === "letter" || drag.kind === "handle" || drag.kind === "image-rotate" || drag.kind === "cut-vertex" || drag.kind === "cut-mid" || (drag.kind === "panel" && drag.img))) {
      drag.started = true;
      session.begin();
      if (drag.kind === "cut-mid") {
        session.insertCutPoint(drag.a, drag.b, { x: (drag.a.x + drag.b.x) / 2, y: (drag.a.y + drag.b.y) / 2 });
        drag.current = { x: (drag.a.x + drag.b.x) / 2, y: (drag.a.y + drag.b.y) / 2 };
        drag.kind = "cut-vertex";
      }
      if (drag.kind === "cut-vertex" && !drag.refs) {
        drag.refs = [];
        session.doc.panels.forEach(function (panel, pi) {
          panel.points.forEach(function (p, i) {
            if (Math.hypot(p.x - drag.current.x, p.y - drag.current.y) <= 1.2) drag.refs.push({ pi: pi, i: i });
          });
        });
      }
    }
    if (!drag.started) return;
    if (drag.kind === "letter") {
      var letter = letterById(drag.id);
      letter.x = drag.start.x + (pt.x - drag.origin.x);
      letter.y = drag.start.y + (pt.y - drag.origin.y);
      clampLetter(letter);
    } else if (drag.kind === "handle") {
      applyHandle(drag, pt, e.shiftKey, e.altKey, e.ctrlKey || e.metaKey);
    } else if (drag.kind === "image-rotate") {
      var ang = Math.atan2(pt.y - drag.oy, pt.x - drag.ox);
      var deg = drag.rotation + (ang - drag.angle) * 180 / Math.PI;
      if (e.shiftKey) deg = Math.round(deg / 15) * 15;
      session.setImageRotation(drag.id, deg);
      canvas.style.cursor = "crosshair";
      updateLiveValues();
    } else if (drag.kind === "cut-vertex") {
      (drag.refs || []).forEach(function (ref) {
        var panel = session.doc.panels[ref.pi];
        if (!panel || !panel.points[ref.i]) return;
        panel.points[ref.i].x = pt.x;
        panel.points[ref.i].y = pt.y;
      });
      drag.current = { x: pt.x, y: pt.y };
      canvas.style.cursor = "move";
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
        setTool("select");
        setStatus("Lettering added. Double-click it to edit the words.");
      }
    } else if (drag.kind === "gutter" && !moved) {
      selectedSeg = { cutId: drag.cutId, a: drag.a, b: drag.b };
      selection = null;
      propsKey = "";
      setStatus("Cut selected. Drag a handle to bend it, or Delete to remove this segment.");
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

  function finishWheelGesture() {
    if (!wheelTimer) return;
    clearTimeout(wheelTimer);
    wheelTimer = 0;
    rotAccum = 0;
    session.end();
    syncPageFields();
    updateLiveValues();
  }

  function armWheelGesture() {
    if (!wheelTimer) session.begin();
    clearTimeout(wheelTimer);
    wheelTimer = setTimeout(finishWheelGesture, 320);
  }

  function wheelPixels(e) {
    var dy = e.deltaY;
    if (e.deltaMode === 1) dy *= 16;
    if (e.deltaMode === 2) dy *= Math.max(stage.clientHeight, 400);
    return dy;
  }

  function wheelNotches(e) {
    if (e.deltaMode === 1) return Math.round(e.deltaY);
    if (e.deltaMode === 2) return Math.sign(e.deltaY) * 3;
    var dy = e.deltaY;
    if (Math.abs(dy) >= 40) return Math.sign(dy) * Math.max(1, Math.round(Math.abs(dy) / 100));
    rotAccum += dy;
    if (Math.abs(rotAccum) < 40) return 0;
    var notches = Math.sign(rotAccum);
    rotAccum = 0;
    return notches;
  }

  function snappedTurn(current, notches) {
    var next = current;
    var sign = notches > 0 ? 1 : -1;
    var steps = Math.abs(notches);
    for (var i = 0; i < steps; i++) {
      next = sign > 0 ? Math.floor(next / 15) * 15 + 15 : Math.ceil(next / 15) * 15 - 15;
    }
    return next;
  }

  function selectedImageAt(pt) {
    if (!selection || selection.type !== "panel") return null;
    var panel = panelById(selection.id);
    if (!panel || !panel.image) return null;
    var hit = hitPanel(pt);
    if (!hit || hit.id !== panel.id) return null;
    return panel;
  }

  function selectedLetterAt(pt) {
    if (!selection || selection.type !== "letter") return null;
    var letter = hitLetter(pt);
    if (!letter || letter.id !== selection.id) return null;
    return letter;
  }

  function scaleLetter(letter, factor) {
    if (!letter || !isFinite(factor) || factor <= 0) return;
    var k = factor;
    if (k < 1) k = Math.max(k, 48 / letter.w, 36 / letter.h, 8 / Math.max(letter.fontSize, 1));
    else k = Math.min(k, 400 / Math.max(letter.fontSize, 1));
    if (Math.abs(k - 1) < 0.0001) return;
    var cx = letter.x + letter.w / 2;
    var cy = letter.y + letter.h / 2;
    letter.w *= k;
    letter.h *= k;
    letter.fontSize *= k;
    letter.strokeWidth = clamp(letter.strokeWidth * k, 0, 80);
    letter.shapeStrokeWidth = clamp(letter.shapeStrokeWidth * k, 0, 48);
    letter.x = cx - letter.w / 2;
    letter.y = cy - letter.h / 2;
    if (letter.tail) {
      letter.tail.dx *= k;
      letter.tail.dy *= k;
    }
  }

  function zoomImageByWheel(panel, pt, e) {
    armWheelGesture();
    var dy = wheelPixels(e);
    session.zoomImage(panel.id, panel.image.scale * Math.exp(-dy * 0.0004), pt);
    updateLiveValues();
    render();
  }

  function resizeLetterByWheel(letter, e) {
    armWheelGesture();
    scaleLetter(letter, Math.exp(-wheelPixels(e) * 0.0004));
    updateLiveValues();
    render();
  }

  function rotateByWheel(pt, e) {
    var notches = wheelNotches(e);
    if (!notches) return;
    var letter = selectedLetterAt(pt);
    if (!letter && selection && selection.type === "letter" && !hitPanel(pt)) letter = letterById(selection.id);
    if (letter) {
      armWheelGesture();
      var deg = e.shiftKey ? snappedTurn(letter.rotation || 0, notches) : (letter.rotation || 0) + notches;
      session.updateLetter(letter.id, { rotation: deg });
      updateLiveValues();
      render();
      return;
    }
    var hit = hitPanel(pt);
    var panel = hit && hit.image ? hit : null;
    if (!panel && selection && selection.type === "panel") panel = panelById(selection.id);
    if (!panel || !panel.image) return;
    if (!selection || selection.id !== panel.id) select({ type: "panel", id: panel.id });
    armWheelGesture();
    var next = e.shiftKey ? snappedTurn(panel.image.rotation || 0, notches) : (panel.image.rotation || 0) + notches;
    session.setImageRotation(panel.id, next);
    updateLiveValues();
    render();
  }

  function onWheel(e) {
    if (drag || viewPan) return;
    var ctrl = e.ctrlKey || e.metaKey;
    var alt = e.altKey;
    if (ctrl || alt) e.preventDefault();
    var pt = eventPoint(e);
    if (alt && !ctrl) {
      e.preventDefault();
      rotateByWheel(pt, e);
      return;
    }
    if (ctrl) {
      e.preventDefault();
      var image = selectedImageAt(pt);
      if (image) { zoomImageByWheel(image, pt, e); return; }
      var letter = selectedLetterAt(pt);
      if (letter) { resizeLetterByWheel(letter, e); return; }
      zoomViewBy(Math.exp(-wheelPixels(e) * 0.0004), e);
      return;
    }
    var plainImage = selectedImageAt(pt);
    if (plainImage && !spaceDown) {
      e.preventDefault();
      zoomImageByWheel(plainImage, pt, e);
    }
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
      info.name = file.name;
      session.setImage(panelId, info);
      select({ type: "panel", id: panelId });
      propsKey = "";
      setStatus("Image placed. A copy stays in the image bank.");
      syncPageFields();
      syncProps();
      renderBank();
      persistBank();
      render();
    }).catch(function (err) {
      setStatus(err.message || "Could not read that image.");
    });
  }

  function imageFiles(list) {
    var files = [];
    if (!list) return files;
    for (var i = 0; i < list.length; i++) {
      var file = list[i];
      var name = (file.name || "").toLowerCase();
      if (/^image\/(png|jpeg|webp)$/.test(file.type) || /\.(png|jpe?g|webp)$/.test(name)) files.push(file);
    }
    return files;
  }

  function readImageFiles(files) {
    return Promise.all(files.map(function (file) {
      return readImageFile(file).then(function (info) {
        info.name = file.name;
        return info;
      }).catch(function () { return null; });
    })).then(function (infos) { return infos.filter(Boolean); });
  }

  function finishBankAdd(infos, panelId, attempted) {
    if (!infos.length) {
      setStatus("Use PNG, JPG, or WebP images.");
      render();
      return;
    }
    var ids = session.addBankItems(infos);
    if (panelId && ids[0]) {
      session.placeBankImage(panelId, ids[0]);
      select({ type: "panel", id: panelId });
      propsKey = "";
    }
    renderBank();
    persistBank();
    syncPageFields();
    syncProps();
    render();
    var skipped = attempted > infos.length ? " Some files were skipped." : "";
    if (panelId) setStatus("Added " + ids.length + " to the bank and placed one in the panel." + skipped);
    else setStatus("Added " + ids.length + (ids.length === 1 ? " image" : " images") + " to the bank." + skipped);
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
    var data = session.toJSON();
    data.styles = styles.map(function (style) { return Object.assign({}, style); });
    downloadBlob(new Blob([JSON.stringify(data)], { type: "application/json" }), "comic-studio-project.json");
    session.markClean();
    setStatus("Project saved on this device. It contains every page, the image bank, and lettering styles.");
  }

  function crc32(bytes) {
    if (!crc32.table) {
      var table = new Uint32Array(256);
      for (var n = 0; n < 256; n++) {
        var c = n;
        for (var k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
        table[n] = c >>> 0;
      }
      crc32.table = table;
    }
    var crc = 0xffffffff;
    for (var i = 0; i < bytes.length; i++) crc = (crc32.table[(crc ^ bytes[i]) & 255] ^ (crc >>> 8)) >>> 0;
    return (crc ^ 0xffffffff) >>> 0;
  }

  function makeZip(files) {
    var parts = [];
    var central = [];
    var offset = 0;
    function u16(n) { return [n & 255, (n >>> 8) & 255]; }
    function u32(n) { return [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255]; }
    files.forEach(function (file) {
      var name = new TextEncoder().encode(file.name);
      var data = file.data;
      var crc = crc32(data);
      var local = u32(0x04034b50).concat(u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0));
      var localBytes = Uint8Array.from(local);
      parts.push(localBytes, name, data);
      var cen = u32(0x02014b50).concat(u16(20), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset));
      central.push(Uint8Array.from(cen), name);
      offset += localBytes.length + name.length + data.length;
    });
    var centralStart = offset;
    var centralSize = central.reduce(function (sum, part) { return sum + part.length; }, 0);
    var end = Uint8Array.from(u32(0x06054b50).concat(u16(0), u16(0), u16(files.length), u16(files.length), u32(centralSize), u32(centralStart), u16(0)));
    var chunks = parts.concat(central, [end]);
    var total = chunks.reduce(function (sum, part) { return sum + part.length; }, 0);
    var out = new Uint8Array(total);
    var pos = 0;
    chunks.forEach(function (part) { out.set(part, pos); pos += part.length; });
    return out;
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

  function exportAll(mime) {
    var ext = mime === "image/jpeg" ? "jpg" : "png";
    var count = session.pageCount();
    setStatus("Exporting " + count + (count === 1 ? " page…" : " pages…"));
    var files = [];
    var chain = Promise.resolve();
    for (var i = 0; i < count; i++) {
      (function (index) {
        chain = chain.then(function () {
          return R.renderBlob(session.pageAt(index), session.images, mime).then(function (blob) {
            return blob.arrayBuffer().then(function (buf) {
              files.push({ name: "comic-" + (index + 1) + "." + ext, data: new Uint8Array(buf) });
            });
          });
        });
      })(i);
    }
    chain.then(function () {
      downloadBlob(new Blob([makeZip(files)], { type: "application/zip" }), "comic-pages.zip");
      setStatus("Exported " + count + (count === 1 ? " page" : " pages") + " as comic-pages.zip.");
    }).catch(function () {
      setStatus("Export failed. Try a smaller page size.");
    });
  }

  var pageDragFrom = -1;
  var pageListSig = "";
  function showPage(index) {
    if (editingId) editor.blur();
    if (!session.goToPage(index)) return;
    selection = null;
    cutPoints = [];
    cutCursor = null;
    preview = null;
    propsKey = "";
    syncPageFields();
    syncProps();
    renderBank();
    render();
    setStatus("Page " + (session.pageIndex() + 1) + " of " + session.pageCount() + ".");
  }
  function afterPageEdit(message) {
    selection = null;
    cutPoints = [];
    cutCursor = null;
    preview = null;
    propsKey = "";
    setStatus(message);
    syncPageFields();
    syncProps();
    renderBank();
    render();
  }
  function renderPages() {
    var list = $("page-list");
    if (!list) return;
    var count = session.pageCount();
    var active = session.pageIndex();
    var ids = [];
    for (var n = 0; n < count; n++) ids.push((session.pageAt(n) && session.pageAt(n).id) || n);
    var sig = active + ":" + ids.join(",");
    if (sig === pageListSig && list.childElementCount === count) return;
    pageListSig = sig;
    list.textContent = "";
    for (var i = 0; i < count; i++) {
      var chip = document.createElement("button");
      chip.type = "button";
      chip.className = "page-chip";
      chip.draggable = true;
      chip.textContent = String(i + 1);
      if (i === active) chip.setAttribute("aria-current", "true");
      chip.title = "Page " + (i + 1) + ". Drag to reorder.";
      (function (index, button) {
        button.addEventListener("click", function () { showPage(index); });
        button.addEventListener("dragstart", function (e) {
          pageDragFrom = index;
          e.dataTransfer.setData("text/plain", String(index));
          e.dataTransfer.effectAllowed = "move";
        });
        button.addEventListener("dragover", function (e) { e.preventDefault(); });
        button.addEventListener("drop", function (e) {
          e.preventDefault();
          e.stopPropagation();
          var from = Number(e.dataTransfer.getData("text/plain"));
          if (!isFinite(from)) from = pageDragFrom;
          if (!session.movePage(from, index)) return;
          afterPageEdit("Reordered the pages.");
        });
      })(i, chip);
      list.appendChild(chip);
    }
    var del = $("page-del");
    if (del) del.disabled = count < 2;
  }

  function doUndo() {
    if (editingId) { editorCancel = true; closeEditor(false); editor.blur(); editorCancel = false; }
    drag = null;
    cutPoints = [];
    preview = null;
    if (!session.undo()) return;
    selectionAlive();
    propsKey = "";
    pruneCache();
    setStatus("Undid the last change.");
    syncPageFields();
    syncProps();
    renderBank();
    persistBank();
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
    renderBank();
    persistBank();
    render();
  }

  function isTypingTarget(target) {
    var el = target && target.nodeType === 1 ? target : target && target.parentElement;
    if (!el || !el.closest) return false;
    if (el.closest("input, textarea, select")) return true;
    if (el.isContentEditable) return true;
    var editable = el.closest("[contenteditable]");
    return !!(editable && editable.isContentEditable);
  }

  function refreshEdited(message) {
    propsKey = "";
    pruneCache();
    setStatus(message);
    syncPageFields();
    syncProps();
    renderBank();
    render();
  }

  function snapshotLetter(letter) {
    var clone = structuredClone(letter);
    delete clone.id;
    return clone;
  }

  function snapshotImage(panel) {
    var img = panel.image;
    var anchor = session.panelAnchor(panel.id) || { x: img.cx, y: img.cy };
    return {
      id: img.id,
      dataUrl: session.images.get(img.id) || "",
      width: img.width,
      height: img.height,
      scale: img.scale,
      rotation: img.rotation || 0,
      flipX: img.flipX === true,
      flipY: img.flipY === true,
      relX: img.cx - anchor.x,
      relY: img.cy - anchor.y
    };
  }

  function writeClipMarker(clip) {
    clip.markerWritten = false;
    function mark() {
      if (elementClipboard && elementClipboard.marker === clip.marker) elementClipboard.markerWritten = true;
    }
    function writeText() {
      if (!navigator.clipboard || !navigator.clipboard.writeText) return;
      navigator.clipboard.writeText(clip.marker).then(mark).catch(function () {});
    }
    try {
      if (navigator.clipboard && navigator.clipboard.write && typeof ClipboardItem !== "undefined") {
        var text = clip.kind === "letter" ? String(clip.letter && clip.letter.text || "") : "";
        var payload = {};
        payload["text/plain"] = new Blob([text], { type: "text/plain" });
        payload[CLIP_TYPE] = new Blob([clip.marker], { type: CLIP_TYPE });
        navigator.clipboard.write([new ClipboardItem(payload)]).then(mark).catch(writeText);
        return;
      }
    } catch (err) {}
    writeText();
  }

  function copySelection() {
    if (!selection) {
      setStatus("Select lettering or a picture to copy.");
      return false;
    }
    var copiedAt = Date.now();
    var clip = {
      version: 1,
      type: "comic-studio-element",
      kind: "",
      copiedAt: copiedAt,
      marker: CLIP_PREFIX + copiedAt,
      markerWritten: false,
      pasteCount: 0,
      sourcePanelId: null,
      letter: null,
      image: null
    };
    if (selection.type === "letter") {
      var letter = letterById(selection.id);
      if (!letter) { setStatus("Select lettering or a picture to copy."); return false; }
      clip.kind = "letter";
      clip.letter = snapshotLetter(letter);
    } else if (selection.type === "panel") {
      var panel = panelById(selection.id);
      if (!panel || !panel.image) { setStatus("Select lettering or a picture to copy."); return false; }
      clip.kind = "image";
      clip.sourcePanelId = panel.id;
      clip.image = snapshotImage(panel);
    } else {
      setStatus("Select lettering or a picture to copy.");
      return false;
    }
    elementClipboard = clip;
    writeClipMarker(clip);
    setStatus(clip.kind === "letter" ? "Copied lettering." : "Copied the picture.");
    return true;
  }

  function pasteElement() {
    var clip = elementClipboard;
    if (!clip) {
      setStatus("Copy lettering or a picture first.");
      return false;
    }
    var step = clip.pasteCount + 1;
    var nudge = PASTE_NUDGE * step;
    if (clip.kind === "letter") {
      var letter = session.pasteLetter(clip.letter, nudge, nudge);
      if (!letter) { setStatus("Could not paste lettering."); return false; }
      clip.pasteCount = step;
      select({ type: "letter", id: letter.id });
      refreshEdited("Pasted lettering.");
      return true;
    }
    var targetId = null;
    if (selection && selection.type === "panel" && panelById(selection.id)) targetId = selection.id;
    else if (clip.sourcePanelId && panelById(clip.sourcePanelId)) targetId = clip.sourcePanelId;
    else if (session.doc.panels.length === 1) targetId = session.doc.panels[0].id;
    if (!targetId) {
      setStatus("Select a panel to paste the picture.");
      return false;
    }
    if (!session.pastePanelImage(targetId, clip.image, nudge, nudge)) {
      setStatus("Could not paste the picture.");
      return false;
    }
    clip.pasteCount = step;
    select({ type: "panel", id: targetId });
    var same = targetId === clip.sourcePanelId;
    refreshEdited(same ? "Pasted the picture, nudged so you can see it." : "Pasted the picture into this panel.");
    return true;
  }

  function cutSelection() {
    if (!copySelection()) return;
    var clip = elementClipboard;
    if (clip.kind === "letter") {
      var id = selection && selection.type === "letter" ? selection.id : null;
      if (!id || !session.deleteLetter(id)) return;
      selection = null;
      refreshEdited("Cut lettering.");
      return;
    }
    if (!clip.sourcePanelId || !session.removeImage(clip.sourcePanelId)) return;
    refreshEdited("Cut the picture from the panel.");
  }

  function duplicateSelection() {
    if (!copySelection()) return;
    if (!pasteElement()) return;
    var clip = elementClipboard;
    setStatus(clip && clip.kind === "letter" ? "Duplicated lettering." : "Duplicated the picture.");
  }

  function clipboardFiles(data) {
    var files = [];
    if (!data) return files;
    var items = data.items;
    if (items) {
      for (var i = 0; i < items.length; i++) {
        if (items[i].kind !== "file") continue;
        var file = items[i].getAsFile();
        if (file) files.push(file);
      }
    }
    if (!files.length && data.files) {
      for (var j = 0; j < data.files.length; j++) files.push(data.files[j]);
    }
    return imageFiles(files);
  }

  function clipboardMarker(data) {
    if (!data || !data.getData) return "";
    var types = [];
    try { types = data.types ? Array.prototype.slice.call(data.types) : []; } catch (err) { types = []; }
    var names = [CLIP_TYPE, "application/x-comic-studio-element"];
    for (var i = 0; i < names.length; i++) {
      if (types.indexOf(names[i]) === -1) continue;
      var value = data.getData(names[i]) || "";
      if (value) return String(value).trim();
    }
    var text = "";
    try { text = data.getData("text/plain") || ""; } catch (err2) { text = ""; }
    text = String(text).trim();
    if (text.indexOf(CLIP_PREFIX) === 0) return text;
    return "";
  }

  function externalImageWins(files, marker) {
    if (!files.length) return false;
    var clip = elementClipboard;
    if (clip && marker && marker === clip.marker) return false;
    if (!clip) return true;
    if (clip.markerWritten) return true;
    var newest = 0;
    files.forEach(function (file) {
      if (file.lastModified > newest) newest = file.lastModified;
    });
    return newest > clip.copiedAt;
  }

  function pasteClipboardImages(files) {
    var panelId = selection && selection.type === "panel" ? selection.id : null;
    readImageFiles(files).then(function (infos) {
      infos.forEach(function (info, index) {
        if (!info.name) info.name = "Pasted image" + (infos.length > 1 ? " " + (index + 1) : "");
      });
      finishBankAdd(infos, panelId, files.length);
    });
  }

  function deleteSelection() {
    var seg = hoverSeg || selectedSeg;
    if (seg && session.deleteSegment(seg.a, seg.b)) {
      selectedSeg = null;
      hoverSeg = null;
      setStatus("Removed that part of the cut. The panels beside it merged.");
      propsKey = "";
      syncPageFields();
      syncProps();
      render();
      return;
    }
    if (!selection) return;
    if (selection.type === "letter") {
      session.deleteLetter(selection.id);
      selection = null;
      setStatus("Lettering deleted.");
    } else if (selection.type === "panel") {
      var panel = panelById(selection.id);
      if (!panel || !panel.image) return;
      session.removeImage(selection.id);
      setStatus("Image removed from the panel. It is still in the bank.");
    }
    propsKey = "";
    syncPageFields();
    syncProps();
    renderBank();
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
      if (layout.id === "blank") { requestBlank(); return; }
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
  $("export-all-png").addEventListener("click", function () { exportAll("image/png"); });
  $("export-all-jpg").addEventListener("click", function () { exportAll("image/jpeg"); });
  $("page-add").addEventListener("click", function () {
    if (editingId) editor.blur();
    if (!session.addPage()) return;
    afterPageEdit("Added page " + session.pageCount() + ". Undo removes it.");
  });
  $("page-dup").addEventListener("click", function () {
    if (editingId) editor.blur();
    if (!session.duplicatePage()) return;
    afterPageEdit("Duplicated this page.");
  });
  $("page-del").addEventListener("click", function () {
    if (editingId) editor.blur();
    var number = session.pageIndex() + 1;
    if (!session.deletePage()) return;
    afterPageEdit("Deleted page " + number + ". Undo brings it back.");
  });

  fileProject.addEventListener("change", function () {
    var file = fileProject.files && fileProject.files[0];
    fileProject.value = "";
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var project = JSON.parse(String(reader.result));
        session.loadJSON(project);
        mergeStyles(project.styles);
        selection = null;
        cutPoints = [];
        preview = null;
        propsKey = "";
        pruneCache();
        setStatus("Project loaded.");
        syncPageFields();
        syncProps();
        renderBank();
        persistBank();
        render();
      } catch (err) {
        setStatus(err.message || "Could not load that file.");
      }
    };
    reader.readAsText(file);
  });

  canvas.addEventListener("dblclick", function (e) {
    if (tool === "cut") {
      e.preventDefault();
      finishCut();
      return;
    }
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
  stage.addEventListener("wheel", onWheel, { passive: false });
  window.addEventListener("wheel", function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) e.preventDefault();
  }, { passive: false, capture: true });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Alt") e.preventDefault();
  }, true);
  document.addEventListener("keyup", function (e) {
    if (e.key === "Alt") e.preventDefault();
    if (e.code === "Space") {
      spaceDown = false;
      stage.classList.remove("space");
    }
  }, true);
  window.addEventListener("blur", function () {
    spaceDown = false;
    stage.classList.remove("space");
    viewPan = null;
    stage.classList.remove("panning");
  });

  function startViewPan(e) {
    if (viewPan) return;
    e.preventDefault();
    e.stopPropagation();
    finishWheelGesture();
    viewPan = {
      x: e.clientX,
      y: e.clientY,
      sl: stage.scrollLeft,
      st: stage.scrollTop,
      id: e.pointerId
    };
    stage.classList.add("panning");
    try { stage.setPointerCapture(e.pointerId); } catch (err) { /* already captured */ }
  }
  stage.addEventListener("pointerdown", function (e) {
    if (e.button === 1 || (e.button === 0 && spaceDown)) startViewPan(e);
  }, true);
  stage.addEventListener("pointermove", function (e) {
    if (!viewPan || e.pointerId !== viewPan.id) return;
    stage.scrollLeft = viewPan.sl - (e.clientX - viewPan.x);
    stage.scrollTop = viewPan.st - (e.clientY - viewPan.y);
  });
  function endViewPan(e) {
    if (!viewPan || (e && e.pointerId !== viewPan.id)) return;
    viewPan = null;
    stage.classList.remove("panning");
  }
  stage.addEventListener("pointerup", endViewPan);
  stage.addEventListener("pointercancel", endViewPan);
  stage.addEventListener("auxclick", function (e) {
    if (e.button === 1) e.preventDefault();
  });
  stage.addEventListener("mousedown", function (e) {
    if (e.button === 1) e.preventDefault();
  });
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
    e.stopPropagation();
    dropId = null;
    var bankId = "";
    if (e.dataTransfer) {
      bankId = e.dataTransfer.getData("application/x-comic-studio-bank");
      if (!bankId) {
        var plain = e.dataTransfer.getData("text/plain") || "";
        if (plain.indexOf("comic-studio-bank:") === 0) bankId = plain.slice("comic-studio-bank:".length);
      }
    }
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
    if (bankId && panel) {
      session.placeBankImage(panel.id, bankId);
      select({ type: "panel", id: panel.id });
      propsKey = "";
      setStatus("Placed from the image bank.");
      syncPageFields();
      syncProps();
      renderBank();
      render();
      return;
    }
    var files = imageFiles(e.dataTransfer && e.dataTransfer.files);
    if (!files.length) { setStatus("Drop a PNG, JPG, or WebP image."); render(); return; }
    var target = panel && panel.id;
    readImageFiles(files).then(function (infos) { finishBankAdd(infos, target, files.length); });
  });
  window.addEventListener("dragover", function (e) { e.preventDefault(); });
  window.addEventListener("drop", function (e) {
    e.preventDefault();
    var el = e.target && e.target.nodeType === 1 ? e.target : e.target && e.target.parentElement;
    if (!el || !el.closest) return;
    if (el.closest("#page") || el.closest("#bank")) return;
    var files = imageFiles(e.dataTransfer && e.dataTransfer.files);
    if (!files.length) return;
    readImageFiles(files).then(function (infos) { finishBankAdd(infos, null, files.length); });
  });

  function openShortcuts() {
    var root = $("shortcuts");
    root.hidden = false;
    $("shortcuts-close").focus();
  }
  function closeShortcuts() {
    var root = $("shortcuts");
    if (root.hidden) return;
    root.hidden = true;
  }
  $("shortcuts-open").addEventListener("click", openShortcuts);
  $("shortcuts-close").addEventListener("click", closeShortcuts);
  $("shortcuts").addEventListener("click", function (e) {
    if (e.target === $("shortcuts")) closeShortcuts();
  });

  $("view-out").addEventListener("click", function () { zoomViewBy(1 / 1.25); });
  $("view-in").addEventListener("click", function () { zoomViewBy(1.25); });
  $("view-zoom").addEventListener("change", function () {
    var value = $("view-zoom").value;
    if (value === "fit") setFit();
    else if (value !== "custom") setViewScale(Number(value), stageCenterAnchor());
  });
  $("view-controls").addEventListener("wheel", function (e) {
    e.preventDefault();
    e.stopPropagation();
    if (drag || viewPan) return;
    zoomViewBy(Math.exp(-wheelPixels(e) * 0.0004), e);
  }, { passive: false });

  var STYLE_KEY = "comic-studio-styles";
  var TIP_KEY = "comic-studio-tips";
  var TIP_INDEX_KEY = "comic-studio-tip-index";
  var TOUR_KEY = "comic-studio-tour";
  var TIPS = [
    "Save a page as a template: keep the layout, bubbles, and sound effects, then swap in new pictures.",
    "Ctrl+V pastes a copied image into the selected panel.",
    "Ctrl+C then Ctrl+V copies bubbles and sound effects with all their styling.",
    "Ctrl+D duplicates the selected item.",
    "Alt+scroll rotates. Shift+Alt snaps to 15°.",
    "Ctrl+scroll over a picture zooms it toward the pointer.",
    "Hold Shift while cutting to snap the cut straight.",
    "Click a gutter to merge the panels it separates.",
    "Ctrl+0 fits the page. Ctrl+1 is 100%.",
    "Drop pictures in the image bank, then drag them onto any panel.",
    "Press ? to open every shortcut.",
    "Save style keeps a favorite sound-effect look so you can use it again.",
    "Hover a gutter, then drag its handles to bend the cut. Delete removes only that segment.",
    "Arc, wave, or bulge lettering from the side panel. Alt-drag a corner to skew the words.",
    "Add a page from the strip under the canvas. Each page keeps its own panels and lettering.",
    "The image bank and saved styles are shared by every page. Copy and paste works across pages."
  ];
  var TOUR = [
    {
      title: "1 of 4 · Cuts and layouts",
      body: "Use Cut to split a panel. Layouts drop in a starter grid. Hold Shift to snap a cut straight.",
      targets: ["#tools"]
    },
    {
      title: "2 of 4 · Pictures",
      body: "Drop a picture on a panel, or add it to the image bank and drag the thumbnail over.",
      targets: ["#bank", "#stage"]
    },
    {
      title: "3 of 4 · Lettering",
      body: "Pick a speech bubble, thought, caption, or sound effect, then drag on the page. Double-click the words to edit them.",
      targets: [".tool[data-tool='bubble']", ".tool[data-tool='thought']", ".tool[data-tool='caption']", ".tool[data-tool='sfx']"]
    },
    {
      title: "4 of 4 · Save and shortcuts",
      body: "Save keeps this page on your device. Shortcuts lists every key. You can replay this tour from that panel.",
      targets: ["#save", "#shortcuts-open"]
    }
  ];
  var BUILTIN_STYLES = [
    {
      id: "style-impact", name: "Impact SFX", type: "sfx",
      font: "Anton", fontWeight: 400, fontStyle: "normal", fontSize: 120,
      fill: "#ffe14a", stroke: "#141414", strokeWidth: 16,
      shapeFill: "#ffffff", shapeStroke: "#161616", shapeStrokeWidth: 0,
      rotation: -6, tail: null
    },
    {
      id: "style-whisper", name: "Whisper", type: "thought",
      font: "Comic Neue", fontWeight: 400, fontStyle: "italic", fontSize: 28,
      fill: "#5c6570", stroke: "#ffffff", strokeWidth: 0,
      shapeFill: "#f4f7fb", shapeStroke: "#9aa3ad", shapeStrokeWidth: 3,
      rotation: 0, tail: { dx: -16, dy: 180 }
    },
    {
      id: "style-shout", name: "Shout", type: "bubble",
      font: "Bungee", fontWeight: 400, fontStyle: "normal", fontSize: 52,
      fill: "#fffdf8", stroke: "#ffffff", strokeWidth: 0,
      shapeFill: "#c42727", shapeStroke: "#5c1010", shapeStrokeWidth: 7,
      rotation: -4, tail: { dx: 70, dy: 190 }
    },
    {
      id: "style-narration", name: "Narration caption", type: "caption",
      font: "Kalam", fontWeight: 400, fontStyle: "normal", fontSize: 32,
      fill: "#2a241c", stroke: "#f3ead7", strokeWidth: 0,
      shapeFill: "#f3ead7", shapeStroke: "#2a241c", shapeStrokeWidth: 3,
      rotation: 0, tail: null
    }
  ];
  var styles = loadStyles();
  var tourStep = 0;

  function storageGet(key) {
    try { return localStorage.getItem(key); } catch (err) { return null; }
  }
  function storageSet(key, value) {
    try { localStorage.setItem(key, value); } catch (err) {}
  }
  function styleHex(value, fallback) {
    return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;
  }
  function normalizeStyle(raw) {
    if (!raw || typeof raw.name !== "string" || !raw.name.trim()) return null;
    if (!Doc.LETTER_PRESETS[raw.type]) return null;
    return {
      id: String(raw.id || ("style-" + Date.now().toString(36))),
      name: raw.name.trim().slice(0, 40),
      type: raw.type,
      font: typeof raw.font === "string" && raw.font ? raw.font : "Comic Neue",
      fontWeight: Number(raw.fontWeight) || 400,
      fontStyle: raw.fontStyle === "italic" ? "italic" : "normal",
      fontSize: Math.max(8, Math.min(400, Number(raw.fontSize) || 32)),
      fill: styleHex(raw.fill, "#1c1c1c"),
      stroke: styleHex(raw.stroke, "#ffffff"),
      strokeWidth: Math.max(0, Math.min(80, Number(raw.strokeWidth) || 0)),
      shapeFill: styleHex(raw.shapeFill, "#ffffff"),
      shapeStroke: styleHex(raw.shapeStroke, "#161616"),
      shapeStrokeWidth: Math.max(0, Math.min(48, Number(raw.shapeStrokeWidth) || 0)),
      rotation: Number(raw.rotation) || 0,
      warp: raw.warp === "arc" || raw.warp === "wave" || raw.warp === "bulge" ? raw.warp : "",
      warpAmount: Math.max(-100, Math.min(100, Number(raw.warpAmount) || 0)),
      skewX: Math.max(-400, Math.min(400, Number(raw.skewX) || 0)),
      skewY: Math.max(-400, Math.min(400, Number(raw.skewY) || 0)),
      perspective: Math.max(-1, Math.min(1, Number(raw.perspective) || 0)),
      tail: raw.tail && typeof raw.tail === "object" ? { dx: Number(raw.tail.dx) || 0, dy: Number(raw.tail.dy) || 0 } : null
    };
  }
  function loadStyles() {
    var raw = storageGet(STYLE_KEY);
    if (raw == null) return BUILTIN_STYLES.map(function (style) { return normalizeStyle(style); });
    try {
      var parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return BUILTIN_STYLES.map(function (style) { return normalizeStyle(style); });
      return parsed.map(normalizeStyle).filter(Boolean);
    } catch (err) {
      return BUILTIN_STYLES.map(function (style) { return normalizeStyle(style); });
    }
  }
  function persistStyles() {
    storageSet(STYLE_KEY, JSON.stringify(styles));
  }
  function mergeStyles(incoming) {
    if (!Array.isArray(incoming)) return;
    incoming.forEach(function (raw) {
      var style = normalizeStyle(raw);
      if (!style) return;
      var idx = -1;
      for (var i = 0; i < styles.length; i++) if (styles[i].id === style.id) idx = i;
      if (idx >= 0) styles[idx] = style;
      else styles.push(style);
    });
    persistStyles();
  }
  function styleFromLetter(letter, name) {
    return normalizeStyle({
      id: "style-" + Date.now().toString(36) + Math.floor(Math.random() * 1000).toString(36),
      name: name,
      type: letter.type,
      font: letter.font,
      fontWeight: letter.fontWeight,
      fontStyle: letter.fontStyle,
      fontSize: letter.fontSize,
      fill: letter.fill,
      stroke: letter.stroke,
      strokeWidth: letter.strokeWidth,
      shapeFill: letter.shapeFill,
      shapeStroke: letter.shapeStroke,
      shapeStrokeWidth: letter.shapeStrokeWidth,
      rotation: letter.rotation || 0,
      warp: letter.warp || "",
      warpAmount: letter.warpAmount || 0,
      skewX: letter.skewX || 0,
      skewY: letter.skewY || 0,
      perspective: letter.perspective || 0,
      tail: letter.tail ? { dx: letter.tail.dx, dy: letter.tail.dy } : null
    });
  }
  function appendStyles(host, canSave) {
    var box = document.createElement("details");
    box.className = "styles-block";
    box.open = canSave || !selection;
    var summary = document.createElement("summary");
    summary.textContent = "Styles";
    box.appendChild(summary);
    if (canSave) {
      var saveRow = document.createElement("div");
      saveRow.className = "style-save";
      var name = document.createElement("input");
      name.type = "text";
      name.maxLength = 40;
      name.value = "My style";
      name.setAttribute("aria-label", "Style name");
      saveRow.appendChild(name);
      saveRow.appendChild(button("Save style", "", function () {
        var letter = selection && letterById(selection.id);
        if (!letter) return;
        var label = name.value.trim() || "My style";
        var made = styleFromLetter(letter, label);
        if (!made) return;
        styles.push(made);
        persistStyles();
        setStatus("Saved style “" + label + "”.");
        propsKey = "";
        syncProps();
      }));
      box.appendChild(saveRow);
    }
    if (!styles.length) {
      var empty = document.createElement("p");
      empty.className = "hint";
      empty.textContent = "No saved styles yet.";
      box.appendChild(empty);
    }
    styles.forEach(function (style) {
      var row = document.createElement("div");
      row.className = "style-row";
      var apply = button(style.name, "style-apply", function () {
        if (selection && selection.type === "letter" && letterById(selection.id)) {
          session.applyLetterStyle(selection.id, style);
          propsKey = "";
          syncProps();
          render();
          setStatus("Applied “" + style.name + "”.");
          return;
        }
        var created = session.addStyledLetter(style);
        if (!created) return;
        select({ type: "letter", id: created.id });
        setTool("select");
        propsKey = "";
        syncProps();
        render();
        setStatus("Placed “" + style.name + "”.");
      });
      row.appendChild(apply);
      row.appendChild(button("Rename", "mini", function () {
        var input = document.createElement("input");
        input.type = "text";
        input.maxLength = 40;
        input.value = style.name;
        input.setAttribute("aria-label", "Rename style");
        apply.replaceWith(input);
        input.focus();
        input.select();
        var done = false;
        function commit(keep) {
          if (done) return;
          done = true;
          if (keep) {
            var next = input.value.trim();
            if (next) style.name = next.slice(0, 40);
            persistStyles();
          }
          propsKey = "";
          syncProps();
        }
        input.addEventListener("keydown", function (e) {
          if (e.key === "Enter") { e.preventDefault(); commit(true); }
          else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); commit(false); }
        });
        input.addEventListener("blur", function () { commit(true); });
      }));
      row.appendChild(button("Delete", "mini danger", function () {
        styles = styles.filter(function (item) { return item.id !== style.id; });
        persistStyles();
        propsKey = "";
        syncProps();
        setStatus("Deleted “" + style.name + "”.");
      }));
      box.appendChild(row);
    });
    host.appendChild(box);
  }
  function showTip() {
    var bar = $("tipbar");
    if (storageGet(TIP_KEY) === "0") { bar.hidden = true; return; }
    var index = Number(storageGet(TIP_INDEX_KEY)) || 0;
    if (index < 0 || index >= TIPS.length) index = 0;
    $("tip-text").textContent = TIPS[index];
    bar.hidden = false;
  }
  function clearTourMarks() {
    document.querySelectorAll(".tour-target").forEach(function (el) { el.classList.remove("tour-target"); });
  }
  function finishTour() {
    clearTourMarks();
    $("tour").hidden = true;
    storageSet(TOUR_KEY, "1");
  }
  function showTourStep() {
    clearTourMarks();
    var step = TOUR[tourStep];
    $("tour-title").textContent = step.title;
    $("tour-body").textContent = step.body;
    $("tour-next").textContent = tourStep === TOUR.length - 1 ? "Done" : "Next";
    step.targets.forEach(function (selector) {
      document.querySelectorAll(selector).forEach(function (el) { el.classList.add("tour-target"); });
    });
    $("tour").hidden = false;
  }
  function startTour() {
    tourStep = 0;
    closeShortcuts();
    showTourStep();
  }
  function maybeStartTour() {
    if (storageGet(TOUR_KEY) === "1") return;
    startTour();
  }
  showTip();
  persistStyles();
  $("tip-next").addEventListener("click", function () {
    var index = (Number(storageGet(TIP_INDEX_KEY)) || 0) + 1;
    if (index >= TIPS.length) index = 0;
    storageSet(TIP_INDEX_KEY, String(index));
    showTip();
  });
  $("tip-hide").addEventListener("click", function () {
    storageSet(TIP_KEY, "0");
    $("tipbar").hidden = true;
  });
  $("tour-skip").addEventListener("click", finishTour);
  $("tour-next").addEventListener("click", function () {
    if (tourStep >= TOUR.length - 1) finishTour();
    else { tourStep += 1; showTourStep(); }
  });
  $("tips-show").addEventListener("click", function () {
    storageSet(TIP_KEY, "1");
    showTip();
    closeShortcuts();
  });
  $("tour-replay").addEventListener("click", startTour);

  document.addEventListener("keydown", function (e) {
    if (!$("confirm").hidden) return;
    if (!$("tour").hidden && e.key === "Escape") {
      e.preventDefault();
      finishTour();
      return;
    }
    if (!$("shortcuts").hidden) {
      if (e.key === "Escape" || e.key === "?") {
        e.preventDefault();
        closeShortcuts();
      }
      return;
    }
    if (e.key === "Escape" && editingId) return;
    var typing = isTypingTarget(e.target);
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
    if ((e.ctrlKey || e.metaKey) && e.key === "0") {
      e.preventDefault();
      setFit();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "1") {
      e.preventDefault();
      setActual();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === "+" || e.key === "=" || e.key === "-" || e.key === "_")) {
      e.preventDefault();
      zoomViewBy(e.key === "-" || e.key === "_" ? 1 / 1.25 : 1.25);
      return;
    }
    if (e.code === "Space") {
      if (typing) return;
      e.preventDefault();
      spaceDown = true;
      stage.classList.add("space");
      return;
    }
    if (typing) return;
    if (e.key === "+" || e.key === "=" || e.key === "-") {
      e.preventDefault();
      zoomViewBy(e.key === "-" ? 1 / 1.25 : 1.25);
      return;
    }
    if (e.key === "?") {
      e.preventDefault();
      openShortcuts();
      return;
    }
    if (e.key === "Enter" && cutPoints.length) {
      e.preventDefault();
      finishCut();
      return;
    }
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      deleteSelection();
    } else if (e.key === "Escape") {
      if (cutPoints.length) { cutPoints = []; cutCursor = null; setStatus("Cut cancelled."); render(); }
      else setTool("select");
    } else if ((e.ctrlKey || e.metaKey) && !e.altKey && (key === "c" || key === "x" || key === "d")) {
      if (editingId) return;
      e.preventDefault();
      if (e.repeat) return;
      if (key === "c") copySelection();
      else if (key === "x") cutSelection();
      else duplicateSelection();
    } else if ((e.ctrlKey || e.metaKey) && key === "v") {
      if (editingId) return;
      return;
    } else if (key === "v") setTool("select");
    else if (key === "c") setTool("cut");
    else if (key === "b") setTool("bubble");
    else if (key === "t") setTool("thought");
    else if (key === "k") setTool("caption");
    else if (key === "s") setTool("sfx");
  });

  document.addEventListener("paste", function (e) {
    if (!$("confirm").hidden || !$("shortcuts").hidden) return;
    if (isTypingTarget(e.target) || editingId) return;
    var data = e.clipboardData;
    var files = clipboardFiles(data);
    var marker = clipboardMarker(data);
    if (externalImageWins(files, marker)) {
      e.preventDefault();
      pasteClipboardImages(files);
      return;
    }
    if (!elementClipboard) return;
    e.preventDefault();
    pasteElement();
  });

  var bankEpoch = 0;
  var confirmKey = null;

  function ask(opts) {
    return new Promise(function (resolve) {
      var root = $("confirm");
      $("confirm-title").textContent = opts.title;
      $("confirm-body").textContent = opts.body;
      var ok = $("confirm-ok");
      var alt = $("confirm-alt");
      var cancel = $("confirm-cancel");
      ok.textContent = opts.ok;
      cancel.textContent = opts.cancel || "Cancel";
      alt.hidden = !opts.alt;
      if (opts.alt) alt.textContent = opts.alt;
      function close(value) {
        root.hidden = true;
        document.removeEventListener("keydown", onKey, true);
        confirmKey = null;
        resolve(value);
      }
      function onKey(e) {
        if (e.key !== "Escape") return;
        e.preventDefault();
        e.stopPropagation();
        close("cancel");
      }
      ok.onclick = function () { close("ok"); };
      alt.onclick = function () { close("alt"); };
      cancel.onclick = function () { close("cancel"); };
      root.onclick = function (e) { if (e.target === root) close("cancel"); };
      confirmKey = onKey;
      document.addEventListener("keydown", onKey, true);
      root.hidden = false;
      cancel.focus();
    });
  }

  function openBankDb() {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open("comic-studio", 1);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains("bank")) db.createObjectStore("bank", { keyPath: "id" });
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function readStoredBank() {
    return openBankDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction("bank", "readonly");
        var req = tx.objectStore("bank").getAll();
        req.onsuccess = function () { resolve(req.result || []); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function writeStoredBank(records) {
    return openBankDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction("bank", "readwrite");
        var store = tx.objectStore("bank");
        store.clear();
        records.forEach(function (record) { store.put(record); });
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  function persistBank() {
    bankEpoch++;
    var epoch = bankEpoch;
    writeStoredBank(session.bankSnapshot()).catch(function () {
      if (epoch === bankEpoch) setStatus("The bank is on this page, but this browser could not keep it for next time.");
    });
  }

  function renderBank() {
    var tray = $("bank-tray");
    if (!tray) return;
    tray.textContent = "";
    var bank = session.doc.bank || [];
    $("bank-count").textContent = bank.length ? String(bank.length) : "Empty";
    var used = {};
    session.doc.panels.forEach(function (panel) {
      if (panel.image) used[panel.image.id] = true;
    });
    if (!bank.length) {
      var empty = document.createElement("p");
      empty.className = "bank-note";
      empty.textContent = "No images yet.";
      tray.appendChild(empty);
      return;
    }
    bank.forEach(function (item) {
      var card = document.createElement("article");
      card.className = "bank-card";
      card.draggable = true;
      card.title = item.name;
      card.dataset.bankId = item.id;
      var img = document.createElement("img");
      img.alt = "";
      img.draggable = false;
      img.src = session.images.get(item.id) || "";
      card.appendChild(img);
      if (used[item.id]) {
        var badge = document.createElement("span");
        badge.className = "bank-used";
        badge.textContent = "Used";
        card.appendChild(badge);
      }
      var remove = document.createElement("button");
      remove.type = "button";
      remove.className = "bank-x";
      remove.textContent = "×";
      remove.setAttribute("aria-label", "Remove " + item.name + " from the bank");
      remove.addEventListener("mousedown", function (e) { e.stopPropagation(); });
      remove.addEventListener("click", function (e) {
        e.stopPropagation();
        e.preventDefault();
        session.removeBankItem(item.id);
        renderBank();
        persistBank();
        render();
        setStatus("Removed from the bank. A picture still on the page stays until you remove it there.");
      });
      card.appendChild(remove);
      var name = document.createElement("span");
      name.className = "bank-name";
      name.textContent = item.name;
      card.appendChild(name);
      card.addEventListener("dragstart", function (e) {
        if (e.target === remove) { e.preventDefault(); return; }
        e.dataTransfer.setData("application/x-comic-studio-bank", item.id);
        e.dataTransfer.setData("text/plain", "comic-studio-bank:" + item.id);
        e.dataTransfer.effectAllowed = "copy";
      });
      tray.appendChild(card);
    });
  }

  function refreshAfterPageChange(message) {
    selection = null;
    cutPoints = [];
    cutCursor = null;
    preview = null;
    propsKey = "";
    pruneCache();
    setStatus(message);
    syncPageFields();
    syncProps();
    renderBank();
    render();
  }

  function finishNew(keepBank) {
    var size = Math.round(session.doc.page.width) + "×" + Math.round(session.doc.page.height);
    if (editingId) editor.blur();
    session.newPage({ keepBank: keepBank });
    session.markClean();
    persistBank();
    refreshAfterPageChange("New blank page at " + size + ". Undo brings the previous page back.");
  }

  function pageHasWork() {
    return session.projectHasWork();
  }

  function requestNew() {
    if (editingId) editor.blur();
    var dirty = session.isDirty();
    var hasBank = (session.doc.bank || []).length > 0;
    var work = pageHasWork();
    if (!dirty && !hasBank && !work) { finishNew(true); return; }
    var page = session.doc.page;
    var size = Math.round(page.width) + "×" + Math.round(page.height);
    var body = "Start a blank page at " + size + "?";
    if (dirty) body += " This page has unsaved changes.";
    if (work) body += " The current panels and lettering are replaced. Undo can bring them back.";
    if (hasBank) body += " Keep the image bank, or clear it too?";
    ask({
      title: "New page",
      body: body,
      ok: hasBank ? "Keep bank" : "New page",
      alt: hasBank ? "Clear bank" : null,
      cancel: "Cancel"
    }).then(function (choice) {
      if (choice === "cancel") return;
      finishNew(choice !== "alt");
    });
  }

  function applyBlank() {
    var changed = session.applyLayout("blank");
    refreshAfterPageChange(changed
      ? "Blank layout. One panel. Undo brings the previous panels back."
      : "Already one full panel.");
  }

  function requestBlank() {
    var hasImage = session.doc.panels.some(function (panel) { return panel.image; });
    if (!hasImage) { applyBlank(); return; }
    ask({
      title: "Blank layout",
      body: "This clears every cut and removes pictures from the panels. Copies in the image bank stay. You can undo.",
      ok: "Blank page",
      cancel: "Cancel"
    }).then(function (choice) {
      if (choice === "ok") applyBlank();
    });
  }

  $("new-page").addEventListener("click", requestNew);
  $("bank-add").addEventListener("click", function () {
    fileBank.value = "";
    fileBank.click();
  });
  fileBank.addEventListener("change", function () {
    var files = imageFiles(fileBank.files);
    fileBank.value = "";
    if (!files.length) { setStatus("Use PNG, JPG, or WebP images."); return; }
    readImageFiles(files).then(function (infos) { finishBankAdd(infos, null, files.length); });
  });
  $("bank-clear").addEventListener("click", function () {
    if (!(session.doc.bank || []).length) { setStatus("The image bank is already empty."); return; }
    ask({
      title: "Clear image bank",
      body: "Remove every thumbnail from the bank on this device? Pictures already placed on the page stay. You can undo.",
      ok: "Clear bank",
      cancel: "Cancel"
    }).then(function (choice) {
      if (choice !== "ok") return;
      session.clearBank();
      renderBank();
      persistBank();
      render();
      setStatus("Image bank cleared.");
    });
  });

  var bankOpen = localStorage.getItem("comic-studio-bank-open") !== "0";
  function setBankOpen(open) {
    bankOpen = open;
    $("bank").classList.toggle("collapsed", !open);
    $("bank-toggle").setAttribute("aria-expanded", open ? "true" : "false");
    localStorage.setItem("comic-studio-bank-open", open ? "1" : "0");
    render();
  }
  $("bank-toggle").addEventListener("click", function () { setBankOpen(!bankOpen); });
  setBankOpen(bankOpen);

  var bankTray = $("bank-tray");
  var bankRoot = $("bank");
  function bankDragHot(on) { bankTray.classList.toggle("hot", on); }
  bankRoot.addEventListener("dragover", function (e) {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    bankDragHot(true);
  });
  bankRoot.addEventListener("dragleave", function (e) {
    if (!bankRoot.contains(e.relatedTarget)) bankDragHot(false);
  });
  bankRoot.addEventListener("drop", function (e) {
    e.preventDefault();
    e.stopPropagation();
    bankDragHot(false);
    var files = imageFiles(e.dataTransfer && e.dataTransfer.files);
    if (!files.length) return;
    readImageFiles(files).then(function (infos) { finishBankAdd(infos, null, files.length); });
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
  maybeStartTour();
  setTool("select");
  syncPageFields();
  syncProps();
  renderBank();
  render();
  readStoredBank().then(function (items) {
    if (bankEpoch !== 0 || !items || !items.length) return;
    session.replaceBank(items);
    session.markClean();
    renderBank();
    render();
  }).catch(function () {});
})();
