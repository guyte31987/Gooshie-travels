import { useEffect, useRef } from "react";

/**
 * Makes the browser/Android hardware "back" button close an open overlay
 * (modal, sheet, dialog) instead of navigating away from the page.
 *
 * While `active` is true we push a history entry. Pressing back pops that
 * entry, firing `popstate`, which calls `onClose`. If the overlay is closed
 * some other way (✕, backdrop, Save), the cleanup removes our history entry
 * so the back button stays in sync.
 *
 * Pass `active={true}` from a component that only mounts while open, or wire
 * it to the boolean that controls the overlay.
 */
export function useBackClose(active: boolean, onClose: () => void) {
  const cb = useRef(onClose);
  cb.current = onClose;

  useEffect(() => {
    if (!active || typeof window === "undefined") return;
    window.history.pushState({ overlay: true }, "");
    const onPop = () => cb.current();
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      // Closed without pressing back? Remove the entry we pushed.
      if (window.history.state?.overlay) window.history.back();
    };
  }, [active]);
}
