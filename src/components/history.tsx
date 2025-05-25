// components/history.tsx (updated with addUpdatePath restored)
import type { Location, Path } from "./map/types";
import { HistoryIcon } from "lucide-react";
import {
  DialogContent,
  Dialog,
  DialogTrigger,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { useState } from "react";
import { PathHistoryItem } from "./pathhistoryitem";
import { Button } from "./ui/button";
import { SavePathDialog } from "./save-path-dialog";

// stringifyMap and destringifyMap functions
export function stringifyMap(map: Map<Date | "latest", Path>): string {
  const serializableArray = Array.from(map, ([key, value]) => [
    key instanceof Date ? key.toISOString() : key,
    value,
  ]);
  return JSON.stringify(serializableArray);
}

export function destringifyMap(jsonString: string): Map<Date | "latest", Path> {
  try {
    const parsedArray: [string, Path][] = JSON.parse(jsonString);
    const resultMap = new Map<Date | "latest", Path>();
    for (const [stringKey, value] of parsedArray) {
      resultMap.set(
        stringKey === "latest" ? "latest" : new Date(stringKey),
        value,
      );
    }
    return resultMap;
  } catch (error) {
    console.error("Error parsing path history:", error);
    return new Map();
  }
}

// addUpdatePath function - restored for App.tsx to use
export function addUpdatePath(path: Path) {
  let historyMap = destringifyMap(localStorage.getItem("pathHistory") || "[]");

  if (path.name && path.name.trim() !== "") {
    // Saving a named path
    const dateKey = path.date || new Date();
    const pathToAdd: Path = {
      ...path,
      date: dateKey,
      name: path.name.trim(),
      enabled: path.path.length > 0,
    };
    historyMap.set(dateKey, pathToAdd);
  } else {
    // Saving as "latest" path
    const latestPathData: Path = {
      ...path,
      name: undefined,
      date: undefined,
      enabled: path.path.length > 0,
    };
    historyMap.set("latest", latestPathData);
  }
  localStorage.setItem("pathHistory", stringifyMap(historyMap));
}

export default function History({
  setPointsArray,
  loadedPath,
  setLoadedPath,
  currentPath,
}: {
  pointsArray: readonly Location[];
  setPointsArray: React.Dispatch<React.SetStateAction<Location[]>>;
  loadedPath: Path;
  setLoadedPath: (path: Path) => void;
  currentPath: Path;
}) {
  const loadHistoryFromStorage = () => {
    return destringifyMap(localStorage.getItem("pathHistory") || "[]");
  };

  const [pathHistory, setPathHistory] = useState<Map<Date | "latest", Path>>(
    loadHistoryFromStorage(),
  );

  const getSortedPaths = (): [Date | "latest", Path][] => {
    const entries = Array.from(pathHistory.entries());
    const latestEntry = entries.find(([key]) => key === "latest");
    const dateEntries = entries
      .filter((entry): entry is [Date, Path] => entry[0] instanceof Date)
      .sort(
        ([keyA], [keyB]) =>
          (keyB as Date).getTime() - (keyA as Date).getTime(),
      );

    const sortedEntries: [Date | "latest", Path][] = [];
    if (latestEntry) {
      const latestPathWithCorrectEnabled = {
        ...latestEntry[1],
        enabled: latestEntry[1].path.length > 0,
      };
      sortedEntries.push(["latest", latestPathWithCorrectEnabled]);
    }
    sortedEntries.push(
      ...dateEntries.map(
        ([date, path]) =>
          [date, { ...path, enabled: path.path.length > 0 }] as [Date, Path],
      ),
    );
    return sortedEntries;
  };

  const handleLoadPath = (keyToLoad: Date | "latest") => {
    const pathEntry = pathHistory.get(keyToLoad);
    if (pathEntry) {
      const pathWithCorrectEnabled = {
        ...pathEntry,
        enabled: pathEntry.path.length > 0,
      };
      setLoadedPath(pathWithCorrectEnabled);
      setPointsArray(pathWithCorrectEnabled.path);
    }
  };

  const handleDeletePath = (keyToDelete: Date | "latest") => {
    const pathBeingDeleted = pathHistory.get(keyToDelete);
    if (!pathBeingDeleted) return;

    const newHistory = new Map(pathHistory);
    newHistory.delete(keyToDelete);
    localStorage.setItem("pathHistory", stringifyMap(newHistory));
    setPathHistory(newHistory);

    let wasLoadedPath = false;
    if (keyToDelete === "latest") {
      if (!loadedPath.date) {
        wasLoadedPath = true;
      }
    } else if (
      keyToDelete instanceof Date &&
      loadedPath.date &&
      loadedPath.date.getTime() === keyToDelete.getTime()
    ) {
      wasLoadedPath = true;
    }

    if (wasLoadedPath) {
      const latestAvailable = newHistory.get("latest");
      if (latestAvailable) {
        const latestWithPathCorrectEnabled = {
          ...latestAvailable,
          enabled: latestAvailable.path.length > 0,
        };
        setLoadedPath(latestWithPathCorrectEnabled);
        setPointsArray(latestWithPathCorrectEnabled.path);
      } else {
        const emptyPath: Path = {
          path: [],
          enabled: false,
          name: undefined,
          date: undefined,
        };
        setLoadedPath(emptyPath);
        setPointsArray([]);
      }
    }
  };

  // Fixed: Properly refresh history after saving
  const handleSavePath = (savedPath: Path) => {
    setLoadedPath(savedPath);
    // Force refresh from localStorage to get the latest state
    const refreshedHistory = loadHistoryFromStorage();
    setPathHistory(refreshedHistory);
  };

  const sortedPaths = getSortedPaths();

  return (
    <div className="space-y-2">
      {/* Save Path Button */}
      <SavePathDialog currentPath={currentPath} onSave={handleSavePath} />

      {/* History Dialog */}
      <Dialog
        onOpenChange={(isOpen) => {
          if (isOpen) {
            // Refresh history when opening dialog
            setPathHistory(loadHistoryFromStorage());
          }
        }}
      >
        <DialogTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            title="Open Path History"
            className="border-[#303849] bg-[#262b37] text-white hover:bg-[#303849] hover:border-gray-500 flex w-full hover:cursor-pointer"
          >
            Saved Paths
            <HistoryIcon className="h-5 w-5" />
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-md md:max-w-lg lg:max-w-xl max-h-[85vh] flex flex-col bg-[#202632] border-[#303849] text-white">
          <DialogHeader>
            <DialogTitle className="text-xl text-white">
              Path History
            </DialogTitle>
          </DialogHeader>
          {sortedPaths.length === 0 ? (
            <div className="flex-grow flex items-center justify-center">
              <p className="text-[#8e98ac] text-center py-8">
                No saved paths yet.
                <br />
                Paths you draw will appear here.
              </p>
            </div>
          ) : (
            <div className="mt-4 space-y-3 overflow-y-auto flex-grow pr-2">
              {sortedPaths.map(([key, pathItem]) => (
                <PathHistoryItem
                  key={key instanceof Date ? key.toISOString() : key}
                  pathKey={key}
                  pathData={pathItem}
                  onLoadPath={handleLoadPath}
                  onDeletePath={handleDeletePath}
                  isLatest={key === "latest"}
                />
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}