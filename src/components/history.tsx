// components/history.tsx
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

// stringifyMap and destringifyMap functions
export function stringifyMap(map: Map<Date | "latest", Path>): string {
  const serializableArray = Array.from(map, ([key, value]) => [
    key instanceof Date ? key.toISOString() : key,
    value,
  ]);
  return JSON.stringify(serializableArray);
}

export function destringifyMap(jsonString: string): Map<Date | "latest", Path> {
  const parsedArray: [string, Path][] = JSON.parse(jsonString);
  const resultMap = new Map<Date | "latest", Path>();
  for (const [stringKey, value] of parsedArray) {
    resultMap.set(
      stringKey === "latest" ? "latest" : new Date(stringKey),
      value,
    );
  }
  return resultMap;
}

// addUpdatePath function
export function addUpdatePath(path: Path) {
  let historyMap = destringifyMap(localStorage.getItem("pathHistory") || "[]");

  if (path.name && path.name.trim() !== "") {
    // Saving a named path
    const dateKey = path.date || new Date(); // Use existing date or assign new
    const pathToAdd: Path = {
      ...path,
      date: dateKey,
      name: path.name.trim(),
      enabled: path.path.length > 0, // Ensure enabled status is correct
    };
    historyMap.set(dateKey, pathToAdd);
  } else {
    // Saving as "latest" path
    const latestPathData: Path = {
      ...path,
      name: undefined, // "latest" path has no name
      date: undefined, // "latest" path has no date
      enabled: path.path.length > 0, // Ensure enabled status is correct
    };
    historyMap.set("latest", latestPathData);
  }
  localStorage.setItem("pathHistory", stringifyMap(historyMap));
}

export default function History({
  // pointsArray, // Not directly used for modification here, setPointsArray is used
  setPointsArray,
  loadedPath, // Used to check against when deleting/updating
  setLoadedPath,
}: {
  pointsArray: readonly Location[]; // For reference if needed, but not directly modified
  setPointsArray: React.Dispatch<React.SetStateAction<Location[]>>;
  loadedPath: Path;
  setLoadedPath: React.Dispatch<React.SetStateAction<Path>>;
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
      // Ensure "latest" path also has its 'enabled' status correctly reflected
      const latestPathWithCorrectEnabled = {
        ...latestEntry[1],
        enabled: latestEntry[1].path.length > 0,
      };
      sortedEntries.push(["latest", latestPathWithCorrectEnabled]);
    }
    sortedEntries.push(
      ...dateEntries.map(
        ([date, path]) =>
          [
            date,
            { ...path, enabled: path.path.length > 0 },
          ] as [Date, Path], // Ensure 'enabled' is correct
      ),
    );
    return sortedEntries;
  };

  const handleLoadPath = (keyToLoad: Date | "latest") => {
    const pathEntry = pathHistory.get(keyToLoad);
    if (pathEntry) {
      // Ensure the loaded path has its 'enabled' status correctly set
      const pathWithCorrectEnabled = {
        ...pathEntry,
        enabled: pathEntry.path.length > 0,
      };
      // It's crucial to set loadedPath first, then pointsArray (UPoints in App.tsx)
      // This allows App.tsx's useEffect to correctly interpret the state change.
      setLoadedPath(pathWithCorrectEnabled);
      setPointsArray(pathWithCorrectEnabled.path);
      // Dialog will be closed by DialogClose in PathHistoryItem
    }
  };

  const handleUpdatePathName = (
    keyToUpdate: Date | "latest",
    newName: string,
    currentPathData: Path,
  ) => {
    const trimmedName = newName.trim();
    const currentPathWithCorrectEnabled = {
      ...currentPathData,
      enabled: currentPathData.path.length > 0,
    };

    if (keyToUpdate === "latest") {
      if (trimmedName) {
        // Naming the "latest" path: save it as a new dated entry
        const newPathToSave: Path = {
          ...currentPathWithCorrectEnabled, // Use the version with correct 'enabled'
          name: trimmedName,
          date: new Date(),
        };
        addUpdatePath(newPathToSave); // Saves as new dated entry
        setLoadedPath(newPathToSave); // Update App's loadedPath
        // The "latest" entry in localStorage remains as it was (the content that was just named)
        // Subsequent drawing in App.tsx will update/overwrite "latest"
        setPathHistory(loadHistoryFromStorage());
      } else {
        // If "latest" is "unnamed" (empty string), ensure its data reflects no name
        // This case should ideally not happen if UI prevents empty name for "latest"
        // but if it does, we ensure "latest" is stored correctly.
        addUpdatePath(currentPathWithCorrectEnabled); // Re-saves "latest" correctly
        if (!loadedPath.date && loadedPath.name === currentPathData.name) {
          setLoadedPath(currentPathWithCorrectEnabled); // Update if it was the loaded one
        }
        setPathHistory(loadHistoryFromStorage());
      }
    } else if (keyToUpdate instanceof Date) {
      // Renaming an existing dated path
      if (!trimmedName) {
        // PathHistoryItem should prevent this, but as a safeguard:
        console.warn(
          "Attempted to clear name for a dated path. Operation aborted in handler.",
        );
        setPathHistory(loadHistoryFromStorage());
        return;
      }
      const updatedPath: Path = {
        ...currentPathWithCorrectEnabled, // Use the version with correct 'enabled'
        name: trimmedName,
      };
      const newHistory = new Map(pathHistory);
      newHistory.set(keyToUpdate, updatedPath);
      localStorage.setItem("pathHistory", stringifyMap(newHistory));
      setPathHistory(newHistory);

      if (
        loadedPath.date &&
        loadedPath.date.getTime() === keyToUpdate.getTime()
      ) {
        setLoadedPath(updatedPath); // Update App's loadedPath if it was this one
      }
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
        // If current loadedPath is "latest"
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
        // If no "latest" either, clear the map
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

  const sortedPaths = getSortedPaths();

  return (
    <Dialog
      onOpenChange={(isOpen) => {
        if (isOpen) {
          setPathHistory(loadHistoryFromStorage()); // Refresh history on open
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
          Saved Paths<HistoryIcon className="h-5 w-5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md md:max-w-lg lg:max-w-xl max-h-[85vh] flex flex-col bg-[#202632] border-[#303849] text-white">
        <DialogHeader>
          <DialogTitle className="text-xl text-white">Path History</DialogTitle>
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
                pathData={pathItem} // pathItem already has 'enabled' correctly set by getSortedPaths
                onLoadPath={handleLoadPath}
                onUpdatePathName={handleUpdatePathName}
                onDeletePath={handleDeletePath}
                isLatest={key === "latest"}
              />
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}