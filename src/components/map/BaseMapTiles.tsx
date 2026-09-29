import { TileLayer } from "react-leaflet";
import { BASE_MAPS, BaseMapId } from "../../lib/baseMaps";

/** The chosen base map's tiles, with its labels layer on top when it has one; each with its provider's credit. */
export default function BaseMapTiles({ base }: { base: BaseMapId }) {
  const map = BASE_MAPS[base];
  return (
    <>
      {/* A new key per map: Leaflet swaps the tiles instead of mixing two providers */}
      <TileLayer
        key={map.id}
        url={map.url}
        attribution={map.attribution}
        subdomains={map.subdomains ?? "abc"}
        maxZoom={20}
        maxNativeZoom={map.maxNativeZoom ?? 19}
      />
      {map.labels && (
        <TileLayer
          key={`${map.id}-labels`}
          url={map.labels.url}
          attribution={map.labels.attribution}
          maxZoom={20}
          maxNativeZoom={map.labels.maxNativeZoom ?? 19}
          zIndex={2}
        />
      )}
    </>
  );
}
