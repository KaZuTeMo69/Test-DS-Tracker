import { useCallback, useEffect, useRef, useState } from "react";
import { LayerKind, PolygonRings, Zone, ZoneLayer } from "../types";
import { parseKmlBytes } from "../lib/kml";
import { clearLayers, deleteLayer, loadLayers, saveLayer } from "../lib/layerStore";
import { DEFAULT_OPACITY, LAYER_KIND_LABEL, looksLikeWhiteSpace, newId, nextLayerColor } from "../lib/layers";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * The map layers (coverage zones and white space) and the changes made to them. Every change is saved to the
 * browser's database; `notify` shows a short message to the user.
 */
export function useLayers(notify: (msg: string) => void) {
  const [layers, setLayers] = useState<ZoneLayer[]>([]);
  // False when this browser can't save layers (they then last until the page is closed)
  const [canSave, setCanSave] = useState(true);
  const warnedRef = useRef(false);
  // Typing in a name or description changes a layer on every key, so saving waits for a pause
  const saveTimers = useRef(new Map<string, number>());
  const pending = useRef(new Map<string, ZoneLayer>());

  const saveFailed = useCallback(() => {
    setCanSave(false);
    if (!warnedRef.current) notify("Map layers can't be saved in this browser. They'll be lost when the page closes");
    warnedRef.current = true;
  }, [notify]);

  const flush = useCallback(
    (id: string) => {
      window.clearTimeout(saveTimers.current.get(id));
      saveTimers.current.delete(id);
      const layer = pending.current.get(id);
      pending.current.delete(id);
      if (layer) saveLayer(layer).catch(saveFailed);
    },
    [saveFailed],
  );

  const save = useCallback(
    (layer: ZoneLayer, delay = 0) => {
      pending.current.set(layer.id, layer);
      window.clearTimeout(saveTimers.current.get(layer.id));
      saveTimers.current.set(
        layer.id,
        window.setTimeout(() => flush(layer.id), delay),
      );
    },
    [flush],
  );

  // A change still waiting to be saved is saved at once if the page is hidden or closed
  useEffect(() => {
    const flushAll = () => [...pending.current.keys()].forEach(flush);
    const onHide = () => document.visibilityState === "hidden" && flushAll();
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flushAll);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flushAll);
      flushAll();
    };
  }, [flush]);

  // Layers saved on an earlier visit
  useEffect(() => {
    let cancelled = false;
    loadLayers()
      .then(({ layers: saved, skipped }) => {
        if (cancelled) return;
        setLayers((current) => [...saved, ...current.filter((l) => !saved.some((s) => s.id === l.id))]);
        if (skipped)
          notify(
            `${plural(skipped, "saved map layer")} couldn't be read and ${skipped === 1 ? "was" : "were"} skipped`,
          );
      })
      .catch(() => {
        if (!cancelled) setCanSave(false);
      });
    return () => {
      cancelled = true;
    };
  }, [notify]);

  /** Adds each KML / KMZ file as a new layer. Returns the new layers, for zooming to them. */
  const importFiles = async (files: File[]): Promise<ZoneLayer[]> => {
    const added: ZoneLayer[] = [];
    const messages: string[] = [];
    for (const file of files) {
      try {
        const parsed = parseKmlBytes(new Uint8Array(await file.arrayBuffer()));
        if (!parsed.zones.length && !parsed.lines.length) {
          messages.push(`No polygons found in ${file.name}`);
          continue;
        }
        const name = parsed.name || file.name.replace(/\.km[lz]$/i, "");
        const kind = looksLikeWhiteSpace(name) || looksLikeWhiteSpace(file.name) ? "whitespace" : "coverage";
        const layer: ZoneLayer = {
          id: newId(),
          name,
          kind,
          visible: true,
          color: nextLayerColor([...layers, ...added], kind),
          opacity: DEFAULT_OPACITY,
          source: file.name,
          zones: parsed.zones,
          lines: parsed.lines,
          created: Date.now() + added.length,
        };
        added.push(layer);
        const extra = [
          parsed.lines.length ? plural(parsed.lines.length, "line") : "",
          parsed.skippedPoints ? `${plural(parsed.skippedPoints, "marker")} skipped` : "",
        ].filter(Boolean);
        messages.push(
          `Added ${name}: ${plural(parsed.zones.length, "zone")}${extra.length ? ` (${extra.join(", ")})` : ""}`,
        );
      } catch (err) {
        messages.push(`Couldn't read ${file.name}: ${err instanceof Error ? err.message : "unknown error"}`);
      }
    }
    if (added.length) {
      setLayers((current) => [...current, ...added]);
      added.forEach((layer) => save(layer));
    }
    if (messages.length) notify(messages.join(". "));
    return added;
  };

  // Replaces one layer with a changed copy and saves it
  const changeLayer = (id: string, change: (layer: ZoneLayer) => ZoneLayer, delay = 0) => {
    setLayers((current) =>
      current.map((layer) => {
        if (layer.id !== id) return layer;
        const updated = change(layer);
        save(updated, delay);
        return updated;
      }),
    );
  };

  const updateLayer = (id: string, patch: Partial<Omit<ZoneLayer, "id">>, delay = 0) =>
    changeLayer(id, (layer) => ({ ...layer, ...patch }), delay);

  const updateZone = (layerId: string, zoneId: string, patch: Partial<Omit<Zone, "id">>, delay = 0) =>
    changeLayer(
      layerId,
      (layer) => ({ ...layer, zones: layer.zones.map((z) => (z.id === zoneId ? { ...z, ...patch } : z)) }),
      delay,
    );

  /** A new, empty layer to draw zones into. */
  const addLayer = (kind: LayerKind): ZoneLayer => {
    const layer: ZoneLayer = {
      id: newId(),
      name: kind === "whitespace" ? "White space" : "Coverage zones",
      kind,
      visible: true,
      color: nextLayerColor(layers, kind),
      opacity: DEFAULT_OPACITY,
      source: "",
      zones: [],
      lines: [],
      created: Date.now(),
    };
    setLayers((current) => [...current, layer]);
    save(layer);
    return layer;
  };

  /** Adds a drawn zone to a layer, named like My Maps does ("White space 3"). Returns the new zone. */
  const addZone = (layerId: string, polygons: PolygonRings[]): Zone | null => {
    const layer = layers.find((l) => l.id === layerId);
    if (!layer) return null;
    const label = layer.kind === "whitespace" ? LAYER_KIND_LABEL.whitespace : "Zone";
    const zone: Zone = {
      id: newId(),
      name: `${label} ${layer.zones.length + 1}`,
      description: "",
      color: null,
      polygons,
    };
    changeLayer(layerId, (l) => ({ ...l, zones: [...l.zones, zone] }));
    return zone;
  };

  const removeZone = (layerId: string, zoneId: string) =>
    changeLayer(layerId, (layer) => ({ ...layer, zones: layer.zones.filter((z) => z.id !== zoneId) }));

  const removeLayer = (id: string) => {
    window.clearTimeout(saveTimers.current.get(id));
    pending.current.delete(id);
    setLayers((current) => current.filter((l) => l.id !== id));
    deleteLayer(id).catch(saveFailed);
  };

  const clearAll = () => {
    saveTimers.current.forEach((t) => window.clearTimeout(t));
    saveTimers.current.clear();
    pending.current.clear();
    setLayers([]);
    clearLayers().catch(saveFailed);
    notify("All map layers removed");
  };

  return {
    layers,
    canSave,
    importFiles,
    addLayer,
    updateLayer,
    removeLayer,
    clearAll,
    addZone,
    updateZone,
    removeZone,
  };
}
