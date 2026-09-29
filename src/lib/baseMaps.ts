/**
 * The base maps: all free, no keys. Each carries the attribution its provider asks for, shown in the map's
 * credits corner. CARTO's are free for light use; Esri's imagery comes with a labels layer on top.
 */

export type BaseMapId = "osm" | "positron" | "dark" | "satellite";

interface Tiles {
  url: string;
  attribution: string;
  subdomains?: string;
  maxNativeZoom?: number;
}

export interface BaseMap extends Tiles {
  id: BaseMapId;
  name: string;
  hint: string;
  dark: boolean; // a dark map: what night mode shows
  labels?: Tiles; // drawn over the tiles (place names on the satellite imagery)
  swatch: string; // the colour of its button in the menu
}

const OSM = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const CARTO = `${OSM} &copy; <a href="https://carto.com/attributions">CARTO</a>`;
const ESRI = "Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community";

export const BASE_MAPS: Record<BaseMapId, BaseMap> = {
  osm: {
    id: "osm",
    name: "OpenStreetMap",
    hint: "Streets, the standard map",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: OSM,
    dark: false,
    swatch: "linear-gradient(135deg, #f2efe9 50%, #aad3df 50%)",
  },
  positron: {
    id: "positron",
    name: "Light",
    hint: "CARTO Positron: pale, quiet streets",
    url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    subdomains: "abcd",
    attribution: CARTO,
    dark: false,
    swatch: "linear-gradient(135deg, #fafaf8 50%, #d4dadc 50%)",
  },
  dark: {
    id: "dark",
    name: "Dark",
    hint: "CARTO Dark Matter: the night map",
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    subdomains: "abcd",
    attribution: CARTO,
    dark: true,
    swatch: "linear-gradient(135deg, #2c2c2c 50%, #111 50%)",
  },
  satellite: {
    id: "satellite",
    name: "Satellite",
    hint: "Esri World Imagery, with place names",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: ESRI,
    maxNativeZoom: 18,
    dark: true,
    labels: {
      url: "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
      attribution: "Labels &copy; Esri",
      maxNativeZoom: 18,
    },
    swatch: "linear-gradient(135deg, #3d5a3a 40%, #7a6a4f 40% 70%, #2f4b5e 70%)",
  },
};

export const BASE_MAP_ORDER: BaseMapId[] = ["osm", "positron", "dark", "satellite"];

const isId = (v: unknown): v is BaseMapId => typeof v === "string" && v in BASE_MAPS;

export interface BaseMapChoice {
  base: BaseMapId; // what's showing
  day: BaseMapId; // the light map the night button switches back to
}

/** What was saved, or the dark map (the app has always opened in night mode) with OpenStreetMap for the day. */
export function toBaseMapChoice(saved: { base?: unknown; day?: unknown }): BaseMapChoice {
  const day = isId(saved.day) && !BASE_MAPS[saved.day].dark ? saved.day : "osm";
  return { base: isId(saved.base) ? saved.base : "dark", day };
}

/** Choosing a map: a light one is also remembered as the day map. */
export const chooseBaseMap = (choice: BaseMapChoice, base: BaseMapId): BaseMapChoice => ({
  base,
  day: BASE_MAPS[base].dark ? choice.day : base,
});

/** The night button: to the dark map, or back to the last light one. Satellite counts as a day map here. */
export const toggleNight = (choice: BaseMapChoice): BaseMapChoice =>
  choice.base === "dark" ? { ...choice, base: choice.day } : { ...choice, base: "dark" };
