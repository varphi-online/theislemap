// components/points/SortablePointItem.tsx
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Location } from "../map/types";

interface SortablePointItemProps {
  point: Location;
  index: number;
  onRemove: () => void;
  isFirst?: boolean;
  isLast?: boolean;
}

const padStartNegative = (n: number, l: number, p: string) => {
  let s = "" + n.toFixed(0);
  return s[0] == "-" ? "-" + s.slice(1).padStart(l, p) : s.padStart(l, p);
};

export function SortablePointItem({
  point,
  index,
  onRemove,
}: SortablePointItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: `point-${index}`,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center justify-between bg-[#262b37] rounded-lg p-2 mx-1 hover:bg-[#2a2f3c] transition-colors",
        isDragging && "shadow-lg ring-2 ring-blue-500 ring-opacity-50",
      )}
    >
      <div className="flex items-center gap-2 flex-1">
        <div
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-300 p-1 -ml-1"
        >
          <GripVertical size={16} />
        </div>
        <span className="text-sm text-white font-mono flex-1">
          {index + 1}. ({padStartNegative(point.lat, 3, "0")},{" "}
          {padStartNegative(point.long, 3, "0")})
        </span>
      </div>
      <button
        onClick={onRemove}
        className="text-red-400 cursor-pointer hover:text-red-300 hover:bg-red-500/20 rounded p-1 transition-colors flex-shrink-0"
        title="Remove point"
      >
        <X size={14} />
      </button>
    </div>
  );
}