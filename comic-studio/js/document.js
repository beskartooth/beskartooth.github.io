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
    { id: "Lilita One|400|normal", family: "Lilita One", weight: 400, style: "normal", label: "Lilita One" },
    { id: "Anton|400|normal", family: "Anton", weight: 400, style: "normal", label: "Anton" },
    { id: "Bungee|400|normal", family: "Bungee", weight: 400, style: "normal", label: "Bungee" },
    { id: "Titan One|400|normal", family: "Titan One", weight: 400, style: "normal", label: "Titan One" },
    { id: "Alfa Slab One|400|normal", family: "Alfa Slab One", weight: 400, style: "normal", label: "Alfa Slab One" },
    { id: "Shrikhand|400|normal", family: "Shrikhand", weight: 400, style: "normal", label: "Shrikhand" },
    { id: "Creepster|400|normal", family: "Creepster", weight: 400, style: "normal", label: "Creepster" },
    { id: "Patrick Hand|400|normal", family: "Patrick Hand", weight: 400, style: "normal", label: "Patrick Hand" },
    { id: "Kalam|400|normal", family: "Kalam", weight: 400, style: "normal", label: "Kalam" }
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

    function blankPage(settings) {
      var preset = PAGE_PRESETS.comic;
      var width = settings && settings.width ? settings.width : preset.width;
      var height = settings && settings.height ? settings.height : preset.height;
      var rect = G.rectPanel(width, height);
      var border = settings && settings.border;
      return {
        id: uid("g"),
        page: {
          width: width,
          height: height,
          background: settings && isHex(settings.background) ? settings.background : "#ffffff",
          gutter: settings && isFinite(Number(settings.gutter)) ? Number(settings.gutter) : 28,
          border: {
            enabled: !border || border.enabled !== false,
            color: border && isHex(border.color) ? border.color : "#111111",
            width: border && border.width != null ? border.width : 4
          }
        },
        panels: [{
          id: uid("p"),
          points: rect.points,
          edgeCuts: rect.edgeCuts.slice(),
          image: null
        }],
        letters: [],
        bank: state.bank
      };
    }

    function setBank(bank) {
      state.bank = bank || [];
      (state.pages || []).forEach(function (p) { p.bank = state.bank; });
      if (state.doc) state.doc.bank = state.bank;
    }

    function attach() {
      if (!state.pages.length) state.pages = [blankPage()];
      if (state.index < 0 || state.index >= state.pages.length) state.index = 0;
      state.doc = state.pages[state.index];
      state.doc.bank = state.bank;
    }

    function captureProject() {
      return {
        pages: state.pages.map(function (p) {
          return { id: p.id, page: p.page, panels: p.panels, letters: p.letters };
        }),
        index: state.index,
        bank: state.bank
      };
    }

    function projectJSON() { return JSON.stringify(captureProject()); }

    function applyProject(snap) {
      if (snap && Array.isArray(snap.pages)) {
        state.bank = snap.bank || [];
        state.pages = snap.pages.map(function (p) {
          return { id: p.id || uid("g"), page: p.page, panels: p.panels, letters: p.letters || [], bank: state.bank };
        });
        state.index = snap.index || 0;
        attach();
        return;
      }
      state.bank = (snap && snap.bank) || [];
      if (snap) snap.bank = state.bank;
      state.pages = [snap];
      state.index = 0;
      state.doc = snap;
    }

    function blank() {
      state.bank = [];
      state.pages = [blankPage()];
      state.index = 0;
      state.doc = state.pages[0];
      state.doc.bank = state.bank;
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
      if (!state.bank) setBank([]);
      state.bank.push(item);
      state.doc.bank = state.bank;
      return item;
    }

    function commitMutation(mutate) {
      end();
      var before = projectJSON();
      var snap = structuredClone(captureProject());
      mutate();
      if (projectJSON() === before) return false;
      pushSnapshot(snap);
      gc();
      return true;
    }

    function visitImages(node, used) {
      var pages = node && Array.isArray(node.pages) ? node.pages : (node && node.panels ? [node] : []);
      pages.forEach(function (p) {
        (p.panels || []).forEach(function (panel) { if (panel.image) used.add(panel.image.id); });
      });
      ((node && node.pages ? node.bank : node && node.bank) || []).forEach(function (item) {
        if (item && item.id) used.add(item.id);
      });
    }

    function gc() {
      var used = new Set();
      visitImages(captureProject(), used);
      state.undoStack.forEach(function (snap) { visitImages(snap, used); });
      state.redoStack.forEach(function (snap) { visitImages(snap, used); });
      if (state.draft) visitImages(state.draft, used);
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
      var changed = JSON.stringify(state.draft) !== projectJSON();
      var draft = state.draft;
      state.draft = null;
      if (changed) {
        pushSnapshot(draft);
        gc();
      }
      return changed;
    }

    function begin() {
      if (!state.draft) state.draft = structuredClone(captureProject());
    }

    function cancelDraft() {
      if (!state.draft) return;
      applyProject(state.draft);
      state.draft = null;
      gc();
    }

    function checkpoint() {
      end();
      pushSnapshot(structuredClone(captureProject()));
    }

    function panelById(id) {
      return state.doc.panels.find(function (p) { return p.id === id; }) || null;
    }

    function panelAnchor(panel) {
      var inset = G.insetPolygon(panel, state.doc.page) || panel.points;
      var b = G.bounds(inset);
      return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
    }

    function letterFromClipboard(src, dx, dy) {
      if (!src || typeof src.type !== "string" || !LETTER_PRESETS[src.type]) return null;
      var letter = structuredClone(src);
      letter.id = uid("l");
      letter.x = (Number(src.x) || 0) + (Number(dx) || 0);
      letter.y = (Number(src.y) || 0) + (Number(dy) || 0);
      letter.w = Math.max(48, Number(src.w) || letter.w);
      letter.h = Math.max(36, Number(src.h) || letter.h);
      letter.rotation = normDeg(src.rotation || 0);
      letter.fontSize = clamp(Number(src.fontSize) || letter.fontSize, 8, 400);
      if (src.strokeWidth != null && isFinite(Number(src.strokeWidth))) {
        letter.strokeWidth = clamp(Number(src.strokeWidth), 0, 80);
      }
      if (src.shapeStrokeWidth != null && isFinite(Number(src.shapeStrokeWidth))) {
        letter.shapeStrokeWidth = clamp(Number(src.shapeStrokeWidth), 0, 48);
      }
      if (src.tail && typeof src.tail === "object") {
        letter.tail = { dx: Number(src.tail.dx) || 0, dy: Number(src.tail.dy) || 0 };
      } else {
        letter.tail = null;
      }
      if (src.text != null) letter.text = String(src.text).slice(0, 2000);
      return letter;
    }

    function letterById(id) {
      return state.doc.letters.find(function (l) { return l.id === id; }) || null;
    }

    function paintLetterStyle(letter, style) {
      if (!style) return;
      if (style.type && LETTER_PRESETS[style.type]) letter.type = style.type;
      if (typeof style.font === "string" && style.font) letter.font = style.font;
      if (style.fontStyle === "italic" || style.fontStyle === "normal") letter.fontStyle = style.fontStyle;
      if (style.fontWeight) letter.fontWeight = Number(style.fontWeight) || letter.fontWeight;
      if (style.fontSize != null && isFinite(Number(style.fontSize))) {
        letter.fontSize = clamp(Number(style.fontSize), 8, 400);
      }
      if (style.strokeWidth != null && isFinite(Number(style.strokeWidth))) {
        letter.strokeWidth = clamp(Number(style.strokeWidth), 0, 80);
      }
      if (style.shapeStrokeWidth != null && isFinite(Number(style.shapeStrokeWidth))) {
        letter.shapeStrokeWidth = clamp(Number(style.shapeStrokeWidth), 0, 48);
      }
      if (style.rotation != null && isFinite(Number(style.rotation))) letter.rotation = normDeg(style.rotation);
      ["fill", "stroke", "shapeFill", "shapeStroke"].forEach(function (k) {
        if (isHex(style[k])) letter[k] = style[k];
      });
      if (letter.type === "caption" || letter.type === "sfx") letter.tail = null;
      else if (style.tail && typeof style.tail === "object") {
        letter.tail = { dx: Number(style.tail.dx) || 0, dy: Number(style.tail.dy) || 0 };
      } else if (!letter.tail && LETTER_PRESETS[letter.type] && LETTER_PRESETS[letter.type].tail) {
        letter.tail = structuredClone(LETTER_PRESETS[letter.type].tail);
      }
    }

    state.bank = [];
    state.pages = [];
    state.index = 0;
    blank();
    state.clean = projectJSON();

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
        state.redoStack.push(structuredClone(captureProject()));
        applyProject(state.undoStack.pop());
        gc();
        return true;
      },
      redo: function () {
        end();
        if (!state.redoStack.length) return false;
        state.undoStack.push(structuredClone(captureProject()));
        applyProject(state.redoStack.pop());
        gc();
        return true;
      },
      isDirty: function () { return projectJSON() !== state.clean; },
      markClean: function () { state.clean = projectJSON(); },
      pageCount: function () { return state.pages.length; },
      pageIndex: function () { return state.index; },
      pageAt: function (index) { return state.pages[index] || null; },
      projectHasWork: function () {
        return state.pages.some(function (p) {
          if (p.letters.length) return true;
          if (p.panels.length !== 1 || (p.panels[0] && p.panels[0].image)) return true;
          return false;
        });
      },
      goToPage: function (index) {
        index = Number(index);
        if (!isFinite(index) || index < 0 || index >= state.pages.length || index === state.index) return false;
        end();
        state.index = index;
        attach();
        return true;
      },
      addPage: function () {
        var created = false;
        var ok = commitMutation(function () {
          var page = blankPage(state.doc.page);
          state.pages.splice(state.index + 1, 0, page);
          state.index += 1;
          attach();
          created = true;
        });
        return ok && created;
      },
      duplicatePage: function () {
        return commitMutation(function () {
          var copy = structuredClone({
            page: state.doc.page,
            panels: state.doc.panels,
            letters: state.doc.letters
          });
          copy.id = uid("g");
          copy.panels.forEach(function (panel) { panel.id = uid("p"); });
          copy.letters.forEach(function (letter) { letter.id = uid("l"); });
          copy.bank = state.bank;
          state.pages.splice(state.index + 1, 0, copy);
          state.index += 1;
          attach();
        });
      },
      deletePage: function () {
        if (state.pages.length < 2) return false;
        return commitMutation(function () {
          state.pages.splice(state.index, 1);
          if (state.index >= state.pages.length) state.index = state.pages.length - 1;
          attach();
        });
      },
      movePage: function (from, to) {
        from = Number(from);
        to = Number(to);
        if (!isFinite(from) || !isFinite(to) || from === to) return false;
        if (from < 0 || to < 0 || from >= state.pages.length || to >= state.pages.length) return false;
        return commitMutation(function () {
          var item = state.pages.splice(from, 1)[0];
          state.pages.splice(to, 0, item);
          if (state.index === from) state.index = to;
          else if (from < state.index && to >= state.index) state.index -= 1;
          else if (from > state.index && to <= state.index) state.index += 1;
          attach();
        });
      },
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
        setBank(bank);
        gc();
      },
      newPage: function (opts) {
        var keep = !opts || opts.keepBank !== false;
        return commitMutation(function () {
          var settings = state.doc.page;
          var bank = keep ? state.bank : [];
          state.pages = [blankPage(settings)];
          state.index = 0;
          setBank(bank);
          attach();
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
          setBank([]);
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
      applyLetterStyle: function (id, style) {
        if (!letterById(id) || !style) return false;
        return commitMutation(function () {
          var current = letterById(id);
          if (!current) return;
          paintLetterStyle(current, style);
        });
      },
      addStyledLetter: function (style) {
        var type = style && LETTER_PRESETS[style.type] ? style.type : "bubble";
        var preset = LETTER_PRESETS[type];
        var page = state.doc.page;
        var letter = structuredClone(preset);
        letter.id = uid("l");
        letter.w = preset.w;
        letter.h = preset.h;
        letter.x = Math.round((page.width - letter.w) / 2);
        letter.y = Math.round((page.height - letter.h) / 2);
        letter.text = preset.text;
        paintLetterStyle(letter, style || {});
        letter.text = preset.text;
        checkpoint();
        state.doc.letters.push(letter);
        return letter;
      },
      deleteLetter: function (id) {
        var idx = state.doc.letters.findIndex(function (l) { return l.id === id; });
        if (idx < 0) return false;
        checkpoint();
        state.doc.letters.splice(idx, 1);
        return true;
      },
      panelAnchor: function (panelId) {
        var panel = panelById(panelId);
        if (!panel) return null;
        return panelAnchor(panel);
      },
      pasteLetter: function (src, dx, dy) {
        var created = null;
        var ok = commitMutation(function () {
          created = letterFromClipboard(src, dx, dy);
          if (created) state.doc.letters.push(created);
        });
        return ok ? created : null;
      },
      pastePanelImage: function (panelId, src, dx, dy) {
        var panel = panelById(panelId);
        if (!panel || !src) return false;
        var scale = clamp(Number(src.scale) || 1, 0.02, 10000);
        var width = Math.max(1, Number(src.width) || 1);
        var height = Math.max(1, Number(src.height) || 1);
        var dataUrl = typeof src.dataUrl === "string" && src.dataUrl.indexOf("data:image/") === 0 ? src.dataUrl : "";
        var knownId = src.id && state.images.has(String(src.id));
        if (!knownId && !dataUrl) return false;
        return commitMutation(function () {
          var current = panelById(panelId);
          if (!current) return;
          var id = src.id ? String(src.id) : "";
          if (!id || (!state.images.has(id) && !dataUrl)) id = uid("i");
          if (!state.images.has(id)) state.images.set(id, dataUrl);
          var anchor = panelAnchor(current);
          current.image = {
            id: id,
            cx: anchor.x + (Number(src.relX) || 0) + (Number(dx) || 0),
            cy: anchor.y + (Number(src.relY) || 0) + (Number(dy) || 0),
            scale: scale,
            rotation: normDeg(src.rotation || 0),
            flipX: src.flipX === true,
            flipY: src.flipY === true,
            width: width,
            height: height
          };
        });
      },
      toJSON: function () {
        function packPage(doc) {
          return {
            page: structuredClone(doc.page),
            panels: doc.panels.map(function (p) {
              var image = null;
              if (p.image && state.images.has(p.image.id)) {
                image = Object.assign({}, p.image, { dataUrl: state.images.get(p.image.id) });
              }
              return { id: p.id, points: p.points, edgeCuts: p.edgeCuts, image: image };
            }),
            letters: structuredClone(doc.letters)
          };
        }
        return {
          type: "comic-studio",
          version: 2,
          pages: state.pages.map(packPage),
          bank: (state.bank || []).map(function (item) {
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
        if (!data || data.type !== "comic-studio" || (data.version !== 1 && data.version !== 2)) {
          throw new Error("This file is not a Comic Studio project.");
        }
        var sheets = data.version === 2 && Array.isArray(data.pages) && data.pages.length ? data.pages : [data];
        var images = new Map();
        var loaded = sheets.map(function (sheet) {
        var page = sheet.page || {};
        var w = clamp(Math.round(Number(page.width)), 64, 8192);
        var h = clamp(Math.round(Number(page.height)), 64, 8192);
        if (!isFinite(w) || !isFinite(h)) throw new Error("Project page size is invalid.");
        if (!Array.isArray(sheet.panels) || !sheet.panels.length) throw new Error("Project has no panels.");
        var panels = sheet.panels.map(function (p, index) {
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
        (sheet.letters || []).forEach(function (src, index) {
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
          bank: state.bank,
          id: uid("g")
        };
        return doc;
        });
        var bank = [];
        if (Array.isArray(data.bank)) {
          data.bank.forEach(function (item) {
            if (!item || typeof item.dataUrl !== "string" || item.dataUrl.indexOf("data:image/") !== 0) return;
            var id = String(item.id || uid("i"));
            noteId(id);
            if (!images.has(id)) images.set(id, item.dataUrl);
            bank.push({
              id: id,
              name: bankName(item.name),
              width: Math.max(1, Number(item.width) || 1),
              height: Math.max(1, Number(item.height) || 1)
            });
          });
        }
        checkpoint();
        images.forEach(function (url, id) { state.images.set(id, url); });
        state.pages = loaded;
        state.index = 0;
        setBank(bank);
        attach();
        gc();
        state.clean = projectJSON();
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
