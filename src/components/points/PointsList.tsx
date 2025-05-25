// components/points/PointsList.tsx
import React from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { SortablePointItem } from "./SortablePointItem";
import type { Location } from "../map/types";

interface PointsListProps {
  points: Location[];
  pathName?: string;
  onReorderPoints: (newPoints: Location[]) => void;
  onRemovePoint: (index: number) => void;
}

export function PointsList({
  points,
  pathName,
  onReorderPoints,
  onRemovePoint,
}: PointsListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (active.id !== over?.id) {
      const activeIndex = parseInt(
        (active.id as string).replace("point-", ""),
      );
      const overIndex = parseInt((over?.id as string).replace("point-", ""));

      const newPoints = arrayMove(points, activeIndex, overIndex);
      onReorderPoints(newPoints);
    }
  };

  if (points.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-gray-300 px-2">
        {pathName || "Current Path"} ({points.length} points)
      </h3>
      <div className="space-y-1 max-h-48 overflow-y-auto">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={points.map((_, index) => `point-${index}`)}
            strategy={verticalListSortingStrategy}
          >
            {points.map((point, index) => (
              <SortablePointItem
                key={`point-${index}`}
                point={point}
                index={index}
                onRemove={() => onRemovePoint(index)}
                isFirst={index === 0}
                isLast={index === points.length - 1}
              />
            ))}
          </SortableContext>
        </DndContext>
      </div>
    </div>
  );
}