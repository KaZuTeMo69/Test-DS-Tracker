import { Share2 } from "lucide-react";
import { useRoads } from "../hooks/useRoads";
import { copyText } from "../lib/clipboard";
import { LatLng } from "../lib/coords";
import { googleMapsPlace } from "../lib/roads";

// Phones and tablets have a share sheet; on a computer the link is copied
const canShare = () =>
  typeof navigator !== "undefined" && !!navigator.share && window.matchMedia("(pointer: coarse)").matches;

/**
 * "Open in Google Maps" (the exact spot as a pin, no route) and "Share pin": the same link, copied, or handed to the
 * phone's share sheet. `label` names the place for the share sheet.
 */
export default function MapsButtons({
  point,
  label,
  className = "",
}: {
  point: LatLng;
  label: string;
  className?: string;
}) {
  const { notify } = useRoads();
  const url = googleMapsPlace(point);
  const share = async () => {
    if (canShare()) {
      try {
        await navigator.share({ title: label, text: label, url });
        return;
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return; // closed without sharing
      }
    }
    notify((await copyText(url)) ? "Link copied" : "Couldn't copy the link. Your browser blocked the clipboard");
  };
  return (
    <div className={`maps-buttons ${className}`}>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="maps-open"
        title={`${label} in Google Maps`}
        data-maps-link
      >
        📍 Open in Google Maps
      </a>
      <button type="button" className="maps-share" onClick={share} title="Copy or share a link to this pin">
        <Share2 size={14} aria-hidden="true" /> Share pin
      </button>
    </div>
  );
}
