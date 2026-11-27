#!/usr/bin/env python3
"""
Saves Escape from Tarkov map data from tarkov.dev so the viewer works offline.

Sources (both free and open):
  - Marker data: tarkov.dev JSON API, https://json.tarkov.dev (the same files tarkov.dev's own
                 map page loads; their GraphQL API has been down since July 2026)
  - Map tiles:   https://assets.tarkov.dev/maps/...

Usage:
  python download_data.py                 marker data + tiles for the maps that need them
  python download_data.py --satellite     also satellite tiles for every map
  python download_data.py --max-zoom 5    sharper tiles when zoomed in (about 4x the download)
  python download_data.py --maps customs,woods --satellite   only some maps
  python download_data.py --data-only     marker data only, no tiles
  python download_data.py --pve           use PvE spawn/boss data instead of PvP
  python download_data.py --diagnose      test the connection and print what tarkov.dev answers

Only the Python standard library is used. Run it again any time to refresh;
tiles already on disk are skipped.
"""

import argparse
import concurrent.futures
import html
import json
import math
import os
import re
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.abspath(__file__))
JSON_API = "https://json.tarkov.dev/"
ASSET_PREFIX = "https://assets.tarkov.dev/maps/"
USER_AGENT = "tarkov-offline-maps/1.0 (personal offline viewer; python urllib)"
LANGS = ["en", "ru"]

# Maps with no bundled SVG need tiles to show anything at all.
TILE_ONLY_MAPS = {"icebreaker"}  # the only map still without a vector version

def log(msg):
    print(msg, flush=True)


def http(url, data=None, headers=None, retries=4):
    hdrs = {"User-Agent": USER_AGENT}
    if headers:
        hdrs.update(headers)
    delay = 2.0
    for attempt in range(retries + 1):
        req = urllib.request.Request(url, data=data, headers=hdrs)
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                return resp.status, resp.read()
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return 404, b""
            if e.code in (429, 500, 502, 503, 504) and attempt < retries:
                time.sleep(delay)
                delay *= 2
                continue
            raise
        except (urllib.error.URLError, TimeoutError):
            if attempt < retries:
                time.sleep(delay)
                delay *= 2
                continue
            raise
    return None, b""


def load_config():
    path = os.path.join(ROOT, "js", "config.js")
    text = open(path, encoding="utf-8").read()
    start = text.index("window.MAP_CONFIG = ") + len("window.MAP_CONFIG = ")
    return json.loads(text[start:].rstrip().rstrip(";"))


# ---------------------------------------------------------------- icons

ICON_SOURCE = "https://raw.githubusercontent.com/the-hideout/tarkov-dev/main/public/maps/interactive/"
ICONS = [
    "btr_stop", "extract_pmc", "extract_scav", "extract_shared", "extract_transit",
    "hazard", "hazard_mortar", "key", "keycard", "lock", "loose_loot", "quest_item", "quest_objective",
    "spawn_af", "spawn_black-div", "spawn_bloodhound", "spawn_boss", "spawn_cultist-priest",
    "spawn_pmc", "spawn_rogue", "spawn_scav", "spawn_sniper_scav", "stationarygun", "switch",
    "container_buried-barrel-cache", "container_cash-register", "container_crate", "container_dead-scav",
    "container_drawer", "container_duffle-bag", "container_festive-airdrop-supply-crate",
    "container_grenade-box", "container_ground-cache", "container_jacket", "container_medbag",
    "container_medcase", "container_pc-block", "container_plastic-suitcase", "container_safe",
    "container_toolbox", "container_weapon-box", "container_wooden-ammo-box", "container_wooden-crate",
]


def ensure_icons():
    """Marker icons ship in ./icons; fetch any that are missing (tarkov.dev, MIT licence)."""
    folder = os.path.join(ROOT, "icons")
    os.makedirs(folder, exist_ok=True)
    missing = [n for n in ICONS if not os.path.isfile(os.path.join(folder, n + ".png"))
               or os.path.getsize(os.path.join(folder, n + ".png")) == 0]
    if not missing:
        log(f"Marker icons: all {len(ICONS)} present in icons/")
        return
    log(f"Marker icons: {len(missing)} missing, downloading from tarkov.dev's GitHub ...")
    failed = []
    for name in missing:
        try:
            status, raw = http(ICON_SOURCE + name + ".png", retries=2)
            if status != 200 or not raw.startswith(b"\x89PNG"):
                raise ValueError(f"HTTP {status}")
            with open(os.path.join(folder, name + ".png"), "wb") as f:
                f.write(raw)
        except Exception as e:
            failed.append(f"{name} ({e})")
    if failed:
        log(f"  could not download {len(failed)} icons: {', '.join(failed[:5])}")
    else:
        log(f"  done, icons are in {folder}")


def check_project_files():
    needed = ["index.html", "js/app.js", "js/config.js", "css/app.css", "vendor/leaflet/leaflet.js"]
    gone = [n for n in needed if not os.path.isfile(os.path.join(ROOT, *n.split("/")))]
    if gone:
        log("Warning: these project files are missing, so the viewer won't work: " + ", ".join(gone))
        log("  Unzip the whole tarkov-offline-maps folder again and run this script from inside it.")


# ---------------------------------------------------------------- marker data

class NetworkError(Exception):
    pass


def describe_http_error(e):
    """Status plus whatever the server said, so the real reason is visible."""
    try:
        text = e.read().decode("utf-8", "replace")
    except Exception:
        text = ""
    text = re.sub(r"<[^>]+>", " ", text)          # strip HTML tags of error pages
    text = re.sub(r"\s+", " ", text).strip()[:300]
    server = e.headers.get("server", "") if e.headers else ""
    ray = e.headers.get("cf-ray", "") if e.headers else ""
    extra = ", ".join(x for x in (f"server: {server}" if server else "", f"cf-ray: {ray}" if ray else "") if x)
    return f"HTTP {e.code}" + (f" ({extra})" if extra else "") + (f". Server said: {text}" if text else ". Empty response body.")


def get_json(path):
    """GET one file from json.tarkov.dev and parse it."""
    url = JSON_API + path
    try:
        status, raw = http(url, headers={"Accept": "application/json"}, retries=3)
    except urllib.error.HTTPError as e:
        raise NetworkError(f"json.tarkov.dev/{path} answered with {describe_http_error(e)}")
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        reason = getattr(e, "reason", e)
        raise NetworkError(f"Could not reach json.tarkov.dev ({reason}). "
                           "Check your internet connection, VPN or firewall, then run the script again.")
    if status != 200:
        raise NetworkError(f"json.tarkov.dev/{path} answered with HTTP {status}")
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        raise NetworkError(f"json.tarkov.dev/{path} sent something that isn't JSON")


# ---------------------------------------------------------------- converting the JSON API format
# The JSON API stores names as translation keys (e.g. "<id> Name") and refers to bosses, loot
# containers and stationary weapons by id. This turns it into the shape the viewer reads,
# following tarkov.dev's own loader (src/features/maps/do-fetch-maps.mjs).

# Fields that hold codes, never display text; translation keys are not looked up in them.
STRUCTURAL = {"id", "normalizedName", "faction", "sides", "categories", "hazardType", "lockType",
              "switchType", "spawnKey", "zoneName", "mob", "lootContainer", "stationaryWeapon",
              "key", "item", "switch", "extract", "operation"}


def translate(value, table, field=None):
    if isinstance(value, str):
        return table.get(value, value) if field not in STRUCTURAL else value
    if isinstance(value, list):
        return [translate(v, table, field) for v in value]
    if isinstance(value, dict):
        return {k: translate(v, table, k) for k, v in value.items()}
    return value


def as_list(v):
    if isinstance(v, dict):
        return [x for x in v.values() if isinstance(x, dict)]
    return [x for x in (v or []) if isinstance(x, dict)]


def lookup(table, ref):
    """Resolve an id reference; pass objects through (in case the format already embeds them)."""
    if isinstance(ref, dict):
        return ref
    if isinstance(table, dict):
        return table.get(ref)
    return next((x for x in as_list(table) if x.get("id") == ref), None)


def convert_maps(base, table):
    """base: the 'data' object of <mode>/maps; table: translation key -> text for one language."""
    data = translate(base, table)
    maps = as_list(data.get("maps"))
    mobs = data.get("mobs") or {}
    containers = data.get("lootContainers") or {}
    weapons = data.get("stationaryWeapons") or {}
    by_id = {m.get("id"): m for m in maps}
    out = []
    for m in maps:
        m = dict(m)
        bosses = []
        for spawn in as_list(m.get("bosses")):
            spawn = dict(spawn)
            mob = lookup(mobs, spawn.get("mob", spawn.get("boss")))
            if not mob:
                continue
            spawn["boss"] = {"name": mob.get("name"), "normalizedName": mob.get("normalizedName")}
            escorts = []
            for e in as_list(spawn.get("escorts")):
                emob = lookup(mobs, e.get("mob", e.get("boss")))
                if emob:
                    escorts.append({"boss": {"name": emob.get("name")}, "amount": e.get("amount") or []})
            spawn["escorts"] = escorts
            bosses.append(spawn)
        m["bosses"] = bosses
        switches = {s.get("id"): s for s in as_list(m.get("switches"))}
        extracts = []
        for ex in as_list(m.get("extracts")):
            ex = dict(ex)
            ex["switches"] = [{"name": (lookup(switches, s) or {}).get("name")} for s in (ex.get("switches") or [])
                              if lookup(switches, s)]
            extracts.append(ex)
        m["extracts"] = extracts
        locks = []
        for lk in as_list(m.get("locks")):
            lk = dict(lk)
            key = lk.get("key")
            if isinstance(key, str):
                lk["key"] = {"id": key, "name": table.get(f"{key} Name"), "shortName": table.get(f"{key} ShortName")}
            locks.append(lk)
        m["locks"] = locks
        loot = []
        for lc in as_list(m.get("lootContainers")):
            c = lookup(containers, lc.get("lootContainer"))
            if c:
                loot.append({"lootContainer": {"name": c.get("name"), "normalizedName": c.get("normalizedName")},
                             "position": lc.get("position")})
        m["lootContainers"] = loot
        guns = []
        for sw in as_list(m.get("stationaryWeapons")):
            w = lookup(weapons, sw.get("stationaryWeapon"))
            if w:
                guns.append({"stationaryWeapon": {"name": w.get("name"), "shortName": w.get("shortName")},
                             "position": sw.get("position")})
        m["stationaryWeapons"] = guns
        transits = []
        for tr in as_list(m.get("transits")):
            tr = dict(tr)
            target = tr.get("map")
            if isinstance(target, str):
                t = by_id.get(target)
                tr["map"] = {"name": t.get("name"), "normalizedName": t.get("normalizedName")} if t else None
            transits.append(tr)
        m["transits"] = transits
        spots = []
        for ll in as_list(m.get("lootLoose")):
            names = []
            for i in ll.get("items") or []:
                n = table.get(f"{i} Name") if isinstance(i, str) else None
                if n and n not in names:
                    names.append(n)
            if ll.get("position") and names:
                spots.append({"position": ll["position"], "items": names})
        m["lootLoose"] = spots
        out.append(m)
    return out


# ---------------------------------------------------------------- quest items
# Quest data comes from <mode>/tasks (+ tasks_en / tasks_ru for text). For every map we keep:
#   find  - spots where a quest item can be picked up (findQuestItem objectives)
#   plant - zones where an item has to be left (plantQuestItem / plantItem objectives)
# Each marker links to tarkov.help: the item's page when it has one (ordinary items do, quest
# items don't), otherwise tarkov.help's quest map.

HELP_SITE = "https://tarkov.help/"
RU_TO_LAT = {"а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "e", "ж": "zh", "з": "z",
             "и": "i", "й": "y", "к": "k", "л": "l", "м": "m", "н": "n", "о": "o", "п": "p", "р": "r",
             "с": "s", "т": "t", "у": "u", "ф": "f", "х": "h", "ц": "ts", "ч": "ch", "ш": "sh",
             "щ": "shch", "ъ": "", "ы": "y", "ь": "", "э": "e", "ю": "yu", "я": "ya"}


def help_slug(name, lang):
    s = (name or "").lower()
    if lang == "ru":
        s = "".join(RU_TO_LAT.get(c, c) for c in s)
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


_help_cache = {}


def help_item_url(lang, name):
    """tarkov.help item page for this name, or None if the site has no such page."""
    slug = help_slug(name, lang)
    if not slug:
        return None
    url = f"{HELP_SITE}{lang}/item/{slug}"
    if url not in _help_cache:
        req = urllib.request.Request(url, method="HEAD", headers={"User-Agent": USER_AGENT})
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                _help_cache[url] = url if resp.status == 200 else None
        except Exception:
            _help_cache[url] = None
        time.sleep(0.1)
    return _help_cache[url]


HELP_QUESTS_CACHE = os.path.join(ROOT, "data", "tarkov-help-quests.json")


def norm_name(s):
    return re.sub(r"[^a-z0-9а-яё]+", "", html.unescape(s or "").lower())


def help_quest_links():
    """{normalized English quest name: {"en": url, "ru": url}} for quests that have a tarkov.help page.

    tarkov.help's quest URLs don't follow the quest name (e.g. "Saving the Mole" is /quest/rescue-the-mole),
    so the pages listed in its sitemap are read once: the title gives the quest name and the page links its
    Russian twin. Results are cached in data/tarkov-help-quests.json; only new pages are fetched later.
    """
    try:
        cache = json.load(open(HELP_QUESTS_CACHE, encoding="utf-8"))
    except (OSError, ValueError):
        cache = {}
    try:
        status, raw = http(HELP_SITE + "sitemaps/sitemap-en.xml", retries=2)
        slugs = sorted(set(re.findall(r"/en/quest/([^<\"\s]+)", raw.decode("utf-8", "replace")))) if status == 200 else []
    except Exception as e:
        log(f"  tarkov.help quest list unavailable ({e}); using cached links only")
        slugs = []
    todo = [s for s in slugs if s not in cache]
    if todo:
        log(f"  reading {len(todo)} tarkov.help quest pages to match them to quests (one-time, a minute or two) ...")

        def read(slug):
            try:
                status, page = http(f"{HELP_SITE}en/quest/{slug}", retries=2)
                time.sleep(0.1)
                if status != 200:
                    return slug, None
                text = page.decode("utf-8", "replace")
                title = re.search(r"<title>(.*?)</title>", text, re.S)
                ru = re.search(r'hrefLang="ru"\s+href="https://tarkov\.help/ru/quest/([^"]+)"', text)
                name = re.split(r"\s+[–—-]\s+Quest Guide", html.unescape(title.group(1)))[0] if title else ""
                return slug, {"name": name, "ru": ru.group(1) if ru else None}
            except Exception:
                return None, None

        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
            for slug, info in pool.map(read, todo):
                if slug and info and info["name"]:
                    cache[slug] = info
        with open(HELP_QUESTS_CACHE, "w", encoding="utf-8") as f:
            json.dump(cache, f, ensure_ascii=False, indent=0, sort_keys=True)
    out = {}
    for slug, info in cache.items():
        links = {"en": f"{HELP_SITE}en/quest/{slug}"}
        if info.get("ru"):
            links["ru"] = f"{HELP_SITE}ru/quest/{info['ru']}"
        out.setdefault(norm_name(info["name"]), links)
    return out


def convert_quests(tasks, table, lang, links=None, en_table=None):
    """Return {map id: [quest markers]} for one language. table: translation key -> text."""
    out = {}
    links = links or {}
    en_table = en_table or table
    pos = lambda p: {"x": p["x"], "y": p.get("y"), "z": p["z"]} if isinstance(p, dict) and "x" in p and "z" in p else None
    for task in as_list(tasks):
        quest = table.get(task.get("name"), task.get("name")) or ""
        en_name = en_table.get(task.get("name"), "")
        wiki = task.get("wikiLink") or None
        if lang == "ru" and quest:  # Russian wiki: same page title as the Russian quest name
            wiki = "https://escapefromtarkov.fandom.com/ru/wiki/" + urllib.parse.quote(quest.replace(" ", "_"), safe="()!,:'-_.")
        base = {"quest": quest, "wiki": wiki,
                "helpQuest": (links.get(norm_name(en_name)) or {}).get(lang),
                "devQuest": f"https://tarkov.dev/task/{task['normalizedName']}" if task.get("normalizedName") else None}
        for obj in as_list(task.get("objectives")):
            kind = obj.get("type")
            desc = table.get(obj.get("description"), "") or ""
            common = dict(base, desc=desc, count=obj.get("count") or 1, optional=bool(obj.get("optional")))
            if kind == "findQuestItem":
                item = table.get(f"{obj.get('questItem')} Name", "")
                for loc in as_list(obj.get("possibleLocations")):
                    pts = [p for p in (pos(x) for x in (loc.get("positions") or [])) if p]
                    if pts:
                        out.setdefault(loc.get("map"), []).append(dict(common, kind="find", item=item, points=pts))
            elif kind in ("plantQuestItem", "plantItem"):
                if kind == "plantQuestItem":
                    names = [table.get(f"{obj.get('questItem')} Name", "")]
                    help_url = None
                else:
                    names = [table.get(f"{i} Name", "") for i in (obj.get("items") or [])]
                    help_url = help_item_url(lang, names[0]) if len(names) == 1 else None
                names = [n for n in names if n]
                item = names[0] if len(names) == 1 else ""
                for zone in as_list(obj.get("zones")):
                    p = pos(zone.get("position"))
                    if p:
                        z = {"position": p, "top": zone.get("top"), "bottom": zone.get("bottom"),
                             "outline": [q for q in (pos(o) for o in (zone.get("outline") or [])) if q]}
                        out.setdefault(zone.get("map"), []).append(dict(common, kind="plant", item=item, zone=z, helpItem=help_url))
    return out


def fetch_quest_markers(game_mode, tables):
    """Per language: {map id: [markers]}. Quest data is a bonus; failures only cost the quest layer."""
    try:
        raw = get_json(f"{game_mode}/tasks")
        base = raw.get("data") if isinstance(raw, dict) else None
        tasks = (base or {}).get("tasks")
        if not tasks:
            raise NetworkError("no 'tasks' in the data")
        task_names = {}
        for lang in LANGS:
            try:
                part = get_json(f"{game_mode}/tasks_{lang}")
                task_names[lang] = (part.get("data") or {}) if isinstance(part, dict) else {}
            except NetworkError as e:
                log(f"  quest names ({lang}) not available: {e}")
                task_names[lang] = {}
        quest_links = help_quest_links()
        en_table = {**tables["en"], **task_names["en"]}
        result = {}
        for lang in LANGS:
            # untranslated keys fall back to English
            table = {**tables["en"], **task_names["en"], **tables[lang], **task_names[lang]}
            result[lang] = convert_quests(tasks, table, lang, quest_links, en_table)
        markers = [m for v in result["ru"].values() for m in v]
        log(f"  quests: {len(markers)} markers, {sum(1 for m in markers if m.get('helpQuest'))} with a tarkov.help "
            f"quest page, {sum(1 for m in markers if m.get('helpItem'))} with an item page")
        return result
    except NetworkError as e:
        log(f"  quest data skipped: {e}")
        return {}


def fetch_marker_data(game_mode):
    log(f"Downloading map data from json.tarkov.dev ({game_mode}) ...")
    raw = get_json(f"{game_mode}/maps")
    base = raw.get("data") if isinstance(raw, dict) else None
    if not isinstance(base, dict) or not base.get("maps"):
        keys = ", ".join(list(raw)[:8]) if isinstance(raw, dict) else type(raw).__name__
        raise NetworkError(f"json.tarkov.dev/{game_mode}/maps has an unexpected format (top-level: {keys}). "
                           "Run with --diagnose and send me the output.")
    log(f"  {len(as_list(base.get('maps')))} maps")
    tables = {}
    for lang in LANGS:
        table = {}
        for name, required in (("maps", True), ("items", False)):
            try:
                part = get_json(f"{game_mode}/{name}_{lang}")
                table.update((part.get("data") or {}) if isinstance(part, dict) else {})
                log(f"  {name} names ({lang}): ok")
            except NetworkError as e:
                if required:
                    raise
                log(f"  {name} names ({lang}) not available, key names will be missing: {e}")
        tables[lang] = table
    # untranslated keys fall back to English, like tarkov.dev does
    out = {
        "fetchedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "gameMode": game_mode,
        "source": JSON_API,
        "maps": {lang: strip_nulls(convert_maps(base, {**tables["en"], **tables[lang]})) for lang in LANGS},
    }
    quests = fetch_quest_markers(game_mode, tables)
    for lang, maps in out["maps"].items():
        for m in maps:
            m["questMarkers"] = quests.get(lang, {}).get(m.get("id"), [])
    return out


def strip_nulls(value):
    """The API can return partial data with null list entries; drop them."""
    if isinstance(value, list):
        return [strip_nulls(v) for v in value if v is not None]
    if isinstance(value, dict):
        return {k: strip_nulls(v) for k, v in value.items()}
    return value


def summarize(data, config):
    maps = {m.get("normalizedName"): m for m in data["maps"].get("en", [])}
    log("Markers per map:")
    for cfg in config:
        m = maps.get(cfg["id"])
        if not m:
            log(f"  {cfg['name']['en']:<18} no data from the API")
            continue
        parts = [f"{len(m.get(k) or [])} {label}" for k, label in
                 (("extracts", "extracts"), ("spawns", "spawns"), ("locks", "locks"), ("lootContainers", "containers"),
                  ("questMarkers", "quest markers"))]
        log(f"  {cfg['name']['en']:<18} " + ", ".join(parts))


def write_marker_data(data):
    os.makedirs(os.path.join(ROOT, "data"), exist_ok=True)
    path = os.path.join(ROOT, "data", "tarkov-data.js")
    with open(path, "w", encoding="utf-8") as f:
        f.write("// Generated by download_data.py from the tarkov.dev API. Do not edit by hand.\n")
        f.write("window.TARKOV_DATA = ")
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";\n")
    log(f"Saved marker data to {os.path.relpath(path, ROOT)} ({os.path.getsize(path) // 1024} KB)")


def diagnose():
    """Fetch each JSON file and describe what came back, so format problems are easy to spot."""
    log(f"Python {sys.version.split()[0]}")
    for path in ("regular/maps", "regular/maps_en", "regular/maps_ru", "regular/items_ru"):
        req = urllib.request.Request(JSON_API + path, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                raw = resp.read()
            data = json.loads(raw)
            summary = f"HTTP 200, {len(raw) // 1024} KB"
            if isinstance(data, dict):
                summary += f", top-level keys: {', '.join(list(data)[:6])}"
                inner = data.get("data")
                if isinstance(inner, dict):
                    summary += f"; data keys: {', '.join(list(inner)[:8])}"
                    maps = as_list(inner.get("maps"))
                    if maps:
                        m = maps[0]
                        summary += f"; first map: {m.get('normalizedName')!r}, name {m.get('name')!r}, fields: {', '.join(list(m)[:30])}"
                        for field in ("extracts", "bosses", "locks", "lootContainers", "transits"):
                            items = as_list(m.get(field))
                            if items:
                                summary += f"\n      {field}[0]: {json.dumps(items[0], ensure_ascii=False)[:220]}"
                    elif inner:
                        k = next(iter(inner))
                        summary += f"; example: {k!r} -> {str(inner[k])[:60]!r}"
                if data.get("translations"):
                    summary += f"\n      translations: {json.dumps(data['translations'][:4])[:220]}"
        except urllib.error.HTTPError as e:
            summary = describe_http_error(e)
        except Exception as e:
            summary = f"failed: {e}"
        log(f"- {path}\n    {summary}")
    log("\nCopy everything above and send it.")


# ---------------------------------------------------------------- tiles

def project(cfg, lat, lng, zoom):
    """Same maths as tarkov.dev's Leaflet CRS: rotate, then affine transform, then 2^zoom."""
    rot = math.radians(cfg.get("coordinateRotation") or 0)
    x, y = lng, lat
    rx = x * math.cos(rot) - y * math.sin(rot)
    ry = x * math.sin(rot) + y * math.cos(rot)
    a, b, c, d = cfg["transform"][0], cfg["transform"][1], -cfg["transform"][2], cfg["transform"][3]
    scale = 2 ** zoom
    return scale * (a * rx + b), scale * (c * ry + d)


def tile_range(cfg, zoom, tile_size):
    (x1, z1), (x2, z2) = cfg["bounds"]
    corners = [(z1, x1), (z2, x2), (z1, x2), (z2, x1)]  # (lat, lng)
    pts = [project(cfg, lat, lng, zoom) for lat, lng in corners]
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    tx0, tx1 = math.floor(min(xs) / tile_size), math.floor((max(xs) - 1e-9) / tile_size)
    ty0, ty1 = math.floor(min(ys) / tile_size), math.floor((max(ys) - 1e-9) / tile_size)
    return tx0, tx1, ty0, ty1


def tileset_key(template):
    # "https://assets.tarkov.dev/maps/customs_0.16/main/{z}/{x}/{y}.png" -> "customs_0.16/main"
    if not template.startswith(ASSET_PREFIX):
        raise ValueError(f"unexpected tile URL: {template}")
    return re.sub(r"/\{z\}/\{x\}/\{y\}\.png$", "", template[len(ASSET_PREFIX):])


def plan_tiles(config, satellite, max_zoom, only=None):
    jobs = []
    sets = {}
    for cfg in config:
        if only and cfg["id"] not in only and cfg["slug"] not in only:
            continue
        has_vector = bool(cfg.get("svg"))
        templates = []
        # base imagery: only for maps without a vector map, or when satellite imagery is wanted
        if cfg.get("tilePath") and (satellite or not has_vector):
            templates.append(cfg["tilePath"])
        # floors: always for floors that have no vector version (e.g. Reserve 2nd-5th, Customs 4th)
        for l in cfg.get("layers", []):
            if l.get("tilePath") and (satellite or not has_vector or not l.get("svgLayer")):
                templates.append(l["tilePath"])
        if not templates:
            continue
        tile_size = cfg.get("tileSize") or 256
        top = min(cfg["maxZoom"], max_zoom)
        for tpl in dict.fromkeys(templates):  # same tiles can be both base and a level
            key = tileset_key(tpl)
            if key in sets:
                continue
            count = 0
            for z in range(cfg["minZoom"], top + 1):
                tx0, tx1, ty0, ty1 = tile_range(cfg, z, tile_size)
                for tx in range(tx0, tx1 + 1):
                    for ty in range(ty0, ty1 + 1):
                        if tx < 0 or ty < 0:
                            continue
                        jobs.append((key, z, tx, ty))
                        count += 1
            sets[key] = {"map": cfg["id"], "minZoom": cfg["minZoom"], "maxZoom": top, "planned": count}
    return jobs, sets


MISSING_PATH = os.path.join(ROOT, "tiles", ".missing.json")


def load_missing():
    try:
        return set(json.load(open(MISSING_PATH)))
    except (OSError, ValueError):
        return set()


def download_tiles(jobs, workers, pause, missing):
    lock = threading.Lock()
    stats = {"new": 0, "skipped": 0, "missing": 0, "failed": 0, "bytes": 0}
    done = [0]
    total = len(jobs)

    def work(job):
        key, z, x, y = job
        rel = f"{key}/{z}/{x}/{y}.png"
        dest = os.path.join(ROOT, "tiles", *rel.split("/"))
        if os.path.exists(dest) and os.path.getsize(dest) > 0:
            result = ("skipped", 0)
        else:
            try:
                status, raw = http(ASSET_PREFIX + rel)
                if status == 404:
                    result = ("missing", 0)
                    with lock:
                        missing.add(rel)
                else:
                    os.makedirs(os.path.dirname(dest), exist_ok=True)
                    tmp = dest + ".part"
                    with open(tmp, "wb") as f:
                        f.write(raw)
                    os.replace(tmp, dest)
                    result = ("new", len(raw))
                time.sleep(pause)
            except Exception as e:  # keep going; a rerun retries failures
                result = ("failed", 0)
                with lock:
                    log(f"  failed {rel}: {e}")
        with lock:
            stats[result[0]] += 1
            stats["bytes"] += result[1]
            done[0] += 1
            if done[0] % 200 == 0 or done[0] == total:
                mb = stats["bytes"] / 1e6
                log(f"  {done[0]}/{total} tiles  (new {stats['new']}, already had {stats['skipped']}, "
                    f"not on server {stats['missing']}, {mb:.0f} MB downloaded)")

    pool = concurrent.futures.ThreadPoolExecutor(max_workers=workers)
    try:
        futures = [pool.submit(work, job) for job in jobs]
        for f in concurrent.futures.as_completed(futures):
            f.result()
        pool.shutdown(wait=True)
    except KeyboardInterrupt:
        # Drop queued tiles; only the few already in progress finish (they write via .part files).
        pool.shutdown(wait=False, cancel_futures=True)
        raise
    finally:
        with open(MISSING_PATH, "w") as f:
            json.dump(sorted(missing), f)
    return stats


def write_manifest(sets):
    present = {}
    for key, info in sets.items():
        base = os.path.join(ROOT, "tiles", *key.split("/"))
        if not os.path.isdir(base):
            continue
        zooms = sorted(int(z) for z in os.listdir(base) if z.isdigit())
        if zooms:
            present[key] = {"map": info["map"], "minZoom": zooms[0], "maxZoom": zooms[-1]}
    # Keep entries from earlier runs that are still on disk.
    path = os.path.join(ROOT, "data", "tiles-manifest.js")
    if os.path.exists(path):
        try:
            text = open(path, encoding="utf-8").read()
            old = json.loads(text[text.index("=") + 1:].strip().rstrip(";"))
            for key, info in old.items():
                if key not in present and os.path.isdir(os.path.join(ROOT, "tiles", *key.split("/"))):
                    present[key] = info
        except (ValueError, json.JSONDecodeError):
            pass
    with open(path, "w", encoding="utf-8") as f:
        f.write("// Generated by download_data.py: tile sets saved in ./tiles\nwindow.TILES_MANIFEST = ")
        json.dump(present, f, indent=1)
        f.write(";\n")
    log(f"Saved tile manifest ({len(present)} tile sets on disk)")


# ---------------------------------------------------------------- main

def main():
    p = argparse.ArgumentParser(description="Save tarkov.dev map data for offline use.")
    p.add_argument("--satellite", action="store_true", help="also download satellite tiles for maps that have an SVG")
    p.add_argument("--max-zoom", type=int, default=4, help="highest zoom level to save (default 4; maps go up to 6)")
    p.add_argument("--maps", default="", help="comma-separated map ids or slugs, e.g. customs,woods or tamozhnya,les")
    p.add_argument("--data-only", action="store_true", help="only refresh marker data, skip tiles")
    p.add_argument("--tiles-only", action="store_true", help="only download tiles, keep existing marker data")
    p.add_argument("--pve", action="store_true", help="use PvE game mode data")
    p.add_argument("--workers", type=int, default=3, help="parallel downloads (default 3, max 6)")
    p.add_argument("--yes", "-y", action="store_true", help="don't ask before downloading tiles")
    p.add_argument("--diagnose", action="store_true", help="test the connection to the tarkov.dev API and print the answers")
    args = p.parse_args()
    args.workers = max(1, min(args.workers, 6))

    if args.diagnose:
        diagnose()
        return
    check_project_files()
    config = load_config()
    ensure_icons()

    if not args.tiles_only:
        try:
            data = fetch_marker_data("pve" if args.pve else "regular")
        except NetworkError as e:
            sys.exit(f"Error: {e}\nNothing was changed; your existing data is still there.")
        write_marker_data(data)
        summarize(data, config)
        known = {c["id"] for c in config} | {a for c in config for a in c.get("altMaps", [])}
        api_names = {m.get("normalizedName") for m in data["maps"]["en"]}
        extra = sorted(api_names - known)
        if extra:
            log(f"  note: API maps without a viewer entry (variants, skipped): {', '.join(extra)}")

    if args.data_only:
        log("Done. Open index.html in your browser.")
        return

    only = {m.strip() for m in args.maps.split(",") if m.strip()} or None
    jobs, sets = plan_tiles(config, args.satellite, args.max_zoom, only)
    os.makedirs(os.path.join(ROOT, "tiles"), exist_ok=True)
    missing = load_missing()

    def needed(j):
        rel = f"{j[0]}/{j[1]}/{j[2]}/{j[3]}.png"
        return rel not in missing and not os.path.exists(os.path.join(ROOT, "tiles", *rel.split("/")))

    todo = [j for j in jobs if needed(j)]
    log("")
    log(f"Tiles: {len(jobs)} planned, {len(todo)} still to fetch (zoom up to {args.max_zoom}). Per map:")
    per_map = {}
    for j in todo:
        per_map[sets[j[0]]["map"]] = per_map.get(sets[j[0]]["map"], 0) + 1
    for name, n in sorted(per_map.items(), key=lambda kv: -kv[1]):
        log(f"  {name:<18} {n:>6} tiles")
    log(f"Rough size: up to {len(todo) * 35 / 1000:.0f} MB (tiles outside the map image are skipped quickly).")
    if not args.satellite:
        log("  Included: Icebreaker (no vector map) and floors that exist only as images (Reserve 2nd-5th, Customs 4th).")
        log("  Add --satellite for satellite imagery on every map.")
    if todo and not args.yes:
        if input("Download them now? [y/N] ").strip().lower() not in ("y", "yes", "д", "да"):
            write_manifest(sets)
            log("Skipped tiles. Done.")
            return
    if todo:
        stats = download_tiles(todo, args.workers, pause=0.05, missing=missing)
        if stats["failed"]:
            log(f"{stats['failed']} tiles failed. Run the script again to retry them.")
    write_manifest(sets)
    log("Done. Open index.html in your browser.")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit("\nStopped. Run the script again to resume; finished tiles are kept.")
