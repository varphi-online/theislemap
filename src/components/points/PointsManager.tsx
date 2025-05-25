// components/points/PointsManager.tsx
import { useState } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { PointsInput } from "./PointsInput";
import { PointsList } from "./PointsList";
import History from "../history";
import type { Location, Path } from "../map/types";

interface PointsManagerProps {
  points: Location[];
  onPointsChange: (points: Location[]) => void;
  loadedPath: Path;
  setLoadedPath: (path: Path) => void;
  parseLocationToTuple: (input: string) => Location | null;
}

export function PointsManager({
  points,
  onPointsChange,
  loadedPath,
  setLoadedPath,
  parseLocationToTuple,
}: PointsManagerProps) {
  const [inputValue, setInputValue] = useState("");

  const handleAddPoint = () => {
    if (inputValue.trim().length > 0) {
      const tuple = parseLocationToTuple(inputValue);
      if (tuple) {
        onPointsChange([...points, tuple]);
        setInputValue("");
      }
    }
  };

  const handleClearAll = () => {
    onPointsChange([]);
  };

  const handleReorderPoints = (newPoints: Location[]) => {
    onPointsChange(newPoints);
  };

  const handleRemovePoint = (index: number) => {
    const newPoints = points.filter((_, i) => i !== index);
    onPointsChange(newPoints);
  };

  // Create currentPath from current points state
  const currentPath: Path = {
    path: points,
    enabled: points.length > 0,
    name: undefined, // Current path is unnamed until saved
    date: undefined, // Current path has no date until saved
  };

  return (
    <Accordion
      type="single"
      collapsible
      className="w-full bg-[#303849] rounded-xl pr-3 pl-1"
      defaultValue="locs"
    >
      <AccordionItem value="locs" className="border-b-0">
        <AccordionTrigger className="hover:cursor-pointer hover:!no-underline">
          <PointsInput
            inputValue={inputValue}
            onInputChange={setInputValue}
            onAddPoint={handleAddPoint}
            onClearAll={handleClearAll}
          />
        </AccordionTrigger>
        <AccordionContent className="space-y-3">
          <PointsList
            points={points}
            pathName={loadedPath.name}
            onReorderPoints={handleReorderPoints}
            onRemovePoint={handleRemovePoint}
          />
          <div className={`${points.length > 0 ? "mt-4" : ""}`}>
            <History
              pointsArray={points}
              setPointsArray={(value) =>
                onPointsChange(Array.isArray(value) ? value : value(points))
              }
              loadedPath={loadedPath}
              setLoadedPath={setLoadedPath}
              currentPath={currentPath} // Add the missing currentPath prop
            />
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}