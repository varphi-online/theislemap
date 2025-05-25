// components/save-path-dialog.tsx
import React, { useState } from "react";
import type { Path } from "./map/types";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "./ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Save } from "lucide-react";
import { destringifyMap, stringifyMap } from "./history";

interface SavePathDialogProps {
  currentPath: Path;
  onSave: (savedPath: Path) => void;
  trigger?: React.ReactNode;
}

export function SavePathDialog({
  currentPath,
  onSave,
  trigger,
}: SavePathDialogProps) {
  const [selectedOption, setSelectedOption] = useState<string>("");
  const [newPathName, setNewPathName] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  const loadHistoryFromStorage = () => {
    return destringifyMap(localStorage.getItem("pathHistory") || "[]");
  };

  // Helper function to ensure date is a Date object
  const ensureDateObject = (date: any): Date | undefined => {
    if (!date) return undefined;
    if (date instanceof Date) return date;
    if (typeof date === "string") return new Date(date);
    return undefined;
  };

  const getExistingPaths = (): (Path & { uniqueId: string })[] => {
    const historyMap = loadHistoryFromStorage();
    return Array.from(historyMap.entries())
      .filter(([key, path]) => key !== "latest" && path.name?.trim())
      .map(([key, path], index) => ({
        ...path,
        date: ensureDateObject(path.date),
        // Create a unique identifier for React keys
        uniqueId:
          key instanceof Date ? key.toISOString() : `${path.name}-${index}`,
      }))
      .sort((a, b) => {
        if (a.date && b.date) {
          return b.date.getTime() - a.date.getTime();
        }
        return 0;
      });
  };

  // Fixed saving logic - now properly handles overwriting
  const savePathToStorage = (
    path: Path,
    shouldOverwrite: boolean = false,
    pathNameToOverwrite?: string,
  ) => {
    const historyMap = loadHistoryFromStorage();

    // If we're overwriting, find and remove the old entry first
    if (shouldOverwrite && pathNameToOverwrite) {
      // Find and remove all entries with the same name
      for (const [key, existingPath] of historyMap.entries()) {
        if (
          key !== "latest" &&
          existingPath.name === pathNameToOverwrite
        ) {
          historyMap.delete(key);
        }
      }
    }

    if (path.name && path.name.trim() !== "") {
      // Saving a named path - ensure unique timestamp
      let dateKey = new Date();
      
      // Ensure unique key by checking for existing timestamps
      while (historyMap.has(dateKey)) {
        dateKey = new Date(dateKey.getTime() + 1);
      }

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
    return path;
  };

  const handleSave = () => {
    let pathToSave: Path;
    let shouldOverwrite = false;
    let pathNameToOverwrite: string | undefined;

    if (selectedOption === "new") {
      const trimmedName = newPathName.trim();
      if (!trimmedName) {
        alert("Please enter a name for the new path.");
        return;
      }

      pathToSave = {
        ...currentPath,
        name: trimmedName,
        date: new Date(),
        enabled: currentPath.path.length > 0,
      };
    } else if (selectedOption) {
      // Overwrite existing path
      const existingPaths = getExistingPaths();
      const pathToOverwrite = existingPaths.find(
        (p) => p.name === selectedOption,
      );

      if (pathToOverwrite) {
        pathToSave = {
          ...currentPath,
          name: pathToOverwrite.name,
          date: new Date(), // Use new date for overwrite
          enabled: currentPath.path.length > 0,
        };
        shouldOverwrite = true;
        pathNameToOverwrite = pathToOverwrite.name;
      } else {
        alert("Selected path not found.");
        return;
      }
    } else {
      alert("Please select an option to save the path.");
      return;
    }

    // Save the path with overwrite information
    const savedPath = savePathToStorage(
      pathToSave,
      shouldOverwrite,
      pathNameToOverwrite,
    );
    onSave(savedPath);

    // Reset form and close dialog
    setSelectedOption("");
    setNewPathName("");
    setIsOpen(false);
  };

  const existingPaths = getExistingPaths();

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button
            variant="outline"
            size="icon"
            title="Save Path"
            disabled={currentPath.path.length<1}
            className="border-[#303849] bg-[#08531f] text-white hover:bg-[#38834f] hover:border-gray-500 flex w-full cursor-pointer"
          >
            Save Path
            <Save className="h-5 w-5" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-md bg-[#202632] border-[#303849] text-white">
        <DialogHeader>
          <DialogTitle className="text-xl text-white">Save Path</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label htmlFor="save-option" className="text-white">
              Choose save option:
            </Label>
            <Select value={selectedOption} onValueChange={setSelectedOption}>
              <SelectTrigger className="bg-[#262b37] border-[#303849] text-white">
                <SelectValue placeholder="Select where to save..." />
              </SelectTrigger>
              <SelectContent className="bg-[#262b37] border-[#303849]">
                <SelectItem
                  value="new"
                  className="text-white hover:bg-[#303849]"
                >
                  Save as new path...
                </SelectItem>
                {existingPaths.map((path) => (
                  <SelectItem
                    key={path.uniqueId}
                    value={path.name!}
                    className="text-white hover:bg-[#303849]"
                  >
                    Overwrite: {path.name}
                    {path.date && (
                      <span className="text-xs text-[#8e98ac] ml-2">
                        {path.date.toLocaleString()}
                      </span>
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedOption === "new" && (
            <div className="space-y-2">
              <Label htmlFor="new-path-name" className="text-white">
                New path name:
              </Label>
              <Input
                id="new-path-name"
                type="text"
                value={newPathName}
                onChange={(e) => setNewPathName(e.target.value)}
                placeholder="Enter path name..."
                className="bg-[#262b37] border-[#303849] text-white placeholder:text-[#8e98ac] focus:border-blue-500"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleSave();
                  }
                }}
              />
            </div>
          )}

          {selectedOption && selectedOption !== "new" && (
            <div className="p-3 bg-[#262b37] border border-[#303849] rounded-md">
              <p className="text-sm text-[#8e98ac]">
                This will overwrite the existing path "
                <span className="text-white font-medium">{selectedOption}</span>
                "
              </p>
            </div>
          )}

          <div className="flex space-x-2 pt-4">
            <DialogClose asChild>
              <Button
                variant="outline"
                className="flex-1 bg-transparent border-[#303849] text-white hover:bg-[#303849]"
              >
                Cancel
              </Button>
            </DialogClose>
            <Button
              onClick={handleSave}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
            >
              Save Path
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}