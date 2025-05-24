import { parseLocationToTuple } from "@/App";
import React, { useEffect, useRef, useCallback } from "react";
import type { Location } from "./map/types";

function ClipboardMonitor({ enabled, setClipboardContents: setCb }: {enabled: boolean, setClipboardContents: React.Dispatch<React.SetStateAction<Location | undefined>>}) {
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
      clrInt();
    };
  }, [clrInt]);

  const chkCb = useCallback(async () => {
    if (!mntRef.current || document.hidden) return;

    if (!navigator.clipboard?.readText) {
      clrInt();
      return;
    }
    try {
      const p = await navigator.permissions.query({ name: "clipboard-read" as PermissionName });
      if (p.state === "denied") {
        clrInt();
        return;
      }
      const t = await navigator.clipboard.readText();
      if (mntRef.current && t !== lstRef.current) {
        lstRef.current = t;
        const n = parseLocationToTuple(t)
        if (n) setCb(n);
      }
    } catch (er: any) {
      if (er.name === "NotAllowedError") {
        clrInt();
      }
      // Other errors are ignored to minimize size and prevent stopping
      // for transient issues like document not being focused in some browsers.
    }
  }, [setCb, clrInt]);

  useEffect(() => {
    if (enabled) {
      const setup = async () => {
        await chkCb();
        if (mntRef.current && enabled && !intRef.current) {
          intRef.current = setInterval(chkCb, 1500);
        }
      };
      setup();
    } else {
      clrInt();
    }
    return clrInt;
  }, [enabled, chkCb, clrInt]);

  return null;
}

export default ClipboardMonitor;