// components/points/PointsInput.tsx
import React from "react";
import { ArrowRightIcon, Trash2Icon } from "lucide-react";
import type { Location } from "../map/types";

interface PointsInputProps {
  inputValue: string;
  onInputChange: (value: string) => void;
  onAddPoint: () => void;
  onClearAll: () => void;
}

export function PointsInput({
  inputValue,
  onInputChange,
  onAddPoint,
  onClearAll,
}: PointsInputProps) {
  const handleKeyUp = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      onAddPoint();
    } else if (e.key === " ") {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  return (
    <div className="mr-2 flex flex-col items-center text-white bg-[#303849] rounded-xl gap-3 w-full">
      <div className="flex gap-2 items-center w-full">
        <Trash2Icon
          className="cursor-pointer border-transparent hover:border-gray-500 rounded-lg border-2 p-0"
          onClick={(e) => {
            e.stopPropagation();
            onClearAll();
          }}
          size={32}
        />
        <input
          value={inputValue}
          onClick={(e) => {
            e.stopPropagation();
          }}
          className="border-1 text-white p-2 rounded-lg bg-[#262b37] w-full focus:outline-none focus:ring-0 focus:border-transparent focus:shadow-none **:no-underline focus:**:no-underline active:**:no-underline hover:**:no-underline"
          placeholder="Lat, Long, Alt"
          style={{
            textDecoration: "none !important",
          }}
          onChange={(v) => onInputChange(v.target.value)}
          onKeyUp={handleKeyUp}
        />
        <ArrowRightIcon
          className="w-8 h-8 cursor-pointer border-transparent hover:border-gray-500 rounded-lg border-2 px-0"
          onClick={(e) => {
            e.stopPropagation();
            onAddPoint();
          }}
        />
      </div>
    </div>
  );
}