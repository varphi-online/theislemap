// components/pathhistoryitem.tsx (simplified)
import type { Path } from "./map/types";
import { Button } from "./ui/button";
import { DialogClose } from "./ui/dialog";
import { Trash2, MapPin } from "lucide-react";

interface PathHistoryItemProps {
  pathKey: Date | "latest";
  pathData: Path;
  onLoadPath: (pathKey: Date | "latest") => void;
  onDeletePath: (pathKey: Date | "latest") => void;
  isLatest: boolean;
}

export function PathHistoryItem({
  pathKey,
  pathData,
  onLoadPath,
  onDeletePath,
  isLatest,
}: PathHistoryItemProps) {
  const pathDisplayName =
    pathData.name || (isLatest ? "Current Path" : "Unnamed Path");
  const pathDate =
    pathData.date instanceof Date
      ? pathData.date
      : pathKey instanceof Date
        ? pathKey
        : null;
  const pathLength = pathData.path.length;

  return (
    <div
      className={`p-4 border rounded-lg ${
        isLatest
          ? "bg-gradient-to-r from-[#262b37] to-[#303849] border-blue-500 shadow-md"
          : "bg-[#262b37] border-[#303849] hover:border-gray-500 hover:shadow-sm"
      } flex flex-col space-y-3 transition-all duration-200`}
    >
      {/* Header with name */}
      <div className="flex justify-between items-start">
        <div className="flex items-center space-x-2 flex-grow">
          {isLatest && (
            <MapPin className="h-5 w-5 text-blue-400 flex-shrink-0 mt-0.5" />
          )}
          <div className="flex-grow">
            <h3
              className={`font-semibold text-lg truncate ${
                isLatest ? "text-blue-300" : "text-white"
              }`}
            >
              {pathDisplayName}
            </h3>
            {isLatest && (
              <p className="text-sm text-blue-400 font-medium mt-1">
                Currently active on map
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Date info */}
      {pathDate && (
        <p className="text-sm text-[#8e98ac]">
          Saved: {pathDate.toLocaleString()} | Points: {pathLength}
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