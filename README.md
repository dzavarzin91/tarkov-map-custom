# Карты Таркова — офлайн / Tarkov maps offline

A local, offline map viewer for Escape from Tarkov. Everything runs from this folder; nothing is hosted.

## Quick start

1. Unzip the folder anywhere.
2. Open a terminal in the folder and run:
   ```
   python download_data.py
   ```
   It downloads marker data (extracts, spawns, bosses, keys, containers…) in English and Russian from json.tarkov.dev, the free data files tarkov.dev's own map uses. (tarkov.dev's GraphQL API at api.tarkov.dev has been down since July 2026, so this project doesn't use it.) It then asks before downloading the images for floors that have no vector version (Reserve, Customs 4th floor) and for Icebreaker.
3. Open `index.html` in your browser.

The 10 vector maps work even before step 2; they just have no markers yet.

**No Python, or the script fails?** Open `index.html` and click **Download markers in the browser** (Скачать метки в браузере) at the bottom of the panel. The viewer fetches the same data from tarkov.dev directly and keeps it in the browser.

**The button fails too?** Open "If the button doesn't work: load manually" (Если кнопка не работает) under the button. It gives you three links (maps, maps_ru, maps_en) that open tarkov.dev's data files in normal tabs; save each one (Ctrl+S) and then select all three files in the viewer. Opening a link in a tab isn't subject to the browser rules that block the button.

**No markers on the map?** Look at the line at the bottom of the panel. It says how many markers this map has, whether the data file was found, and how many damaged entries were skipped.

## Options

| Command | What it does |
|---|---|
| `python download_data.py --data-only` | Refresh markers only (after a game patch) |
| `python download_data.py --satellite` | Also save satellite imagery for every map |
| `python download_data.py --max-zoom 5` | Sharper tiles when zoomed in (about 4x the download; default is 4) |
| `python download_data.py --maps customs,woods --satellite` | Only some maps (ids or slugs like `tamozhnya`) |
| `python download_data.py --pve` | PvE spawn and boss data instead of PvP |
| `python download_data.py -y` | Don't ask before downloading tiles |
| `python download_data.py --diagnose` | Check what json.tarkov.dev answers (send me the output if something fails) |

Tiles already on disk are skipped, so you can stop with Ctrl+C and rerun to resume. Downloads are slow on purpose (3 at a time with a short pause) to be polite to tarkov.dev's servers.

## Floors that exist only as images

Some floors have no vector version anywhere: Reserve's 2nd to 5th floors and Customs' 4th floor. tarkov.dev draws them from images, so `download_data.py` saves those images by default (about 1,200 small files for Reserve). Until they're downloaded, those floors show as greyed-out buttons. To fetch just one map's floors: `python download_data.py --maps rezerv`. Icebreaker is the one map with no vector version at all, so its images are downloaded too.

## Using the viewer

- Pick a map in the panel or open a direct link like `index.html#ulici`, `#tamozhnya`, `#les`.
- Toggle marker types under "Метки / Markers"; click a marker for details.
- On multi-floor maps, choose a floor. Markers on other floors are dimmed.
- Search finds extracts, keys, bosses and containers and jumps to them.
- RU/EN switch is at the top; your settings are remembered.

## Folder layout

```
index.html           the viewer
download_data.py     fetches data/tiles from tarkov.dev (Python 3, standard library only)
js/config.js         map geometry and labels (from tarkov.dev)
js/svg/              vector maps
icons/               marker icons
data/                created by download_data.py
tiles/               created by download_data.py
vendor/              Leaflet and fonts
LICENSES/            licence texts
```

## Credits and licences

- Map geometry, marker icons, data API: [tarkov.dev](https://tarkov.dev) / [the-hideout](https://github.com/the-hideout), MIT licence.
- Vector maps: Shebuka and contributors, [tarkov-dev-svg-maps](https://github.com/the-hideout/tarkov-dev-svg-maps), CC BY-NC-SA 4.0. Non-commercial use only, and they may not be used in cheats, radars or ESP overlays.
- The Lab: `Labs.svg` from the same set; tarkov.dev doesn't use it, so its placement comes from [TarkovTracker's tarkovdata](https://github.com/TarkovTracker/tarkovdata) (`maps.json`), checked against tarkov.dev's room labels.
- The Labyrinth: `js/svg/Labyrinth.js` was traced for this project from the [re3mr](https://re3mr.com) Labyrinth map as cropped and aligned to game coordinates by [eft-gps](https://github.com/toto12g/eft-gps) (both CC BY-NC-SA 4.0). The traced map is CC BY-NC-SA 4.0 as well.
- [Leaflet](https://leafletjs.com) 1.9.4, BSD-2-Clause.
- PT Sans and PT Sans Narrow by ParaType, SIL Open Font License.
- Escape from Tarkov and its content belong to Battlestate Games. This project is not affiliated with Battlestate Games, tarkov.dev or tarkov.help.

This setup is meant for personal, non-commercial use. If you share it, keep the credits and licence files.
