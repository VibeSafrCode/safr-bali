import { useEffect, useState } from "react";
import { destinationById } from "../catalog";
import { countryTheme } from "../countryThemes";
import { SELECTED_COUNTRY_STORAGE_KEY } from "../homeCountries";
import { backdropPosition, loadBackdrop } from "../../../shared/src/destination-backdrops";

type Frame = { src: string; id: string };
function initialWorld() {
  try { return localStorage.getItem(SELECTED_COUNTRY_STORAGE_KEY) || "bali"; } catch { return "bali"; }
}
export function DestinationBackdrop() {
  const [id, setId] = useState(initialWorld);
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem("safrway:appearance") === "light" ? "light" : "dark"; } catch { return "dark"; }
  });
  const [mobile, setMobile] = useState(() => window.matchMedia("(max-width: 767px)").matches);
  const [frames, setFrames] = useState<{ current: Frame | null; previous: Frame | null }>({ current: null, previous: null });
  useEffect(() => {
    const update = (event: Event) => setId((event as CustomEvent<string>).detail);
    const observer = new MutationObserver(() => setTheme(document.documentElement.dataset.theme ?? "dark"));
    const media = window.matchMedia("(max-width: 767px)");
    const resize = () => setMobile(media.matches);
    window.addEventListener("safr-world", update);
    media.addEventListener("change", resize);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => { window.removeEventListener("safr-world", update); media.removeEventListener("change", resize); observer.disconnect(); };
  }, []);
  useEffect(() => {
    let active = true;
    const destination = destinationById(id) ?? destinationById("bali");
    const day = destination ? countryTheme(destination).hero : null;
    if (!day) return;
    void loadBackdrop(id, theme, day).then((src) => {
      if (active) setFrames((previous) => previous.current?.src === src ? previous : { previous: previous.current, current: { src, id } });
    }).catch(() => { if (active) setFrames({ current: null, previous: null }); });
    return () => { active = false; };
  }, [id, theme]);
  return <div className="destination-backdrop" aria-hidden="true">
    {frames.previous && <img key={`previous-${frames.previous.src}`} src={frames.previous.src} alt="" data-active="true" style={{ objectPosition: backdropPosition(frames.previous.id, mobile) }} />}
    {frames.current && <img key={frames.current.src} className="destination-backdrop-current" src={frames.current.src} alt="" data-active="true" style={{ objectPosition: backdropPosition(frames.current.id, mobile) }} />}
    <span />
  </div>;
}
