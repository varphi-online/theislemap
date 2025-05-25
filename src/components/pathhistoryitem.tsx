// PathHistoryItem.tsx
import React, { useState, useEffect } from "react";
import type { Path } from "./map/types"; // Adjust path if necessary
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { DialogClose } from "./ui/dialog";
import { Trash2, Edit3, Check, X, MapPin } from "lucide-react";

interface PathHistoryItemProps {
  pathKey: Date | "latest";
  pathData: Path;
  onLoadPath: (pathKey: Date | "latest") => void;
  onUpdatePathName: (
    pathKey: Date | "latest",
    newName: string,
    currentPathData: Path,
  ) => void;
  onDeletePath: (pathKey: Date | "latest") => void;
  isLatest: boolean;
}

export function PathHistoryItem({
  pathKey,
  pathData,
  onLoadPath,
  onUpdatePathName,
  onDeletePath,
  isLatest,
}: PathHistoryItemProps) {
  const [currentName, setCurrentName] = useState(pathData.name || "");
  const [isEditingName, setIsEditingName] = useState(false);

  useEffect(() => {
    setCurrentName(pathData.name || "");
  }, [pathData.name]);

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCurrentName(e.target.value);
  };

  const saveName = () => {
    const trimmedName = currentName.trim();
    if (!isLatest && !trimmedName) {
      alert("Path name cannot be empty for saved paths. Reverting.");
      setCurrentName(pathData.name || ""); // Revert
    } else {
      // Allow empty name for "latest" (means it's unnamed)
      // or if it's a non-empty name for any path.
      onUpdatePathName(pathKey, trimmedName, pathData);
    }
    setIsEditingName(false);
  };

  const handleNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      saveName();
    } else if (e.key === "Escape") {
      setCurrentName(pathData.name || "");
      setIsEditingName(false);
    }
  };

  const pathDisplayName =
    pathData.name || (isLatest ? "Current Path" : "Unnamed Path");
  const pathDate =
    pathData.date instanceof Date
      ? pathData.date
      : pathKey instanceof Date
        ? pathKey
        : null;
  const pathLength = pathData.path.length

  return (
    <div
      className={`p-4 border rounded-lg ${
        isLatest
          ? "bg-gradient-to-r from-[#262b37] to-[#303849] border-blue-500 shadow-md"
          : "bg-[#262b37] border-[#303849] hover:border-gray-500 hover:shadow-sm"
      } flex flex-col space-y-3 transition-all duration-200`}
    >
      {/* Header with name and edit controls */}
      <div className="flex justify-between items-start">
        <div className="flex items-center space-x-2 flex-grow">
          {isLatest && (
            <MapPin className="h-5 w-5 text-blue-400 flex-shrink-0 mt-0.5" />
          )}
          {isEditingName ? (
            <div className="flex items-center space-x-2 flex-grow">
              <Input
                type="text"
                value={currentName}
                onChange={handleNameChange}
                onKeyDown={handleNameKeyDown}
                onBlur={saveName}
                autoFocus
                className="flex-grow h-9 text-base bg-[#262b37] border-[#303849] text-white placeholder:text-[#8e98ac] focus:border-blue-500"
                placeholder={
                  isLatest ? "Name this path (optional)" : "Path Name"
                }
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={saveName}
                title="Save name"
                className="h-9 w-9 p-0 hover:bg-[#303849] text-white"
              >
                <Check className="h-4 w-4 text-green-400" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setCurrentName(pathData.name || "");
                  setIsEditingName(false);
                }}
                title="Cancel editing"
                className="h-9 w-9 p-0 hover:bg-[#303849] text-white"
              >
                <X className="h-4 w-4 text-red-400 cursor-pointer" />
              </Button>
            </div>
          ) : (
            <div className="flex-grow">
              <h3
                className={`font-semibold text-lg cursor-pointer hover:text-blue-400 truncate ${
                  isLatest ? "text-blue-300" : "text-white"
                }`}
                onDoubleClick={() => setIsEditingName(true)}
                title={
                  isLatest && !pathData.name
                    ? "Double-click to name this path"
                    : "Double-click to edit name"
                }
              >
                {pathDisplayName}
              </h3>
              {isLatest && (
                <p className="text-sm text-blue-400 font-medium mt-1">
                  Currently active on map
                </p>
              )}
            </div>
          )}
        </div>
        {!isEditingName && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsEditingName(true)}
            title="Edit name"
            className="h-9 w-9 p-0 text-[#8e98ac] hover:text-white hover:bg-[#303849] cursor-pointer"
          >
            <Edit3 className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Date info */}
      {pathDate && (
        <p className="text-sm text-[#8e98ac]">
          Saved: {pathDate.toLocaleString()} | Len: {pathLength}
        </p>
      )}
      {!pathDate && isLatest && (
        <p className="text-sm text-blue-400 italic">Unsaved changes</p>
      )}

      {/* Action buttons */}
      <div className="flex space-x-2 pt-2">
        {isLatest ? (
          <div className="flex-1 text-center py-2 px-4 bg-[#303849] text-blue-300 rounded-md text-sm font-medium border border-blue-500">
            Currently viewing this path
          </div>
        ) : (
          <>
            <DialogClose asChild>
              <Button
                onClick={() => onLoadPath(pathKey)}
                size="sm"
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white border-transparent hover:cursor-pointer"
              >
                Load Path
              </Button>
            </DialogClose>
            <Button
              onClick={() => {
                if (
                  window.confirm(
                    `Are you sure you want to delete "${pathDisplayName}"? This action cannot be undone.`,
                  )
                ) {
                  onDeletePath(pathKey);
                }
              }}
              variant="destructive"
              size="sm"
              className="px-3 bg-red-500 hover:bg-red-600 text-white"
              title="Delete this path"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}