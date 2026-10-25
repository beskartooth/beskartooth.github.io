/* Document, layouts, history, and project files. Image bytes live in a side map. */
(function (root, factory) {
  var G = (typeof module === "object" && module.exports)
    ? require("./geometry.js")
    : root.ComicStudioGeometry;
  var api = factory(G);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ComicStudioDocument = api;
})(typeof self !== "undefined" ? self : this, function (G) {
  "use strict";

  var PAGE_PRESETS = {
    comic: { width: 1325, height: 2050, label: "Standard comic · 6.625×10.25" },
    webtoon: { width: 800, height: 3200, label: "Webtoon strip" },
    square: { width: 1800, height: 1800, label: "Square 1:1" },
    wide: { width: 1920, height: 1080, label: "16:9" },
    tall: { width: 1080, height: 1920, label: "9:16" }
  };

  var LAYOUTS = [
    { id: "blank", name: "Blank", hint: "One full panel" },
    { id: "six", name: "Six-panel", hint: "2 × 3 grid" },
    { id: "tiers", name: "Three tiers", hint: "Horizontal bands" },
    { id: "four", name: "Four-panel", hint: "2 × 2 grid" },
    { id: "splash", name: "Splash + 2", hint: "Large over two" },
    { id: "strip", name: "Vertical 6", hint: "Stacked strip" },
    { id: "slant", name: "Slanted", hint: "Angled action" }
  ];

  var FONTS = [
    { id: "Comic Neue|700|normal", family: "Comic Neue", weight: 700, style: "normal", label: "Comic Neue Bold" },
    { id: "Comic Neue|400|italic", family: "Comic Neue", weight: 400, style: "italic", label: "Comic Neue Italic" },
    { id: "Comic Neue|400|normal", family: "Comic Neue", weight: 400, style: "normal", label: "Comic Neue" },
    { id: "Bangers|400|normal", family: "Bangers", weight: 400, style: "normal", label: "Bangers" },
    { id: "Lilita One|400|normal", family: "Lilita One", weight: 400, style: "normal", label: "Lilita One" }
  ];

  var LETTER_PRESETS = {
    bubble: {
      type: "bubble", w: 340, h: 210,
      font: "Comic Neue", fontWeight: 700, fontStyle: "normal", fontSize: 42,
      fill: "#1c1c1c", stroke: "#ffffff", strokeWidth: 0,
      shapeFill: "#ffffff", shapeStroke: "#161616", shapeStrokeWidth: 6,
      text: "Hello!", rotation: 0, tail: { dx: 48, dy: 200 }
    },
    thought: {
      type: "thought", w: 340, h: 210,
      font: "Comic Neue", fontWeight: 400, fontStyle: "italic", fontSize: 40,
      fill: "#1c1c1c", stroke: "#ffffff", strokeWidth: 0,
      shapeFill: "#ffffff", shapeStroke: "#161616", shapeStrokeWidth: 5,
      text: "Hmm…", rotation: 0, tail: { dx: -20, dy: 210 }
    },
    caption: {
      type: "caption", w: 460, h: 120,
      font: "Comic Neue", fontWeight: 700, fontStyle: "normal", fontSize: 34,
      fill: "#1c1c1c", stroke: "#ffffff", strokeWidth: 0,
      shapeFill: "#fffdf6", shapeStroke: "#161616", shapeStrokeWidth: 5,
      text: "Caption", rotation: 0, tail: null
    },
    sfx: {
      type: "sfx", w: 480, h: 170,
      font: "Bangers", fontWeight: 400, fontStyle: "normal", fontSize: 120,
      fill: "#ffe14a", stroke: "#141414", strokeWidth: 18,
      shapeFill: "#ffffff", shapeStroke: "#161616", shapeStrokeWidth: 0,
      text: "BAM!", rotation: -8, tail: null
    }
  };

  function layoutCuts(id, w, h) {
    if (id === "six") {
      return [
        [[w / 2, 0], [w / 2, h]],
        [[0, h / 3], [w, h / 3]],
        [[0, (2 * h) / 3], [w, (2 * h) / 3]]
      ];
    }
    if (id === "tiers") {
      return [
        [[0, h / 3], [w, h / 3]],
        [[0, (2 * h) / 3], [w, (2 * h) / 3]]
      ];
    }
    if (id === "four") {
      return [
        [[w / 2, 0], [w / 2, h]],
        [[0, h / 2], [w, h / 2]]
      ];
    }
    if (id === "splash") {
      return [
        [[0, h * 0.68], [w, h * 0.68]],
        [[w / 2, h * 0.72], [w / 2, h]]
      ];
    }
    if (id === "strip") {
      var cuts = [];
      for (var i = 1; i <= 5; i++) cuts.push([[0, (h * i) / 6], [w, (h * i) / 6]]);
      return cuts;
    }
    if (id === "slant") {
      return [
        [[0, h * 0.38], [w, h * 0.62]],
        [[w * 0.72, 0], [w * 0.4, h * 0.3]],
        [[w * 0.22, h * 0.7], [w * 0.55, h]]
      ];
    }
    return [];
  }

  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

  function coverFit(panel, page, image) {
    var inset = G.insetPolygon(panel, page) || panel.points;
    var b = G.bounds(inset);
    var scale = Math.max(b.w / image.width, b.h / image.height);
    if (!isFinite(scale) || scale <= 0) scale = 1;
    return {
      id: image.id,
      cx: b.x + b.w / 2,
      cy: b.y + b.h / 2,
      scale: scale,
      rotation: 0,
      flipX: false,
      flipY: false,
      width: image.width,
      height: image.height
    };
  }

  function normDeg(deg) {
    var n = Number(deg);
    if (!isFinite(n)) return 0;
    return ((n + 180) % 360 + 360) % 360 - 180;
  }

  function scaleDoc(doc, nw, nh) {
    var sx = nw / doc.page.width;
    var sy = nh / doc.page.height;
    var s = Math.sqrt(sx * sy);
    doc.panels.forEach(function (p) {
      p.points.forEach(function (pt) { pt.x *= sx; pt.y *= sy; });
      if (p.image) {
        p.image.cx *= sx;
        p.image.cy *= sy;
        p.image.scale *= s;
      }
    });
    doc.letters.forEach(function (L) {
      L.x *= sx; L.y *= sy; L.w *= sx; L.h *= sy;
      L.fontSize *= s;
      L.strokeWidth *= s;
      L.shapeStrokeWidth *= s;
      if (L.tail) { L.tail.dx *= sx; L.tail.dy *= sy; }
    });
    doc.page.gutter *= s;
    doc.page.border.width *= s;
    doc.page.width = nw;
    doc.page.height = nh;
  }

  function isHex(c) { return typeof c === "string" && /^#[0-9a-fA-F]{6}$/.test(c); }

  function createSession() {
    var state = {
      doc: null,
      images: new Map(),
      undoStack: [],
      redoStack: [],
      draft: null,
      seq: 1
    };

    function uid(prefix) { return prefix + (state.seq++); }

    function noteId(id) {
      var m = /(\d+)$/.exec(String(id || ""));
      if (m) state.seq = Math.max(state.seq, Number(m[1]) + 1);
    }

    function blank() {
      var preset = PAGE_PRESETS.comic;
      state.doc = {
        page: {
          width: preset.width,
          height: preset.height,
          background: "#ffffff",
          gutter: 28,
          border: { enabled: true, color: "#111111", width: 4 }
        },
        panels: [{
          id: uid("p"),
          points: G.rectPanel(preset.width, preset.height).points,
          edgeCuts: [null, null, null, null],
          image: null
        }],
        letters: [],
        bank: []
      };
    }

    function fullPanel() {
      var page = state.doc.page;
      var rect = G.rectPanel(page.width, page.height);
      return {
        id: uid("p"),
        points: rect.points,
        edgeCuts: rect.edgeCuts.slice(),
        image: null
      };
    }

    function bankName(name) {
      var text = String(name || "Image").replace(/[\r\n]/g, " ").trim();
      return (text || "Image").slice(0, 120);
    }

    function storeBankItem(info) {
      var id = uid("i");
      state.images.set(id, info.dataUrl);
      var item = {
        id: id,
        name: bankName(info.name),
        width: Math.max(1, Number(info.width) || 1),
        height: Math.max(1, Number(info.height) || 1)
      };
      if (!state.doc.bank) state.doc.bank = [];
      state.doc.bank.push(item);
      return item;
    }

    function commitMutation(mutate) {
      end();
      var before = JSON.stringify(state.doc);
      var snap = structuredClone(state.doc);
      mutate();
      if (JSON.stringify(state.doc) === before) return false;
      pushSnapshot(snap);
      gc();
      return true;
    }

    function gc() {
      var used = new Set();
      var docs = [state.doc].concat(state.undoStack, state.redoStack);
      if (state.draft) docs.push(state.draft);
      docs.forEach(function (d) {
        d.panels.forEach(function (p) { if (p.image) used.add(p.image.id); });
        (d.bank || []).forEach(function (item) { if (item && item.id) used.add(item.id); });
      });
      Array.from(state.images.keys()).forEach(function (id) {
        if (!used.has(id)) state.images.delete(id);
      });
    }

    function pushSnapshot(snap) {
      state.undoStack.push(snap);
      if (state.undoStack.length > 40) state.undoStack.shift();
      state.redoStack = [];
    }

    function end() {
      if (!state.draft) return false;
      var changed = JSON.stringify(state.draft) !== JSON.stringify(state.doc);
      var draft = state.draft;
      state.draft = null;
      if (changed) {
        pushSnapshot(draft);
        gc();
      }
      return changed;
    }

    function begin() {
      if (!state.draft) state.draft = structuredClone(state.doc);
    }

    function cancelDraft() {
      if (!state.draft) return;
      state.doc = state.draft;
      state.draft = null;
      gc();
    }

    function checkpoint() {
      end();
      pushSnapshot(structuredClone(state.doc));
    }

    function panelById(id) {
      return state.doc.panels.find(function (p) { return p.id === id; }) || null;
    }

    function letterById(id) {
      return state.doc.letters.find(function (l) { return l.id === id; }) || null;
    }

    blank();
    state.clean = JSON.stringify(state.doc);

    return {
      get doc() { return state.doc; },
      get images() { return state.images; },
      begin: begin,
      end: end,
      cancelDraft: cancelDraft,
      canUndo: function () { return state.undoStack.length > 0 || !!state.draft; },
      canRedo: function () { return state.redoStack.length > 0; },
      undo: function () {
        if (state.draft) { cancelDraft(); return true; }
        if (!state.undoStack.length) return false;
        state.redoStack.push(structuredClone(state.doc));
        state.doc = state.undoStack.pop();
        gc();
        return true;
      },
      redo: function () {
        end();
        if (!state.redoStack.length) return false;
        state.undoStack.push(structuredClone(state.doc));
        state.doc = state.redoStack.pop();
        gc();
        return true;
      },
      isDirty: function () { return JSON.stringify(state.doc) !== state.clean; },
      markClean: function () { state.clean = JSON.stringify(state.doc); },
      bankSnapshot: function () {
        return (state.doc.bank || []).map(function (item) {
          var dataUrl = state.images.get(item.id) || "";
          return {
            id: item.id,
            name: item.name,
            width: item.width,
            height: item.height,
            dataUrl: dataUrl
          };
        }).filter(function (item) { return item.dataUrl.indexOf("data:image/") === 0; });
      },
      replaceBank: function (items) {
        var bank = [];
        (items || []).forEach(function (item) {
          if (!item || typeof item.dataUrl !== "string" || item.dataUrl.indexOf("data:image/") !== 0) return;
          var id = String(item.id || uid("i"));
          noteId(id);
          state.images.set(id, item.dataUrl);
          bank.push({
            id: id,
            name: bankName(item.name),
            width: Math.max(1, Number(item.width) || 1),
            height: Math.max(1, Number(item.height) || 1)
          });
        });
        state.doc.bank = bank;
        gc();
      },
      newPage: function (opts) {
        var keep = !opts || opts.keepBank !== false;
        return commitMutation(function () {
          var bank = keep ? (state.doc.bank || []).slice() : [];
          state.doc.panels = [fullPanel()];
          state.doc.letters = [];
          state.doc.bank = bank;
        });
      },
      patchPage: function (partial) {
        if (partial.background && isHex(partial.background)) state.doc.page.background = partial.background;
        if (partial.gutter != null && isFinite(partial.gutter)) {
          state.doc.page.gutter = clamp(Number(partial.gutter), 0, 160);
        }
        if (partial.border) {
          var b = state.doc.page.border;
          if (partial.border.enabled != null) b.enabled = !!partial.border.enabled;
          if (partial.border.color && isHex(partial.border.color)) b.color = partial.border.color;
          if (partial.border.width != null && isFinite(partial.border.width)) {
            b.width = clamp(Number(partial.border.width), 0, 48);
          }
        }
      },
      setPageSize: function (w, h) {
        w = clamp(Math.round(Number(w)), 64, 8192);
        h = clamp(Math.round(Number(h)), 64, 8192);
        if (w === state.doc.page.width && h === state.doc.page.height) return false;
        checkpoint();
        scaleDoc(state.doc, w, h);
        return true;
      },
      applyLayout: function (id) {
        if (id === "blank") {
          return commitMutation(function () {
            state.doc.panels = [fullPanel()];
          });
        }
        var cuts = layoutCuts(id, state.doc.page.width, state.doc.page.height);
        if (!cuts.length) return false;
        checkpoint();
        var page = state.doc.page;
        var base = G.rectPanel(page.width, page.height);
        var panels = [{ id: uid("p"), points: base.points, edgeCuts: base.edgeCuts.slice(), image: null }];
        cuts.forEach(function (seg) {
          var cutId = uid("c");
          var res = G.applyCut(panels, { x: seg[0][0], y: seg[0][1] }, { x: seg[1][0], y: seg[1][1] }, cutId);
          panels = res.panels.map(function (p) {
            return {
              id: uid("p"),
              points: p.points,
              edgeCuts: p.edgeCuts.slice(),
              image: null
            };
          });
        });
        state.doc.panels = panels;
        gc();
        return true;
      },
      cut: function (a, b) {
        if (Math.hypot(b.x - a.x, b.y - a.y) < 8) return false;
        var cutId = uid("c");
        var res = G.applyCut(state.doc.panels, a, b, cutId);
        if (!res.count) return false;
        var seen = new Set();
        var panels = res.panels.map(function (p) {
          var copy = {
            id: p.id,
            points: p.points.map(function (pt) { return { x: pt.x, y: pt.y }; }),
            edgeCuts: p.edgeCuts.slice(),
            image: p.image ? Object.assign({}, p.image) : null
          };
          if (!copy.id || seen.has(copy.id)) copy.id = uid("p");
          seen.add(copy.id);
          return copy;
        });
        checkpoint();
        state.doc.panels = panels;
        return true;
      },
      deleteCut: function (cutId) {
        var next = G.deleteCut(state.doc.panels, cutId);
        next.forEach(function (p) { if (!p.id) p.id = uid("p"); });
        var before = JSON.stringify(state.doc.panels.map(function (p) { return p.edgeCuts; }));
        var after = JSON.stringify(next.map(function (p) { return p.edgeCuts; }));
        if (before === after && next.length === state.doc.panels.length) return false;
        checkpoint();
        state.doc.panels = next;
        gc();
        return true;
      },
      setImage: function (panelId, info) {
        var panel = panelById(panelId);
        if (!panel || !info || !info.dataUrl) return false;
        return commitMutation(function () {
          var item = storeBankItem(info);
          var current = panelById(panelId);
          if (!current) return;
          current.image = coverFit(current, state.doc.page, {
            id: item.id,
            width: item.width,
            height: item.height
          });
        });
      },
      addBankItems: function (infos) {
        var list = (infos || []).filter(function (info) { return info && typeof info.dataUrl === "string"; });
        if (!list.length) return [];
        var ids = [];
        commitMutation(function () {
          list.forEach(function (info) { ids.push(storeBankItem(info).id); });
        });
        return ids;
      },
      placeBankImage: function (panelId, bankId) {
        var panel = panelById(panelId);
        var item = (state.doc.bank || []).find(function (entry) { return entry.id === bankId; }) || null;
        if (!panel || !item || !state.images.has(item.id)) return false;
        return commitMutation(function () {
          var current = panelById(panelId);
          if (!current) return;
          current.image = coverFit(current, state.doc.page, {
            id: item.id,
            width: item.width,
            height: item.height
          });
        });
      },
      removeBankItem: function (bankId) {
        var idx = (state.doc.bank || []).findIndex(function (entry) { return entry.id === bankId; });
        if (idx < 0) return false;
        return commitMutation(function () {
          state.doc.bank.splice(idx, 1);
        });
      },
      clearBank: function () {
        if (!state.doc.bank || !state.doc.bank.length) return false;
        return commitMutation(function () {
          state.doc.bank = [];
        });
      },
      panImage: function (panelId, dx, dy) {
        var panel = panelById(panelId);
        if (!panel || !panel.image) return;
        panel.image.cx += dx;
        panel.image.cy += dy;
      },
      zoomImage: function (panelId, newScale, origin) {
        var panel = panelById(panelId);
        if (!panel || !panel.image) return;
        var img = panel.image;
        var s = clamp(newScale, 0.02, 10000);
        var k = s / img.scale;
        if (origin && isFinite(k)) {
          img.cx = origin.x - (origin.x - img.cx) * k;
          img.cy = origin.y - (origin.y - img.cy) * k;
        }
        img.scale = s;
      },
      resetImage: function (panelId) {
        var panel = panelById(panelId);
        if (!panel || !panel.image) return false;
        checkpoint();
        var fit = coverFit(panel, state.doc.page, panel.image);
        panel.image.cx = fit.cx;
        panel.image.cy = fit.cy;
        panel.image.scale = fit.scale;
        panel.image.rotation = 0;
        panel.image.flipX = false;
        panel.image.flipY = false;
        return true;
      },
      setImageRotation: function (panelId, deg) {
        var panel = panelById(panelId);
        if (!panel || !panel.image) return;
        panel.image.rotation = normDeg(deg);
      },
      turnImage: function (panelId, delta) {
        var panel = panelById(panelId);
        if (!panel || !panel.image || !isFinite(delta) || delta === 0) return false;
        checkpoint();
        panel.image.rotation = normDeg((panel.image.rotation || 0) + delta);
        return true;
      },
      flipImage: function (panelId, axis) {
        var panel = panelById(panelId);
        if (!panel || !panel.image) return false;
        checkpoint();
        if (axis === "y") panel.image.flipY = !panel.image.flipY;
        else panel.image.flipX = !panel.image.flipX;
        return true;
      },
      resetImageRotation: function (panelId) {
        var panel = panelById(panelId);
        if (!panel || !panel.image) return false;
        if (!panel.image.rotation && !panel.image.flipX && !panel.image.flipY) return false;
        checkpoint();
        panel.image.rotation = 0;
        panel.image.flipX = false;
        panel.image.flipY = false;
        return true;
      },
      removeImage: function (panelId) {
        var panel = panelById(panelId);
        if (!panel || !panel.image) return false;
        checkpoint();
        panel.image = null;
        gc();
        return true;
      },
      addLetter: function (type, rect) {
        var preset = LETTER_PRESETS[type];
        if (!preset) return null;
        var letter = structuredClone(preset);
        letter.id = uid("l");
        letter.x = rect.x;
        letter.y = rect.y;
        letter.w = Math.max(48, rect.w);
        letter.h = Math.max(36, rect.h);
        if (letter.tail) {
          letter.tail.dx *= letter.w / preset.w;
          letter.tail.dy *= letter.h / preset.h;
        }
        checkpoint();
        state.doc.letters.push(letter);
        return letter;
      },
      updateLetter: function (id, partial) {
        var letter = letterById(id);
        if (!letter || !partial) return;
        ["x", "y", "w", "h", "rotation", "fontSize", "strokeWidth", "shapeStrokeWidth", "fontWeight"].forEach(function (k) {
          if (partial[k] != null && isFinite(partial[k])) letter[k] = Number(partial[k]);
        });
        ["text", "font", "fontStyle", "fill", "stroke", "shapeFill", "shapeStroke"].forEach(function (k) {
          if (partial[k] != null) letter[k] = partial[k];
        });
        if (partial.tail && letter.tail) {
          if (partial.tail.dx != null) letter.tail.dx = partial.tail.dx;
          if (partial.tail.dy != null) letter.tail.dy = partial.tail.dy;
        }
        letter.w = Math.max(48, letter.w);
        letter.h = Math.max(36, letter.h);
        letter.fontSize = clamp(letter.fontSize, 8, 400);
        letter.rotation = ((letter.rotation + 180) % 360 + 360) % 360 - 180;
      },
      deleteLetter: function (id) {
        var idx = state.doc.letters.findIndex(function (l) { return l.id === id; });
        if (idx < 0) return false;
        checkpoint();
        state.doc.letters.splice(idx, 1);
        return true;
      },
      toJSON: function () {
        return {
          type: "comic-studio",
          version: 1,
          page: structuredClone(state.doc.page),
          panels: state.doc.panels.map(function (p) {
            var image = null;
            if (p.image && state.images.has(p.image.id)) {
              image = Object.assign({}, p.image, { dataUrl: state.images.get(p.image.id) });
            }
            return { id: p.id, points: p.points, edgeCuts: p.edgeCuts, image: image };
          }),
          letters: structuredClone(state.doc.letters),
          bank: (state.doc.bank || []).map(function (item) {
            var dataUrl = state.images.get(item.id);
            if (!dataUrl) return null;
            return {
              id: item.id,
              name: item.name,
              width: item.width,
              height: item.height,
              dataUrl: dataUrl
            };
          }).filter(Boolean)
        };
      },
      loadJSON: function (raw) {
        var data = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (!data || data.type !== "comic-studio" || data.version !== 1) {
          throw new Error("This file is not a Comic Studio project.");
        }
        var page = data.page || {};
        var w = clamp(Math.round(Number(page.width)), 64, 8192);
        var h = clamp(Math.round(Number(page.height)), 64, 8192);
        if (!isFinite(w) || !isFinite(h)) throw new Error("Project page size is invalid.");
        var images = new Map();
        if (!Array.isArray(data.panels) || !data.panels.length) throw new Error("Project has no panels.");
        var panels = data.panels.map(function (p, index) {
          if (!p || !Array.isArray(p.points) || p.points.length < 3) throw new Error("A panel is invalid.");
          if (!Array.isArray(p.edgeCuts) || p.edgeCuts.length !== p.points.length) throw new Error("A panel is invalid.");
          var points = p.points.map(function (pt) {
            if (!isFinite(pt.x) || !isFinite(pt.y)) throw new Error("A panel is invalid.");
            return { x: Number(pt.x), y: Number(pt.y) };
          });
          var id = String(p.id || ("p" + (index + 1)));
          noteId(id);
          var image = null;
          if (p.image && typeof p.image.dataUrl === "string" && p.image.dataUrl.indexOf("data:image/") === 0) {
            var iid = String(p.image.id || uid("i"));
            noteId(iid);
            images.set(iid, p.image.dataUrl);
            image = {
              id: iid,
              cx: Number(p.image.cx) || 0,
              cy: Number(p.image.cy) || 0,
              scale: clamp(Number(p.image.scale) || 1, 0.02, 10000),
              rotation: normDeg(p.image.rotation || 0),
              flipX: p.image.flipX === true,
              flipY: p.image.flipY === true,
              width: Math.max(1, Number(p.image.width) || 1),
              height: Math.max(1, Number(p.image.height) || 1)
            };
          }
          return { id: id, points: points, edgeCuts: p.edgeCuts.slice(), image: image };
        });
        var letters = [];
        (data.letters || []).forEach(function (src, index) {
          if (!src || !LETTER_PRESETS[src.type]) return;
          var letter = structuredClone(LETTER_PRESETS[src.type]);
          letter.id = String(src.id || ("l" + (index + 1)));
          noteId(letter.id);
          letter.x = Number(src.x) || 0;
          letter.y = Number(src.y) || 0;
          letter.w = Math.max(48, Number(src.w) || letter.w);
          letter.h = Math.max(36, Number(src.h) || letter.h);
          letter.rotation = Number(src.rotation) || 0;
          letter.text = String(src.text || "").slice(0, 2000);
          letter.fontSize = clamp(Number(src.fontSize) || letter.fontSize, 8, 400);
          letter.strokeWidth = clamp(Number(src.strokeWidth) || 0, 0, 80);
          letter.shapeStrokeWidth = clamp(Number(src.shapeStrokeWidth) || 0, 0, 48);
          if (typeof src.font === "string") letter.font = src.font;
          if (src.fontStyle === "italic" || src.fontStyle === "normal") letter.fontStyle = src.fontStyle;
          if (src.fontWeight) letter.fontWeight = Number(src.fontWeight) || letter.fontWeight;
          ["fill", "stroke", "shapeFill", "shapeStroke"].forEach(function (k) {
            if (isHex(src[k])) letter[k] = src[k];
          });
          if (letter.tail && src.tail) {
            letter.tail = { dx: Number(src.tail.dx) || 0, dy: Number(src.tail.dy) || 0 };
          }
          letters.push(letter);
        });
        var doc = {
          page: {
            width: w,
            height: h,
            background: isHex(page.background) ? page.background : "#ffffff",
            gutter: clamp(Number(page.gutter) || 0, 0, 160),
            border: {
              enabled: !page.border || page.border.enabled !== false,
              color: page.border && isHex(page.border.color) ? page.border.color : "#111111",
              width: clamp(page.border ? Number(page.border.width) : 4, 0, 48)
            }
          },
          panels: panels,
          letters: letters,
          bank: []
        };
        if (Array.isArray(data.bank)) {
          data.bank.forEach(function (item) {
            if (!item || typeof item.dataUrl !== "string" || item.dataUrl.indexOf("data:image/") !== 0) return;
            var id = String(item.id || uid("i"));
            noteId(id);
            if (!images.has(id)) images.set(id, item.dataUrl);
            doc.bank.push({
              id: id,
              name: bankName(item.name),
              width: Math.max(1, Number(item.width) || 1),
              height: Math.max(1, Number(item.height) || 1)
            });
          });
        }
        checkpoint();
        images.forEach(function (url, id) { state.images.set(id, url); });
        state.doc = doc;
        gc();
        state.clean = JSON.stringify(state.doc);
      }
    };
  }

  return {
    PAGE_PRESETS: PAGE_PRESETS,
    LAYOUTS: LAYOUTS,
    FONTS: FONTS,
    LETTER_PRESETS: LETTER_PRESETS,
    layoutCuts: layoutCuts,
    createSession: createSession,
    coverFit: coverFit
  };
});
