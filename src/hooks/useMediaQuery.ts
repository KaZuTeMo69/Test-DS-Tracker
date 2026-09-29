import { useEffect, useState } from "react";

/** Whether a media query matches. Follows rotation and resizing. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches);
  useEffect(() => {
    const list = window.matchMedia(query);
    const update = () => setMatches(list.matches);
    update();
    list.addEventListener("change", update);
    return () => list.removeEventListener("change", update);
  }, [query]);
  return matches;
}

// Below this width the store and zone cards are a sheet at the bottom of the map instead of a card at the top right
export const PHONE_QUERY = "(max-width: 767px)";
// Below this width the panels are a sheet at the bottom of the map too, instead of a column beside the icon rail
export const NARROW_QUERY = "(max-width: 1023px)";

export const useIsPhone = () => useMediaQuery(PHONE_QUERY);
export const useIsNarrow = () => useMediaQuery(NARROW_QUERY);
