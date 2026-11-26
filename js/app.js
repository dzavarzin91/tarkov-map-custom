/*
 * Offline Escape from Tarkov map viewer.
 * Map geometry follows tarkov.dev's Leaflet setup (MIT): github.com/the-hideout/tarkov-dev
 */
(function () {
  "use strict";

  const CONFIG = window.MAP_CONFIG || [];
  let DATA = window.TARKOV_DATA || null; // may be replaced by data downloaded in the browser
  const JSON_API = "https://json.tarkov.dev/";
  const TILES = window.TILES_MANIFEST || {};
  const ASSET_PREFIX = "https://assets.tarkov.dev/maps/";

  // Icons that exist in ./icons (from tarkov.dev, MIT).
  // Container type -> icon, same mapping as tarkov.dev (src/pages/map/map-images.mjs).
  const CONTAINER_ICONS = {
    "bank-cash-register": "cash-register", "bank-safe": "safe", "buried-barrel-cache": "buried-barrel-cache",
    "cash-register": "cash-register", "cash-register-tar2-2": "cash-register", "dead-civilian": "dead-scav",
    "dead-scav": "dead-scav", "festive-airdrop-supply-crate": "festive-airdrop-supply-crate",
    "pmc-body": "dead-scav", "civilian-body": "dead-scav", "drawer": "drawer", "duffle-bag": "duffle-bag",
    "grenade-box": "grenade-box", "ground-cache": "ground-cache", "jacket": "jacket",
    "lab-technician-body": "dead-scav", "medbag": "medbag", "medcase": "medcase",
    "medical-supply-crate": "crate", "pc-block": "pc-block", "plastic-suitcase": "plastic-suitcase",
    "ration-supply-crate": "crate", "safe": "safe", "scav-body": "dead-scav", "shturmans-stash": "weapon-box",
    "technical-supply-crate": "crate", "toolbox": "toolbox", "weapon-box": "weapon-box",
    "wooden-ammo-box": "wooden-ammo-box", "wooden-crate": "wooden-crate",
  };
  const SPECIAL_SPAWNS = new Set(["cultist-priest", "rogue", "black-div", "af", "bloodhound"]);

  // ------------------------------------------------------------------ text
  const T = {
    ru: {
      brand: "Карты Таркова", search: "Поиск", searchHint: "Выход, ключ, босс…", base: "Подложка",
      schematic: "Схема", satellite: "Спутник", level: "Этаж", ground: "Основной",
      dimOther: "Приглушать метки других этажей", layers: "Метки", panel: "Панель",
      players: "Игроков", raid: "Рейд", min: "мин", m: "м",
      extract_pmc: "Выходы ЧВК", extract_scav: "Выходы Диких", extract_shared: "Общие выходы",
      extract_transit: "Переходы", spawn_pmc: "Спавны ЧВК", spawn_scav: "Спавны Диких",
      spawn_sniper_scav: "Снайперы", spawn_boss: "Боссы и рейдеры", locks: "Запертые двери",
      containers: "Контейнеры с лутом", stationary: "Стационарное оружие", switches: "Рубильники",
      hazards: "Опасные зоны", btr: "Остановки БТР", labels: "Названия мест", names: "Подписи выходов",
      faction_pmc: "Выход ЧВК", faction_scav: "Выход Диких", faction_shared: "Общий выход",
      transit: "Переход на другую локацию", spawn: "Точка появления", boss: "Босс",
      chance: "шанс", escorts: "Охрана", key: "Ключ", needsPower: "Нужно включить питание",
      requires: "Требует", lock: "Замок", container: "Контейнер", weapon: "Стационарное оружие",
      switch: "Рубильник", hazard: "Опасная зона", btrStop: "Остановка БТР", elevation: "Высота",
      sniper: "Снайпер", scav: "Дикий", pmc: "ЧВК",
      noData: "Меток пока нет. Запустите <code>python download_data.py</code> в папке проекта и обновите страницу.",
      noBase: "У этой карты нет векторной версии. Запустите <code>python download_data.py</code>, чтобы сохранить её тайлы.",
      satHint: "Для спутниковой подложки: <code>python download_data.py --satellite</code>",
      dataFrom: "Данные tarkov.dev", savedAt: "сохранены", mode: "режим",
      refresh: "Обновить: <code>python download_data.py --data-only</code>",
      credits: "Карты: Shebuka и участники tarkov.dev (CC BY-NC-SA 4.0). Иконки и данные: tarkov.dev (MIT).",
      noResults: "Ничего не найдено", game: "Escape from Tarkov принадлежит Battlestate Games.",
      statusMarkers: "Меток на этой карте: {n}.", statusNoMap: "В сохранённых данных нет этой карты.",
      statusNoFile: "Файл data/tarkov-data.js не найден.", skipped: "Пропущено повреждённых записей: {n}.",
      fetchBtn: "Скачать метки в браузере", fetching: "Загрузка с tarkov.dev…",
      fetchOk: "Метки загружены и сохранены в этом браузере.", fetchFail: "Не удалось загрузить: {e}",
      dataBrowser: "Данные tarkov.dev, загружены в браузере",
      netDown: "tarkov.dev недоступен из вашей сети (сайт не открывается). Часто помогает VPN или другая сеть.",
      netApiDown: "tarkov.dev открывается, но json.tarkov.dev — нет. Попробуйте VPN или другую сеть.",
      netBlocked: "tarkov.dev доступен, но браузер не пропускает запрос со страницы. Загрузите данные вручную (ниже) или запустите python download_data.py.",
      manualTitle: "Если кнопка не работает: загрузить вручную",
      manualOpen: "Откройте по очереди три ссылки (данные tarkov.dev откроются во вкладках):",
      manualSave: "В каждой вкладке нажмите Ctrl+S и сохраните файл. Если вместо данных там ошибка, пришлите, что там написано.",
      manualFile: "Выбрать сохранённые файлы (все три сразу)",
      importNeedBase: "нет основного файла maps — выберите и его тоже", badFormat: "у данных tarkov.dev неожиданный формат. Запустите python download_data.py --diagnose и пришлите вывод.",
      fetchingNames: "Загрузка названий ({lang})…",
      floorMissing: "Этот этаж есть только в виде изображений, они ещё не скачаны",
      floorMissingHint: "Серые этажи есть только в виде изображений tarkov.dev. Скачать: <code>python download_data.py --maps {map}</code>",
      importOk: "Готово: загружено карт: {n}. Данные сохранены в браузере.", importFail: "Не получилось: {e}",
      importEmpty: "поле пустое", importNoMaps: "в тексте нет данных карт",
      importNotJson: "это не данные tarkov.dev. На странице написано: «{start}». Пришлите мне этот текст.",
      fetchingMap: "Загрузка: карта {i} из {n} ({lang})…", fetchPartial: "Загружено, кроме: {list}. Попробуйте ещё раз позже.",
      allFailed: "ни одна карта не загрузилась",
    },
    en: {
      brand: "Tarkov maps", search: "Search", searchHint: "Extract, key, boss…", base: "Base map",
      schematic: "Schematic", satellite: "Satellite", level: "Level", ground: "Ground",
      dimOther: "Dim markers on other levels", layers: "Markers", panel: "Panel",
      players: "Players", raid: "Raid", min: "min", m: "m",
      extract_pmc: "PMC extracts", extract_scav: "Scav extracts", extract_shared: "Shared extracts",
      extract_transit: "Transits", spawn_pmc: "PMC spawns", spawn_scav: "Scav spawns",
      spawn_sniper_scav: "Sniper scavs", spawn_boss: "Bosses and raiders", locks: "Locked doors",
      containers: "Loot containers", stationary: "Stationary weapons", switches: "Switches",
      hazards: "Hazards", btr: "BTR stops", labels: "Place names", names: "Extract names",
      faction_pmc: "PMC extract", faction_scav: "Scav extract", faction_shared: "Shared extract",
      transit: "Transit to another map", spawn: "Spawn point", boss: "Boss",
      chance: "chance", escorts: "Escorts", key: "Key", needsPower: "Needs power turned on",
      requires: "Requires", lock: "Lock", container: "Container", weapon: "Stationary weapon",
      switch: "Switch", hazard: "Hazard", btrStop: "BTR stop", elevation: "Elevation",
      sniper: "Sniper", scav: "Scav", pmc: "PMC",
      noData: "No markers yet. Run <code>python download_data.py</code> in the project folder, then reload.",
      noBase: "This map has no vector version. Run <code>python download_data.py</code> to save its tiles.",
      satHint: "For satellite imagery: <code>python download_data.py --satellite</code>",
      dataFrom: "Data from tarkov.dev", savedAt: "saved", mode: "mode",
      refresh: "Refresh: <code>python download_data.py --data-only</code>",
      credits: "Maps by Shebuka and tarkov.dev contributors (CC BY-NC-SA 4.0). Icons and data: tarkov.dev (MIT).",
      noResults: "Nothing found", game: "Escape from Tarkov belongs to Battlestate Games.",
      statusMarkers: "Markers on this map: {n}.", statusNoMap: "The saved data has no entry for this map.",
      statusNoFile: "data/tarkov-data.js was not found.", skipped: "Skipped damaged entries: {n}.",
      fetchBtn: "Download markers in the browser", fetching: "Downloading from tarkov.dev…",
      fetchOk: "Markers downloaded and saved in this browser.", fetchFail: "Download failed: {e}",
      dataBrowser: "Data from tarkov.dev, downloaded in the browser",
      netDown: "tarkov.dev can't be reached from your network (the site doesn't open). A VPN or another network often helps.",
      netApiDown: "tarkov.dev opens but json.tarkov.dev doesn't. Try a VPN or another network.",
      netBlocked: "tarkov.dev is reachable, but the browser won't let this page call the API. Load the data manually (below) or run python download_data.py.",
      manualTitle: "If the button doesn't work: load manually",
      manualOpen: "Open these three links one by one (tarkov.dev data opens in tabs):",
      manualSave: "In each tab press Ctrl+S and save the file. If a tab shows an error instead of data, send me what it says.",
      manualFile: "Choose the saved files (all three at once)",
      importNeedBase: "the main maps file is missing; select it too", badFormat: "tarkov.dev's data has an unexpected format. Run python download_data.py --diagnose and send me the output.",
      fetchingNames: "Downloading names ({lang})…",
      floorMissing: "This floor exists only as images, which aren't downloaded yet",
      floorMissingHint: "Greyed-out floors exist only as tarkov.dev images. Download them: <code>python download_data.py --maps {map}</code>",
      importOk: "Done: {n} maps loaded. The data is saved in this browser.", importFail: "Didn't work: {e}",
      importEmpty: "the box is empty", importNoMaps: "no map data in the text",
      importNotJson: "this isn't tarkov.dev data. The page says: “{start}”. Send me that text.",
      fetchingMap: "Downloading map {i} of {n} ({lang})…", fetchPartial: "Downloaded, except: {list}. Try again later.",
      allFailed: "no map could be downloaded",
    },
  };

  // Marker categories in panel order.
  const CATEGORIES = [
    { key: "extract_pmc", icon: "extract_pmc", on: true },
    { key: "extract_shared", icon: "extract_shared", on: true },
    { key: "extract_scav", icon: "extract_scav", on: true },
    { key: "extract_transit", icon: "extract_transit", on: true },
    { key: "spawn_pmc", icon: "spawn_pmc", on: true },
    { key: "spawn_boss", icon: "spawn_boss", on: true },
    { key: "spawn_scav", icon: "spawn_scav", on: false },
    { key: "spawn_sniper_scav", icon: "spawn_sniper_scav", on: false },
    { key: "locks", icon: "lock", on: false },
    { key: "containers", icon: "container_crate", on: false },
    { key: "stationary", icon: "stationarygun", on: false },
    { key: "switches", icon: "switch", on: false },
    { key: "hazards", icon: "hazard", on: false },
    { key: "btr", icon: "btr_stop", on: true },
    { key: "labels", icon: null, on: true },
  ];

  // ------------------------------------------------------------------ state
  const saved = loadSettings();
  const state = {
    lang: saved.lang || "ru",
    base: saved.base || "svg",
    dimOther: saved.dimOther !== false,
    showNames: saved.showNames !== false,
    visible: Object.assign(
      Object.fromEntries(CATEGORIES.map((c) => [c.key, c.on])),
      saved.visible || {}
    ),
    cfg: null,
    level: -1, // -1 = ground, otherwise index into cfg.layers
    map: null,
    groups: {},
    markers: [], // { cat, marker, level, search, label, icon }
    svgEl: null,
    svgOverlay: null,
    tileBase: null,
    tileLevel: null,
  };

  const $ = (id) => document.getElementById(id);
  const t = (k) => (T[state.lang] && T[state.lang][k]) || T.en[k] || k;

  function loadSettings() {
    try { return JSON.parse(localStorage.getItem("tarkov-offline-maps") || "{}"); } catch (e) { return {}; }
  }
  function saveSettings() {
    try {
      localStorage.setItem("tarkov-offline-maps", JSON.stringify({
        lang: state.lang, base: state.base, dimOther: state.dimOther,
        showNames: state.showNames, visible: state.visible,
      }));
    } catch (e) { /* storage unavailable on file:// in some browsers */ }
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // ------------------------------------------------------------------ geometry (tarkov.dev CRS)
  function applyRotation(latLng, rotation) {
    if (!latLng.lng && !latLng.lat) return L.latLng(0, 0);
    if (!rotation) return latLng;
    const a = (rotation * Math.PI) / 180;
    const cos = Math.cos(a), sin = Math.sin(a);
    const x = latLng.lng, y = latLng.lat;
    return L.latLng(x * sin + y * cos, x * cos - y * sin);
  }

  function getCRS(cfg) {
    const [sx, mx, sy, my] = cfg.transform || [1, 0, 1, 0];
    return L.extend({}, L.CRS.Simple, {
      transformation: new L.Transformation(sx, mx, -sy, my),
      projection: L.extend({}, L.Projection.LonLat, {
        project: (ll) => L.Projection.LonLat.project(applyRotation(ll, cfg.coordinateRotation)),
        unproject: (pt) => applyRotation(L.Projection.LonLat.unproject(pt), -cfg.coordinateRotation),
      }),
    });
  }

  const pos = (p) => [p.z, p.x];
  const toBounds = (b) => L.latLngBounds([b[0][1], b[0][0]], [b[1][1], b[1][0]]);
  function scaledBounds(b, f) {
    const cx = (b[0][0] + b[1][0]) / 2, cy = (b[0][1] + b[1][1]) / 2;
    const w = (b[1][0] - b[0][0]) * f, h = (b[1][1] - b[0][1]) * f;
    return [[cy - h / 2, cx - w / 2], [cy + h / 2, cx + w / 2]];
  }

  // Which level a point belongs to: index into cfg.layers, or -1 for ground.
  function levelOf(cfg, p) {
    if (!p || typeof p.y !== "number") return -1;
    for (let i = 0; i < (cfg.layers || []).length; i++) {
      for (const ext of cfg.layers[i].extents || []) {
        const [lo, hi] = ext.height;
        if (p.y < lo || p.y >= hi) continue;
        if (!ext.bounds) return i;
        for (const bb of ext.bounds) {
          const xs = [bb[0][0], bb[1][0]], zs = [bb[0][1], bb[1][1]];
          if (p.x >= Math.min(...xs) && p.x <= Math.max(...xs) && p.z >= Math.min(...zs) && p.z <= Math.max(...zs)) return i;
        }
      }
    }
    return -1;
  }

  // ------------------------------------------------------------------ data helpers
  // The API can return partial data with null entries; never trust a list blindly.
  const list = (v) => (Array.isArray(v) ? v.filter((x) => x && typeof x === "object") : []);
  const validPos = (p) => !!p && Number.isFinite(p.x) && Number.isFinite(p.z);

  function mapData(cfg) {
    if (!DATA || !DATA.maps) return null;
    const maps = list(DATA.maps[state.lang]).length ? list(DATA.maps[state.lang]) : list(DATA.maps.en);
    return maps.find((m) => m.normalizedName === cfg.id)
      || maps.find((m) => (cfg.altMaps || []).includes(m.normalizedName))
      || null;
  }

  function localTileUrl(template) {
    if (!template || !template.startsWith(ASSET_PREFIX)) return null;
    const key = template.slice(ASSET_PREFIX.length).replace(/\/\{z\}\/\{x\}\/\{y\}\.png$/, "");
    const info = TILES[key];
    if (!info) return null;
    return { url: "tiles/" + key + "/{z}/{x}/{y}.png", maxNativeZoom: info.maxZoom };
  }

  function makeTileLayer(cfg, template, extraClass) {
    const local = localTileUrl(template);
    if (!local) return null;
    return L.tileLayer(local.url, {
      tileSize: cfg.tileSize || 256,
      bounds: toBounds(cfg.bounds),
      maxNativeZoom: local.maxNativeZoom,
      maxZoom: cfg.maxZoom + 1,
      className: extraClass || "",
      errorTileUrl: "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==",
    });
  }

  function loadSvg(name) {
    return new Promise((resolve) => {
      if (!name) return resolve(null);
      window.TARKOV_SVG = window.TARKOV_SVG || {};
      if (window.TARKOV_SVG[name]) return resolve(window.TARKOV_SVG[name]);
      const s = document.createElement("script");
      s.src = "js/svg/" + name + ".js";
      s.onload = () => resolve(window.TARKOV_SVG[name] || null);
      s.onerror = () => resolve(null);
      document.head.appendChild(s);
    });
  }

  // ------------------------------------------------------------------ map setup
  async function openMap(cfg) {
    state.cfg = cfg;
    state.level = -1;
    if (state.map) { state.map.remove(); state.map = null; }
    state.svgEl = state.svgOverlay = state.tileBase = state.tileLevel = null;
    state.markers = [];
    state.groups = {};

    const map = L.map("map", {
      crs: getCRS(cfg),
      minZoom: cfg.minZoom,
      maxZoom: cfg.maxZoom + 1,
      zoomSnap: 0.25,
      zoomDelta: 0.5,
      attributionControl: true,
      maxBounds: scaledBounds(cfg.bounds, 1.5),
    });
    state.map = map;
    map.attributionControl.setPrefix(false);
    map.attributionControl.addAttribution(
      cfg.svgCredit
        ? esc(cfg.svgCredit) + ' (CC BY-NC-SA 4.0) · data <a href="https://tarkov.dev" target="_blank" rel="noopener">tarkov.dev</a>'
        : 'Map: <a href="' + esc(cfg.authorLink || "https://tarkov.dev") + '" target="_blank" rel="noopener">' + esc(cfg.author || "tarkov.dev") +
          '</a> · data <a href="https://tarkov.dev" target="_blank" rel="noopener">tarkov.dev</a>'
    );
    map.fitBounds(toBounds(cfg.bounds));
    map.on("zoomend", updateLabelSize);
    map.on("mousemove", (e) => {
      $("coords").textContent = "x " + e.latlng.lng.toFixed(1) + "   z " + e.latlng.lat.toFixed(1);
    });
    map.on("mouseout", () => { $("coords").textContent = ""; });

    // Base layers
    const svgText = await loadSvg(cfg.svg);
    if (state.cfg !== cfg) return; // user switched maps while loading
    if (svgText) {
      const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
      const svgEl = document.importNode(doc.documentElement, true);
      svgEl.removeAttribute("width");
      svgEl.removeAttribute("height");
      for (const g of Array.from(svgEl.children)) {
        if (g.nodeName !== "g" || !g.id) continue;
        if (g.id === cfg.svgLayer || (g.dataset && g.dataset.keepWithGroup === cfg.svgLayer)) g.classList.add("base-layer");
        else g.classList.add("overlay-layer", "hidden-layer");
      }
      state.svgEl = svgEl;
      state.svgOverlay = L.svgOverlay(svgEl, toBounds(cfg.svgBounds || cfg.bounds), { className: "svg-base", interactive: false });
    }
    state.tileBase = cfg.tilePath ? makeTileLayer(cfg, cfg.tilePath) : null;

    buildMarkers(cfg);
    renderStatus();
    renderBase();
    renderLevels();
    renderLayerList();
    renderHeader();
    updateLabelSize();
    runSearch();
  }

  // Decide which base/level layers are on the map.
  function renderBase() {
    const cfg = state.cfg, map = state.map;
    if (!map) return;
    const hasSvg = !!state.svgOverlay, hasTiles = !!state.tileBase;
    let mode = state.base;
    if (mode === "svg" && !hasSvg) mode = "sat";
    if (mode === "sat" && !hasTiles && hasSvg) mode = "svg";

    // base segmented control
    for (const b of $("baseSeg").querySelectorAll("button")) {
      b.setAttribute("aria-pressed", String(b.dataset.base === mode));
      b.disabled = b.dataset.base === "svg" ? !hasSvg : !hasTiles;
    }
    $("baseBlock").hidden = !(hasSvg || cfg.tilePath);
    $("baseHint").innerHTML = cfg.tilePath && !hasTiles && hasSvg ? t("satHint") : "";

    const layer = state.level >= 0 ? cfg.layers[state.level] : null;

    // tiles
    if (state.tileLevel) { map.removeLayer(state.tileLevel); state.tileLevel = null; }
    if (mode === "sat" && hasTiles) {
      if (!map.hasLayer(state.tileBase)) state.tileBase.addTo(map);
      const container = state.tileBase.getContainer && state.tileBase.getContainer();
      if (container) container.classList.toggle("tiles-off-level", !!layer && !layer.show);
    } else if (state.tileBase && map.hasLayer(state.tileBase)) {
      map.removeLayer(state.tileBase);
    }
    // A level drawn only as tiles (e.g. Customs 4th floor) shows in either mode.
    if (layer && layer.tilePath && (mode === "sat" || !layer.svgLayer)) {
      state.tileLevel = makeTileLayer(cfg, layer.tilePath);
      if (state.tileLevel) state.tileLevel.addTo(map);
    }

    // svg: full schematic in svg mode; in satellite mode only to draw a level that has no tiles
    if (state.svgOverlay) {
      const svgLevelOnly = mode === "sat" && layer && layer.svgLayer && !layer.tilePath;
      const showSvg = mode === "svg" || svgLevelOnly;
      if (showSvg && !map.hasLayer(state.svgOverlay)) state.svgOverlay.addTo(map);
      if (!showSvg && map.hasLayer(state.svgOverlay)) map.removeLayer(state.svgOverlay);
      for (const g of Array.from(state.svgEl.children)) {
        if (!g.classList.contains("overlay-layer")) continue;
        g.classList.toggle("hidden-layer", !(layer && layer.svgLayer === g.id));
      }
      state.svgEl.classList.toggle("off-level", !!layer && !layer.show);
      for (const g of state.svgEl.querySelectorAll(":scope > g.base-layer")) {
        g.style.display = svgLevelOnly ? "none" : "";
      }
    }

    const noBase = !hasSvg && !hasTiles;
    showNotice(noBase ? t("noBase") : !DATA ? t("noData") + '</p><p><button type="button" class="btn" data-fetch>' + esc(t("fetchBtn")) + "</button>" : "");
    applyLevelDimming();
  }

  function showNotice(html) {
    const n = $("notice");
    n.hidden = !html;
    n.innerHTML = html ? "<p>" + html + "</p>" : "";
    for (const b of n.querySelectorAll("[data-fetch]")) b.addEventListener("click", fetchInBrowser);
  }

  // ------------------------------------------------------------------ markers
  function icon(name, opts) {
    return L.icon(Object.assign({ iconUrl: "icons/" + name + ".png", iconSize: [24, 24], popupAnchor: [0, -12], className: "mk-img" }, opts || {}));
  }
  function namedIcon(img, text, cls) {
    return L.divIcon({
      className: "mk mk-named " + cls,
      html: '<img src="icons/' + img + '.png" alt=""><span>' + esc(text) + "</span>",
      iconSize: [24, 24], iconAnchor: [12, 12], popupAnchor: [0, -12],
    });
  }
  function popup(title, kind, rows, p) {
    let h = '<div class="pop-title">' + esc(title) + '</div><div class="pop-kind">' + esc(kind) + "</div>";
    for (const r of rows || []) h += r;
    if (p && typeof p.y === "number") h += '<div class="pop-elev">' + esc(t("elevation")) + " " + p.y.toFixed(1) + " " + esc(t("m")) + "</div>";
    return h;
  }
  const row = (label, value) => '<div class="pop-row"><b>' + esc(label) + ":</b> " + esc(value) + "</div>";

  function group(cat) {
    if (!state.groups[cat]) state.groups[cat] = L.layerGroup();
    return state.groups[cat];
  }

  function add(cat, p, ic, html, search, extra) {
    if (!validPos(p)) return null;
    if (typeof p.y !== "number") p = Object.assign({}, p, { y: 0 });
    const m = L.marker(pos(p), { icon: ic, riseOnHover: true, keyboard: true, title: search || "" });
    if (html) m.bindPopup(html);
    m.addTo(group(cat));
    const rec = Object.assign({ cat, marker: m, level: levelOf(state.cfg, p), search: (search || "").toLowerCase(), label: search || "", p }, extra || {});
    m.on("add", () => applyDimTo(rec));
    state.markers.push(rec);
    return rec;
  }

  function addOutline(cat, outline, color, p, top, bottom) {
    outline = list(outline).filter(validPos);
    if (outline.length < 3) return;
    const poly = L.polygon(outline.map(pos), { color, weight: 1, fillOpacity: 0.08, interactive: false, className: "zone-shape" });
    poly.addTo(group(cat));
    const y = (typeof top === "number" && typeof bottom === "number") ? (top + bottom) / 2 : p && p.y;
    state.markers.push({ cat, shape: poly, level: levelOf(state.cfg, Object.assign({}, p, { y })), search: "" });
  }

  function problem(where, e) {
    state.problems[where] = (state.problems[where] || 0) + 1;
    if (state.problems[where] === 1) console.warn("Skipped a bad " + where + " entry:", e);
  }

  function buildMarkers(cfg) {
    state.problems = {};
    const md = mapData(cfg);
    state.mapHasData = !!md;
    const colors = { pmc: "#00e599", scav: "#ff8a1f", shared: "#39e1e2" };

    // place names
    for (const lb of cfg.labels || []) {
      let y = 0;
      if (lb.position.length > 2) y = lb.position[2];
      else if (typeof lb.top === "number" && typeof lb.bottom === "number") y = (lb.top - lb.bottom) / 2 + lb.bottom;
      else if (cfg.heightRange) y = (cfg.heightRange[0] + cfg.heightRange[1]) / 2;
      const p = { x: lb.position[0], y, z: lb.position[1] };
      const size = (lb.size || 100) / 100;
      const ic = L.divIcon({
        className: "place-label",
        html: '<div style="font-size:calc(var(--label-size, 15px) * ' + size + ");transform:translate(-50%,-50%) rotate(" + (Number(lb.rotation) || 0) + 'deg)">' + esc(lb.text) + "</div>",
        iconSize: [0, 0],
      });
      const m = L.marker(pos(p), { icon: ic, interactive: false, keyboard: false, zIndexOffset: -100000 });
      m.addTo(group("labels"));
      const rec = { cat: "labels", marker: m, level: levelOf(cfg, p), search: lb.text.toLowerCase(), label: lb.text, p, isLabel: true };
      m.on("add", () => applyDimTo(rec));
      state.markers.push(rec);
    }

    if (!md) { showGroups(); return; }

    for (const ex of list(md.extracts)) {
      try {
        const f = ex.faction || "shared";
        const cat = "extract_" + (colors[f] ? f : "shared");
        const rows = [];
        const sw = list(ex.switches).map((s) => s.name).filter(Boolean);
        if (sw.length) rows.push(row(t("requires"), sw.join(", ")));
        const rec = add(cat, ex.position, namedIcon("extract_" + (colors[f] ? f : "shared"), ex.name, f), popup(ex.name, t("faction_" + f), rows, ex.position), ex.name, { icon: "extract_" + f });
        if (rec) addOutline(cat, ex.outline, colors[f] || colors.shared, ex.position, ex.top, ex.bottom);
      } catch (e) { problem("extracts", e); }
    }

    for (const tr of list(md.transits)) {
      try {
        const name = tr.description || (tr.map && tr.map.name) || t("transit");
        const rows = [];
        if (tr.map && tr.map.name) rows.push(row("→", tr.map.name));
        if (tr.conditions) rows.push('<div class="pop-row">' + esc(tr.conditions) + "</div>");
        add("extract_transit", tr.position, namedIcon("extract_transit", name, "transit"), popup(name, t("transit"), rows, tr.position), name, { icon: "extract_transit" });
        addOutline("extract_transit", tr.outline, "#c9a6ff", tr.position, tr.top, tr.bottom);
      } catch (e) { problem("transits", e); }
    }

    // spawns (same classification as tarkov.dev)
    for (const sp of list(md.spawns)) {
      try {
        const cats = Array.isArray(sp.categories) ? sp.categories : [], sides = Array.isArray(sp.sides) ? sp.sides : [];
        let type = "", bosses = [];
        if (cats.includes("boss")) {
          bosses = list(md.bosses).filter((b) => b.boss && b.boss.name && list(b.spawnLocations).some((sl) => sl.spawnKey === sp.zoneName));
          bosses = bosses.filter((b, i, a) => a.findIndex((o) => o.boss.normalizedName === b.boss.normalizedName) === i);
          if (!bosses.length) { if (cats.includes("bot") && sides.includes("scav")) type = "scav"; else continue; }
          else if (bosses.length === 1 && SPECIAL_SPAWNS.has(bosses[0].boss.normalizedName)) type = bosses[0].boss.normalizedName;
          else type = "boss";
        } else if (cats.includes("player")) {
          if (sides.includes("pmc") || sides.includes("all")) type = "pmc"; else continue;
        } else if (cats.includes("sniper")) type = "sniper_scav";
        else if (sides.includes("scav")) {
          if (cats.includes("bot") || cats.includes("all")) type = "scav"; else continue;
        } else continue;

        const cat = type === "pmc" ? "spawn_pmc" : type === "scav" ? "spawn_scav" : type === "sniper_scav" ? "spawn_sniper_scav" : "spawn_boss";
        const opts = type === "pmc" ? { iconAnchor: [12, 24], popupAnchor: [0, -24] } : {};
        let title, kind = t("spawn"), rows = [], search = "";
        if (bosses.length) {
          title = bosses.map((b) => b.boss.name).join(", ");
          kind = t("boss");
          search = title;
          for (const b of bosses) {
            const loc = list(b.spawnLocations).find((sl) => sl.spawnKey === sp.zoneName);
            const pct = Math.round((b.spawnChance || 0) * 100);
            let line = "<b>" + esc(b.boss.name) + "</b> " + pct + "% " + esc(t("chance"));
            if (loc && loc.name) line += ", " + esc(loc.name) + (loc.chance < 1 ? " (" + Math.round(loc.chance * 100) + "%)" : "");
            rows.push('<div class="pop-row">' + line + "</div>");
            const esc_ = list(b.escorts).filter((e) => e.boss && e.boss.name).map((e) => {
              const n = list(e.amount).map((a) => a.count).filter((c) => c > 0);
              return e.boss.name + (n.length ? " ×" + (Math.min(...n) === Math.max(...n) ? n[0] : Math.min(...n) + "–" + Math.max(...n)) : "");
            });
            if (esc_.length) rows.push(row(t("escorts"), esc_.join(", ")));
            if (b.spawnTrigger) rows.push('<div class="pop-row">' + esc(b.spawnTrigger) + "</div>");
          }
        } else {
          title = type === "pmc" ? t("pmc") : type === "sniper_scav" ? t("sniper") : t("scav");
        }
        if (sp.zoneName) rows.push('<div class="pop-kind">' + esc(sp.zoneName) + "</div>");
        add(cat, sp.position, icon("spawn_" + type, opts), popup(title, kind, rows, sp.position), search, { icon: "spawn_" + type });
      } catch (e) { problem("spawns", e); }
    }

    for (const lk of list(md.locks)) {
      try {
        const keyName = lk.key ? lk.key.name : "?";
        const rows = [row(t("key"), keyName)];
        if (lk.needsPower) rows.push('<div class="pop-row">' + esc(t("needsPower")) + "</div>");
        const isCard = /keycard|карта/i.test(keyName);
        add("locks", lk.position, icon(isCard ? "keycard" : "lock"), popup(keyName, t("lock") + (lk.lockType ? " (" + lk.lockType + ")" : ""), rows, lk.position), keyName + " " + (lk.key && lk.key.shortName || ""), { icon: isCard ? "keycard" : "lock" });
      } catch (e) { problem("locks", e); }
    }

    for (const lc of list(md.lootContainers)) {
      try {
        const c = lc.lootContainer || {};
        const img = "container_" + (CONTAINER_ICONS[c.normalizedName] || "crate");
        add("containers", lc.position, icon(img), popup(c.name || t("container"), t("container"), [], lc.position), c.name, { icon: img });
      } catch (e) { problem("lootContainers", e); }
    }

    for (const sw of list(md.stationaryWeapons)) {
      try {
        const w = sw.stationaryWeapon || {};
        add("stationary", sw.position, icon("stationarygun"), popup(w.name || t("weapon"), t("weapon"), [], sw.position), w.name, { icon: "stationarygun" });
      } catch (e) { problem("stationaryWeapons", e); }
    }

    for (const s of list(md.switches)) {
      try {
        add("switches", s.position, icon("switch"), popup(s.name || t("switch"), t("switch") + (s.switchType ? " (" + s.switchType + ")" : ""), [], s.position), s.name, { icon: "switch" });
      } catch (e) { problem("switches", e); }
    }

    for (const hz of list(md.hazards)) {
      try {
        const mortar = /mortar|artillery/i.test(hz.hazardType || "");
        const img = mortar ? "hazard_mortar" : "hazard";
        add("hazards", hz.position, icon(img), popup(hz.name || t("hazard"), t("hazard") + (hz.hazardType ? " (" + hz.hazardType + ")" : ""), [], hz.position), hz.name, { icon: img });
        addOutline("hazards", hz.outline, "#ff3b3b", hz.position, hz.top, hz.bottom);
      } catch (e) { problem("hazards", e); }
    }

    for (const b of list(md.btrStops)) {
      try {
        const p = { x: b.x, y: b.y, z: b.z };
        add("btr", p, L.divIcon({ className: "mk mk-named btr", html: '<img src="icons/btr_stop.png" alt=""><span>' + esc(b.name) + "</span>", iconSize: [24, 24], iconAnchor: [12, 12], popupAnchor: [0, -12] }),
          popup(b.name, t("btrStop"), [], p), b.name, { icon: "btr_stop" });
      } catch (e) { problem("btrStops", e); }
    }

    showGroups();
  }

  function showGroups() {
    for (const c of CATEGORIES) if (state.visible[c.key] && state.groups[c.key]) state.groups[c.key].addTo(state.map);
  }

  function applyDimTo(rec) {
    const off = state.dimOther && rec.level !== state.level;
    if (rec.marker) {
      const el = rec.marker.getElement && rec.marker.getElement();
      if (el) el.classList.toggle("off-level-marker", off);
    }
    if (rec.shape) {
      rec.shape.setStyle(off ? { opacity: 0.2, fillOpacity: 0.02 } : { opacity: 1, fillOpacity: 0.08 });
    }
  }
  function applyLevelDimming() { for (const r of state.markers) applyDimTo(r); }

  function updateLabelSize() {
    if (!state.map) return;
    const z = state.map.getZoom() - state.cfg.minZoom;
    const px = Math.max(10, Math.min(30, 12 * Math.pow(1.35, z)));
    $("map").style.setProperty("--label-size", px.toFixed(1) + "px");
  }

  // ------------------------------------------------------------------ panel
  function renderMapList() {
    const nav = $("mapList");
    nav.innerHTML = "";
    for (const cfg of CONFIG) {
      const a = document.createElement("a");
      a.href = "#" + cfg.slug;
      a.textContent = cfg.name[state.lang] || cfg.name.en;
      if (state.cfg === cfg) a.setAttribute("aria-current", "page");
      nav.appendChild(a);
    }
  }

  function renderHeader() {
    const cfg = state.cfg;
    const md = mapData(cfg);
    const title = (md && md.name) || cfg.name[state.lang] || cfg.name.en;
    $("mapTitle").textContent = title;
    document.title = title + " · " + t("brand");
    let facts = "";
    if (md) {
      const bits = [];
      if (md.players) bits.push(esc(t("players")) + " <b>" + esc(md.players) + "</b>");
      if (md.raidDuration) bits.push(esc(t("raid")) + " <b>" + esc(md.raidDuration) + " " + esc(t("min")) + "</b>");
      facts = bits.join("&emsp;");
    }
    $("raidFacts").innerHTML = facts;
  }

  function renderLevels() {
    const cfg = state.cfg;
    const box = $("levels");
    box.innerHTML = "";
    const layers = cfg.layers || [];
    $("levelBlock").hidden = layers.length === 0;
    const opts = [{ i: -1, name: t("ground") }].concat(layers.map((l, i) => ({ i, name: l.name })));
    let missing = 0;
    for (const o of opts) {
      const usable = o.i < 0 || layers[o.i].svgLayer && state.svgOverlay || localTileUrl(layers[o.i].tilePath);
      if (!usable && !layers[o.i].tilePath) continue; // nothing to show for this floor at all
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = o.name;
      b.setAttribute("aria-pressed", String(state.level === o.i));
      if (usable) {
        b.addEventListener("click", () => { state.level = o.i; renderLevels(); renderBase(); });
      } else {
        b.disabled = true;
        b.title = t("floorMissing");
        missing++;
      }
      box.appendChild(b);
    }
    $("levelHint").innerHTML = missing ? t("floorMissingHint").replace("{map}", esc(cfg.slug)) : "";
  }

  function renderLayerList() {
    const ul = $("layerList");
    ul.innerHTML = "";
    const counts = {};
    for (const r of state.markers) if (r.marker) counts[r.cat] = (counts[r.cat] || 0) + 1;
    for (const c of CATEGORIES) {
      const li = document.createElement("li");
      const n = counts[c.key] || 0;
      if (!n) li.className = "empty";
      li.innerHTML = '<label><input type="checkbox"' + (state.visible[c.key] ? " checked" : "") + ">" +
        (c.icon ? '<img src="icons/' + c.icon + '.png" alt="">' : "<span></span>") +
        "<span>" + esc(t(c.key)) + '</span><span class="count">' + n + "</span></label>";
      li.querySelector("input").addEventListener("change", (e) => {
        state.visible[c.key] = e.target.checked;
        const g = state.groups[c.key];
        if (g) { if (e.target.checked) g.addTo(state.map); else state.map.removeLayer(g); }
        saveSettings();
      });
      ul.appendChild(li);
    }
    const li = document.createElement("li");
    li.innerHTML = '<label><input type="checkbox"' + (state.showNames ? " checked" : "") + '><span></span><span>' + esc(t("names")) + "</span><span></span></label>";
    li.querySelector("input").addEventListener("change", (e) => {
      state.showNames = e.target.checked;
      $("map").classList.toggle("hide-names", !state.showNames);
      saveSettings();
    });
    ul.appendChild(li);
    $("map").classList.toggle("hide-names", !state.showNames);
  }

  function renderStatus() {
    const el = $("mapStatus");
    if (!el) return;
    let h;
    if (!DATA) h = t("statusNoFile");
    else if (!state.mapHasData) h = t("statusNoMap");
    else h = t("statusMarkers").replace("{n}", state.markers.filter((r) => r.marker && !r.isLabel).length);
    const bad = Object.values(state.problems || {}).reduce((a, b) => a + b, 0);
    if (bad) h += " " + t("skipped").replace("{n}", bad);
    el.textContent = h;
  }

  function renderFooter() {
    const f = $("dataStatus");
    let h = '<p id="mapStatus" class="status"></p>';
    h += '<p><button type="button" class="btn" data-fetch>' + esc(t("fetchBtn")) + '</button> <span id="fetchMsg" role="status"></span></p>';
    h += '<details class="manual"><summary>' + esc(t("manualTitle")) + "</summary><ol>" +
      "<li>" + esc(t("manualOpen")) + "<br>" + manualFiles().map((f) =>
        '<a href="' + esc(JSON_API + f) + '" target="_blank" rel="noopener">' + esc(f.split("/")[1]) + "</a>").join(", ") + "</li>" +
      "<li>" + esc(t("manualSave")) + "</li>" +
      '<li><label class="btn file-btn">' + esc(t("manualFile")) +
      '<input type="file" id="fileIn" multiple accept=".json,.txt,.html,application/json,text/plain"></label></li>' +
      '</ol><p id="importMsg" role="status"></p></details>';
    if (DATA && DATA.source === "browser") {
      const d = new Date(DATA.fetchedAt);
      const when = isNaN(d) ? DATA.fetchedAt : d.toLocaleDateString(state.lang === "ru" ? "ru-RU" : "en-GB", { day: "numeric", month: "long", year: "numeric" });
      h += "<p>" + esc(t("dataBrowser")) + " " + esc(when) + (String(when).endsWith(".") ? "" : ".") + "</p>";
    } else if (DATA) {
      const d = new Date(DATA.fetchedAt);
      const when = isNaN(d) ? DATA.fetchedAt : d.toLocaleDateString(state.lang === "ru" ? "ru-RU" : "en-GB", { day: "numeric", month: "long", year: "numeric" });
      h += "<p>" + esc(t("dataFrom")) + ", " + esc(t("savedAt")) + " " + esc(when) + ", " + esc(t("mode")) + " " + esc(DATA.gameMode === "pve" ? "PvE" : "PvP") + ".</p>";
      h += "<p>" + t("refresh") + "</p>";
    }
    h += "<p>" + esc(t("credits")) + "</p><p>" + esc(t("game")) + "</p>";
    f.innerHTML = h;
    for (const b of f.querySelectorAll("[data-fetch]")) b.addEventListener("click", fetchInBrowser);
    $("fileIn").addEventListener("change", async (e) => {
      const files = Array.from(e.target.files || []);
      if (files.length) importText(await Promise.all(files.map((f) => f.text())));
      e.target.value = "";
    });
    if (state.cfg) renderStatus();
  }

  // ------------------------------------------------------------------ manual import
  // Opening a file in a normal tab is not subject to the browser's CORS rules, so this works
  // even when the button is refused. The user saves the files and picks them all at once.
  function manualFiles() {
    const mode = (DATA && DATA.gameMode) || "regular";
    return [mode + "/maps", mode + "/maps_ru", mode + "/maps_en"];
  }

  // Sort pasted/selected texts into the base file and translation tables; also accept our own format.
  function parseImported(texts) {
    let base = null, own = null;
    const tables = { en: {}, ru: {} };
    for (let text of texts) {
      text = String(text || "").trim();
      if (!text) continue;
      if (text.startsWith("<")) {
        const doc = new DOMParser().parseFromString(text, "text/html");
        text = (doc.querySelector("pre") || doc.body).textContent.trim();
      }
      let json;
      try { json = JSON.parse(text); } catch (e) {
        throw new Error(t("importNotJson").replace("{start}", text.slice(0, 80)));
      }
      if (json && json.maps && !Array.isArray(json.maps) && (json.maps.en || json.maps.ru)) { own = json; continue; }
      const inner = json && json.data;
      if (inner && inner.maps) { base = inner; continue; }
      if (inner && typeof inner === "object") {
        const sample = Object.values(inner).slice(0, 400).join(" ");
        Object.assign(/[а-яё]/i.test(sample) ? tables.ru : tables.en, inner);
        continue;
      }
      throw new Error(t("importNoMaps"));
    }
    if (own) return own;
    if (!base) throw new Error(t("importNeedBase"));
    return buildData(base, tables, "regular");
  }

  async function importText(texts) {
    const msg = $("importMsg");
    try {
      texts = [].concat(texts).filter((x) => String(x || "").trim());
      if (!texts.length) throw new Error(t("importEmpty"));
      const data = parseImported(texts);
      DATA = data;
      await idbSet(data);
      renderFooter();
      $("importMsg").textContent = t("importOk").replace("{n}", (data.maps.ru || data.maps.en).length);
      const cfg = state.cfg;
      state.cfg = null;
      await openMap(cfg);
    } catch (e) {
      console.error(e);
      (msg && document.body.contains(msg) ? msg : $("importMsg")).textContent = t("importFail").replace("{e}", e.message || String(e));
    }
  }

  // ------------------------------------------------------------------ download in the browser
  // tarkov.dev's API allows requests from any page, so the viewer can fetch data itself.
  function stripNulls(v) {
    if (Array.isArray(v)) return v.filter((x) => x != null).map(stripNulls);
    if (v && typeof v === "object") { const o = {}; for (const k in v) o[k] = stripNulls(v[k]); return o; }
    return v;
  }

  // ---- json.tarkov.dev, the API tarkov.dev's own map page uses (its GraphQL API is down) ----
  // Names are translation keys ("<id> Name"); bosses, containers and weapons are id references.
  // Same conversion as download_data.py and tarkov.dev's src/features/maps/do-fetch-maps.mjs.
  const STRUCTURAL = new Set(["id", "normalizedName", "faction", "sides", "categories", "hazardType", "lockType",
    "switchType", "spawnKey", "zoneName", "mob", "lootContainer", "stationaryWeapon", "key", "item", "switch", "extract", "operation"]);

  function translateDeep(v, table, field) {
    if (typeof v === "string") return STRUCTURAL.has(field) ? v : (table[v] !== undefined ? table[v] : v);
    if (Array.isArray(v)) return v.map((x) => translateDeep(x, table, field));
    if (v && typeof v === "object") { const o = {}; for (const k in v) o[k] = translateDeep(v[k], table, k); return o; }
    return v;
  }
  const asList = (v) => (Array.isArray(v) ? v : v && typeof v === "object" ? Object.values(v) : []).filter((x) => x && typeof x === "object");
  function lookup(table, ref) {
    if (ref && typeof ref === "object") return ref;
    if (table && !Array.isArray(table) && typeof table === "object") return table[ref] || null;
    return asList(table).find((x) => x.id === ref) || null;
  }

  function convertMaps(base, table) {
    const data = translateDeep(base, table);
    const maps = asList(data.maps), mobs = data.mobs || {}, containers = data.lootContainers || {}, weapons = data.stationaryWeapons || {};
    const byId = {}; for (const m of maps) byId[m.id] = m;
    return maps.map((m0) => {
      const m = Object.assign({}, m0);
      m.bosses = asList(m.bosses).map((sp) => {
        const mob = lookup(mobs, sp.mob !== undefined ? sp.mob : sp.boss);
        if (!mob) return null;
        const escorts = asList(sp.escorts).map((e) => {
          const em = lookup(mobs, e.mob !== undefined ? e.mob : e.boss);
          return em ? { boss: { name: em.name }, amount: e.amount || [] } : null;
        }).filter(Boolean);
        return Object.assign({}, sp, { boss: { name: mob.name, normalizedName: mob.normalizedName }, escorts });
      }).filter(Boolean);
      const switches = {}; for (const sw of asList(m.switches)) switches[sw.id] = sw;
      m.extracts = asList(m.extracts).map((ex) => Object.assign({}, ex, {
        switches: (ex.switches || []).map((r) => lookup(switches, r)).filter(Boolean).map((sw) => ({ name: sw.name })),
      }));
      m.locks = asList(m.locks).map((lk) => typeof lk.key === "string"
        ? Object.assign({}, lk, { key: { id: lk.key, name: table[lk.key + " Name"], shortName: table[lk.key + " ShortName"] } })
        : lk);
      m.lootContainers = asList(m.lootContainers).map((lc) => {
        const c = lookup(containers, lc.lootContainer);
        return c ? { lootContainer: { name: c.name, normalizedName: c.normalizedName }, position: lc.position } : null;
      }).filter(Boolean);
      m.stationaryWeapons = asList(m.stationaryWeapons).map((sw) => {
        const w = lookup(weapons, sw.stationaryWeapon);
        return w ? { stationaryWeapon: { name: w.name, shortName: w.shortName }, position: sw.position } : null;
      }).filter(Boolean);
      m.transits = asList(m.transits).map((tr) => typeof tr.map === "string"
        ? Object.assign({}, tr, { map: byId[tr.map] ? { name: byId[tr.map].name, normalizedName: byId[tr.map].normalizedName } : null })
        : tr);
      delete m.lootLoose;
      return m;
    });
  }

  function buildData(base, tables, gameMode) {
    const out = { fetchedAt: new Date().toISOString(), gameMode, source: "browser", maps: {} };
    for (const lang of ["en", "ru"]) {
      const table = Object.assign({}, tables.en || {}, tables[lang] || {}); // fall back to English names
      out.maps[lang] = stripNulls(convertMaps(base, table));
    }
    return out;
  }

  async function getJson(path) {
    const res = await fetch(JSON_API + path, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(path + ": HTTP " + res.status);
    return res.json();
  }

  let fetching = false;
  async function fetchInBrowser() {
    if (fetching) return;
    fetching = true;
    const setMsg = (m) => { const el = $("fetchMsg"); if (el) el.textContent = m; };
    for (const b of document.querySelectorAll("[data-fetch]")) b.disabled = true;
    setMsg(t("fetching"));
    try {
      const gameMode = (DATA && DATA.gameMode) || "regular";
      let raw;
      try { raw = await getJson(gameMode + "/maps"); }
      catch (e) { throw new Error(e instanceof TypeError ? await diagnoseNetwork() : e.message); }
      if (!raw || !raw.data || !raw.data.maps) throw new Error(t("badFormat"));
      const tables = {};
      for (const lang of ["en", "ru"]) {
        setMsg(t("fetchingNames").replace("{lang}", lang.toUpperCase()));
        tables[lang] = Object.assign({}, (await getJson(gameMode + "/maps_" + lang)).data || {});
        try { Object.assign(tables[lang], (await getJson(gameMode + "/items_" + lang)).data || {}); }
        catch (e) { console.warn("Item names (" + lang + ") unavailable; key names will be missing.", e); }
      }
      DATA = buildData(raw.data, tables, gameMode);
      await idbSet(DATA);
      renderFooter();
      setMsg(t("fetchOk"));
      const cfg = state.cfg;
      state.cfg = null;
      await openMap(cfg);
    } catch (e) {
      console.error(e);
      setMsg(t("fetchFail").replace("{e}", e && e.message ? e.message : String(e)));
    } finally {
      fetching = false;
      for (const b of document.querySelectorAll("[data-fetch]")) b.disabled = false;
    }
  }

  // Tell "tarkov.dev is unreachable from this network" apart from "the browser blocked the request".
  async function diagnoseNetwork() {
    const probe = (url) => Promise.race([
      fetch(url, { mode: "no-cors", cache: "no-store" }).then(() => true, () => false),
      new Promise((r) => setTimeout(() => r(false), 8000)),
    ]);
    const [api, site] = await Promise.all([probe(JSON_API), probe("https://tarkov.dev/")]);
    if (!api && !site) return t("netDown");
    if (!api) return t("netApiDown");
    return t("netBlocked");
  }

  // Browser-downloaded data is kept in IndexedDB (localStorage is too small for it).
  function idb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open("tarkov-offline-maps", 1);
      req.onupgradeneeded = () => req.result.createObjectStore("kv");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function idbGet() {
    try {
      const db = await idb();
      return await new Promise((resolve) => {
        const r = db.transaction("kv").objectStore("kv").get("data");
        r.onsuccess = () => resolve(r.result || null);
        r.onerror = () => resolve(null);
      });
    } catch (e) { return null; }
  }
  async function idbSet(value) {
    try {
      const db = await idb();
      await new Promise((resolve) => {
        const tx = db.transaction("kv", "readwrite");
        tx.objectStore("kv").put(value, "data");
        tx.oncomplete = resolve; tx.onerror = resolve;
      });
    } catch (e) { /* not available: data still works until the page is closed */ }
  }

  function applyStaticText() {
    document.documentElement.lang = state.lang;
    for (const el of document.querySelectorAll("[data-i18n]")) el.textContent = t(el.dataset.i18n);
    for (const el of document.querySelectorAll("[data-i18n-placeholder]")) el.placeholder = t(el.dataset.i18nPlaceholder);
    for (const b of document.querySelectorAll(".lang button")) b.setAttribute("aria-pressed", String(b.dataset.lang === state.lang));
  }

  // ------------------------------------------------------------------ search
  function runSearch() {
    const q = $("search").value.trim().toLowerCase();
    const ol = $("results");
    ol.innerHTML = "";
    if (q.length < 2) return;
    const hits = state.markers.filter((r) => r.marker && r.search && r.search.includes(q)).slice(0, 40);
    if (!hits.length) { ol.innerHTML = '<li class="empty">' + esc(t("noResults")) + "</li>"; return; }
    for (const r of hits) {
      const li = document.createElement("li");
      const b = document.createElement("button");
      b.type = "button";
      b.innerHTML = (r.icon ? '<img src="icons/' + r.icon + '.png" alt="">' : "<span style='width:18px'></span>") + "<span>" + esc(r.label) + '</span><span class="kind">' + esc(t(r.cat)) + "</span>";
      b.addEventListener("click", () => {
        if (!state.visible[r.cat]) {
          state.visible[r.cat] = true;
          state.groups[r.cat].addTo(state.map);
          renderLayerList();
          saveSettings();
        }
        if (r.level !== state.level) { state.level = r.level; renderLevels(); renderBase(); }
        state.map.setView(r.marker.getLatLng(), Math.max(state.map.getZoom(), state.cfg.maxZoom - 2));
        if (r.marker.getPopup()) r.marker.openPopup();
        if (window.matchMedia("(max-width: 760px)").matches) setRail(false);
      });
      li.appendChild(b);
      ol.appendChild(li);
    }
  }

  // ------------------------------------------------------------------ routing & events
  function cfgFromHash() {
    const h = decodeURIComponent(location.hash.replace(/^#/, ""));
    return CONFIG.find((c) => c.slug === h || c.id === h) || CONFIG[0];
  }

  function route() {
    const cfg = cfgFromHash();
    if (cfg !== state.cfg) {
      openMap(cfg);
      renderMapList();
    }
  }

  function setRail(open) {
    $("rail").classList.toggle("collapsed", !open);
    $("railToggle").setAttribute("aria-expanded", String(open));
  }

  document.addEventListener("DOMContentLoaded", () => {
    applyStaticText();
    renderFooter();

    for (const b of document.querySelectorAll(".lang button")) {
      b.addEventListener("click", () => {
        if (state.lang === b.dataset.lang) return;
        state.lang = b.dataset.lang;
        saveSettings();
        applyStaticText();
        renderFooter();
        renderMapList();
        const cfg = state.cfg;
        state.cfg = null;
        openMap(cfg);
      });
    }
    for (const b of $("baseSeg").querySelectorAll("button")) {
      b.addEventListener("click", () => { state.base = b.dataset.base; saveSettings(); renderBase(); });
    }
    $("dimOther").checked = state.dimOther;
    $("dimOther").addEventListener("change", (e) => { state.dimOther = e.target.checked; saveSettings(); applyLevelDimming(); });
    $("search").addEventListener("input", runSearch);
    $("railToggle").addEventListener("click", () => setRail($("rail").classList.contains("collapsed")));
    if (window.matchMedia("(max-width: 760px)").matches) setRail(false);

    window.addEventListener("hashchange", route);
    Promise.race([idbGet(), new Promise((r) => setTimeout(() => r(null), 1500))]).then((saved) => {
      if (saved && saved.maps && (!DATA || String(saved.fetchedAt) > String(DATA.fetchedAt))) {
        DATA = saved;
        renderFooter();
      }
      route();
    });
  });
})();
