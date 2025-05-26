import { parseLocationToTuple } from "@/App"; // Ensure this path is correct
import React, { useEffect, useRef, useCallback } from "react";
import type { Location } from "./map/types"; // Ensure this path is correct

interface ClipboardMonitorProps {
  enabled: boolean;
  setClipboardContents: React.Dispatch<
    React.SetStateAction<Location | undefined>
  >;
  pollrate?: number; // Optional pollrate in milliseconds
}

function ClipboardMonitor({
  enabled,
  setClipboardContents: setCb,
  pollrate = 250, // Default to 250ms if not provided
}: ClipboardMonitorProps) {
  const lstRef = useRef("");
  const intRef = useRef<NodeJS.Timeout | null>(null);
  const mntRef = useRef(true);

  const clrInt = useCallback(() => {
    if (intRef.current) {
      clearInterval(intRef.current);
      intRef.current = null;
    }
  }, []);

  useEffect(() => {
    mntRef.current = true;
    return () => {
      mntRef.current = false;
      clrInt(); // Ensure interval is cleared on unmount
    };
  }, [clrInt]);

  const chkCb = useCallback(async () => {
    if (!mntRef.current || document.hidden) {
      return;
    }

    if (!navigator.clipboard?.readText) {
      console.warn("Clipboard API not available.");
      clrInt();
      return;
    }

    try {
      const p = await navigator.permissions.query({
        name: "clipboard-read" as PermissionName,
      });
      if (p.state === "denied") {
        console.warn(
          "Clipboard read permission denied. Stopping monitor."
        );
        clrInt();
        return;
      }

      const t = await navigator.clipboard.readText();
      if (mntRef.current && t !== lstRef.current) {
        lstRef.current = t;
        const n = parseLocationToTuple(t);
        if (n) {
          setCb(n);
        }
      }
    } catch (er: any) {
    }
  }, [setCb, clrInt]); // parseLocationToTuple is stable

  useEffect(() => {
    // Always clear the previous interval when enabled status or pollrate changes.
    clrInt();

    if (enabled && pollrate > 0) {
      const setupPolling = async () => {
        if (!mntRef.current) return; // Guard if unmounted during async setup

        // Perform an initial check immediately.
        await chkCb();

        // If still mounted, enabled, and chkCb didn't cause a stop (e.g. permissions denied),
        // set the new interval.
        if (mntRef.current && enabled) {
          // Note: if chkCb called clrInt due to a persistent issue,
          // the interval will still be set here, but subsequent chkCb calls
          // will likely hit the same issue and do nothing or log again.
          // This is generally fine as it respects the enabled state.
          intRef.current = setInterval(chkCb, pollrate);
        }
      };
      setupPolling();
    } else if (enabled && pollrate <= 0) {
      console.warn(
        "ClipboardMonitor: pollrate must be a positive number. Polling will not start."
      );
      // Interval is already cleared by clrInt() at the top of this effect.
    }
    // If !enabled, interval is also cleared by clrInt() at the top.

    // Cleanup function: will be called on unmount or before the effect re-runs
    // due to changes in dependencies.
    return clrInt;
  }, [enabled, pollrate, chkCb, clrInt]);

  return null;
}

export default ClipboardMonitor;