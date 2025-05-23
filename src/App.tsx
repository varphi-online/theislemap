import React, { useEffect, useRef, useState } from "react";

import {
  ArrowRightIcon,
  Bubbles,
  Building2,
  FlaskConicalIcon,
  Grid,
  MapPin,
  PawPrint,
  Settings,
  SidebarIcon,
  Tent,
  Trash2Icon,
  X,
} from "lucide-react";
import { Switch } from "./components/ui/switch";
import MapComponent from "./components/map/Map";
import LiveNumericScreenOCR from "./components/LiveNumericScreenOCR";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarHeader,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import type { Location } from "./components/map/types";
import { RadioGroup, RadioGroupItem } from "./components/ui/radio-group"; // Assuming this is the correct import
import { Label } from "@radix-ui/react-label"; // Assuming this is the correct import
import {
  AccordionContent as AccordionContentForce,
  Accordion as AccordionForce,
  AccordionItem as AccordionItemForce,
  AccordionTrigger as AccordionTriggerForce,
} from "./components/ui/accordionForce";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

function parseLocationToTuple(inputStr: string): Location | null {
  if (typeof inputStr !== "string" || !(inputStr = inputStr.trim())) {
    return null;
  }

  const parseFloatClean = (s: string) => parseFloat(s.replace(/,/g, ""));
  let match, lat, lon;

  // Format: (Lat: -12,345.67 Long: 98,765.43 Alt: ...)
  match = inputStr.match(
    /\(Lat:\s*(-?[\d,]+(?:\.\d+)?)\s*Long:\s*(-?[\d,]+(?:\.\d+)?)(?:\s*Alt:.*)?\)/i
  );
  if (
    match &&
    !isNaN((lat = parseFloatClean(match[1]))) &&
    !isNaN((lon = parseFloatClean(match[2])))
  ) {
    return { lat: lat / 1000, long: lon / 1000 };
  }

  // Format: -12345, 98765, ... (ignores third number if present)
  match = inputStr.match(
    /^(-?[\d,]+(?:\.\d+)?)\s*,\s*(-?[\d,]+(?:\.\d+)?)\s*,\s*(-?[\d,]+(?:\.\d+)?)$/
  );
  if (
    match &&
    !isNaN((lat = parseFloatClean(match[1]))) &&
    !isNaN((lon = parseFloatClean(match[2])))
  ) {
    return { lat: lat / 1000, long: lon / 1000 };
  }

  // Format: -12345,98765 (integer, direct values)
  match = inputStr.match(/^(-?\d+)\s*,\s*(-?\d+)$/);
  if (
    match &&
    !isNaN((lat = parseInt(match[1], 10))) &&
    !isNaN((lon = parseInt(match[2], 10))) // Corrected: was match[3] in condition
  ) {
    return { lat: lat, long: lon }; // Use lon assigned in condition
  }

  return null;
}

function Toggle({
  name,
  checked,
  setChecked,
  children,
}: {
  name: string;
  checked: boolean;
  setChecked: (checked: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex justify-between items-center">
      <div className=" flex items-center gap-2">
        {children}
        <p>{name}</p>
      </div>
      <Switch checked={checked} onCheckedChange={setChecked} />
    </div>
  );
}

function App() {
  const [UPoints, setUPoints] = useState<Location[]>([]);
  const [CPoints, setCPoints] = useState<Location[]>([]);
  const [inp, setInp] = useState("");
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const [mapDisplayWidth, setMapDisplayWidth] = useState(1000);

  /** PREFERENCES */
  const [preferences, setPreferences] = useState(
    JSON.parse(localStorage.getItem("preferences") || "null") || {
      mapStyle: "iml",
      gridlines: false,
      locationLabels: true,
      mudOverlay: false,
      sanctuaryOverlay: false,
      structureOverlay: false,
      migrationOverlay: false,
    }
  );
  useEffect(() => {
    localStorage.setItem("preferences", JSON.stringify(preferences));
  }, [preferences]);

  // Helper function to handle preference changes
  const handlePreferenceChange =
    (key: keyof typeof preferences) => (checked: boolean) => {
      setPreferences((prev: any) => ({ ...prev, [key]: checked }));
    };

  // Helper function to add a user point
  const handleAddUPoint = () => {
    if (inp.trim().length > 0) {
      const tuple = parseLocationToTuple(inp);
      if (tuple) {
        setUPoints((o) => [...o, tuple]);
        setInp("");
      }
    }
  };

    useEffect(() => {
    localStorage.setItem("preferences", JSON.stringify(preferences));
  }, [preferences]);

  useEffect(() => {
    const containerElement = mapContainerRef.current;
    if (!containerElement) return;

    const observer = new ResizeObserver((entries) => {
      if (entries[0]) {
        const newWidth = entries[0].contentRect.width; // Use contentRect for width without padding/border
        setMapDisplayWidth(newWidth);
        // Optional: if height also needs to be dynamic
        // const newHeight = entries[0].contentRect.height;
        // setMapDisplayHeight(newHeight);
      }
    });

    observer.observe(containerElement);
    // Set initial size
    setMapDisplayWidth(containerElement.clientWidth); // clientWidth is content + padding
    // Optional: if height also needs to be dynamic
    // setMapDisplayHeight(containerElement.clientHeight);

    return () => {
      if (containerElement) {
        observer.unobserve(containerElement);
      }
      observer.disconnect();
    };
  }, []);

  // Base properties for map images
  const baseImageDimensions = { width: 1234, height: 1234 };
  const defaultMapLayerProps = { ...baseImageDimensions, lat: 0, long: 57 };

  return (
    <SidebarProvider className="flex relative">
      <Sidebar className="border-r-[#303849]">
        <SidebarHeader>Cordex</SidebarHeader>
        <SidebarContent className="gap-0">
          <SidebarGroup>
            <div className="flex flex-col items-center text-white bg-[#303849] p-3 rounded-xl gap-3 w-full">
              <div className="flex gap-2 items-center w-full">
                <Trash2Icon
                  className="cursor-pointer border-transparent hover:border-gray-500 rounded-lg border-2 p-0"
                  onClick={() => setUPoints([])}
                  size={32}
                />
                <input
                  value={inp}
                  className="border-1 text-white p-2 rounded-lg bg-[#262b37] w-full"
                  placeholder="Lat, Long, Alt"
                  onChange={(v) => setInp(v.target.value)}
                  onKeyUp={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddUPoint();
                    }
                  }}
                />
                <ArrowRightIcon
                  className="w-8 h-8 cursor-pointer border-transparent hover:border-gray-500 rounded-lg border-2 px-0"
                  onClick={handleAddUPoint}
                />
              </div>

              {[...UPoints].reverse().map((p, index) => (
                <button
                  key={`${p.lat}-${p.long}-${index}-${
                    UPoints.length - 1 - index
                  }`} // Ensure key is unique upon deletion
                  onClick={() => {
                    const originalIndex = UPoints.length - 1 - index;
                    setUPoints((prevUPoints) =>
                      prevUPoints.filter((_, i) => i !== originalIndex)
                    );
                  }}
                  className="text-white bg-red-500 hover:bg-red-700 p-1 px-2 rounded"
                >
                  ({p.lat.toFixed(2)}, {p.long.toFixed(2)}){" "}
                  <X size={16} className="inline" />
                </button>
              ))}
            </div>
          </SidebarGroup>
          <SidebarGroup>
            <Accordion
              type="single"
              collapsible
              className="w-full bg-[#303849] rounded-xl px-3"
            >
              <AccordionItem value="prefs" className="border-b-0">
                <AccordionTrigger className="hover:cursor-pointer">
                  <h1 className="flex items-center text-md font-bold gap-2">
                    <Settings /> Preferences
                  </h1>
                </AccordionTrigger>
                <AccordionContent className="flex flex-col gap-1">
                  <div className="mb-2">
                    <h1 className="mb-1">Map Style</h1>
                    <RadioGroup
                      value={preferences.mapStyle}
                      className="gap-0 pl-2"
                      onValueChange={(value) =>
                        setPreferences((prev: any) => ({
                          ...prev,
                          mapStyle: value,
                        }))
                      }
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="vuln" id="option-one" />
                        <Label htmlFor="option-one">Vulnona</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="iml" id="option-two" />
                        <Label htmlFor="option-two">IsleMaps (Light)</Label>
                      </div>
                    </RadioGroup>
                  </div>
                  <Toggle
                    name="Gridlines"
                    checked={preferences.gridlines}
                    setChecked={handlePreferenceChange("gridlines")}
                  >
                    <Grid />
                  </Toggle>
                  <Toggle
                    name="Location Labels"
                    checked={preferences.locationLabels}
                    setChecked={handlePreferenceChange("locationLabels")}
                  >
                    <MapPin />
                  </Toggle>
                  <Toggle
                    name="Mud"
                    checked={preferences.mudOverlay}
                    setChecked={handlePreferenceChange("mudOverlay")}
                  >
                    <Bubbles />
                  </Toggle>
                  <Toggle
                    name="Sanctuaries"
                    checked={preferences.sanctuaryOverlay}
                    setChecked={handlePreferenceChange("sanctuaryOverlay")}
                  >
                    <Tent />
                  </Toggle>
                  <Toggle
                    name="Migration Zones"
                    checked={preferences.migrationOverlay}
                    setChecked={handlePreferenceChange("migrationOverlay")}
                  >
                    <PawPrint />
                  </Toggle>
                  <Toggle
                    name="Structures"
                    checked={preferences.structureOverlay}
                    setChecked={handlePreferenceChange("structureOverlay")}
                  >
                    <Building2 />
                  </Toggle>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </SidebarGroup>
          <SidebarGroup>
            <AccordionForce
              type="single"
              collapsible
              className="w-full bg-[#303849] rounded-xl"
            >
              <AccordionItemForce value="cor">
                <AccordionTriggerForce className="bg-[#303849] px-3 rounded-xl hover:cursor-pointer">
                  <div className="flex items-center text-md font-bold gap-2">
                    <FlaskConicalIcon /> Cordex
                  </div>
                </AccordionTriggerForce>
                <AccordionContentForce className="pb-1">
                  <LiveNumericScreenOCR
                    numberTuples={CPoints}
                    setNumberTuples={setCPoints}
                  />
                  <p className="px-2 mt-1 w-full text-center">
                    {CPoints.length > 0
                      ? `${CPoints[0].lat.toFixed(
                          2
                        )}, ${CPoints[0].long.toFixed(2)}`
                      : ""}
                  </p>
                </AccordionContentForce>
              </AccordionItemForce>
            </AccordionForce>
          </SidebarGroup>
        </SidebarContent>
        <SidebarTrigger className="border-[#303849] text-white bg-[#202632] border-1 ml-2 mt-2 absolute -right-9">
          <SidebarIcon />
        </SidebarTrigger>
      </Sidebar>

      <div
        className="flex-1 grow"
        ref={mapContainerRef}
      >
        <MapComponent
          images={[
            preferences.mapStyle === "iml"
              ? { url: "map-light.png", ...defaultMapLayerProps }
              : { url: "realmap.png", ...baseImageDimensions, lat: 2, long: 2 },
            { url: "water.png", ...defaultMapLayerProps },
            ...(preferences.mudOverlay
              ? [{ url: "mudOverlay.png", ...defaultMapLayerProps }]
              : []),
            ...(preferences.sanctuaryOverlay
              ? [{ url: "sanctuaries.png", ...defaultMapLayerProps }]
              : []),
            ...(preferences.structureOverlay
              ? [{ url: "structures.png", ...defaultMapLayerProps }]
              : []),
            ...(preferences.migrationOverlay
              ? [{ url: "migration.png", ...defaultMapLayerProps }]
              : []),
          ]}
          doDrawGrid={preferences.gridlines}
          initialHeight={window.innerHeight}
          initialWidth={
            mapDisplayWidth
          }
          paths={[
            { path: CPoints, enabled: true, color: "black" },
            { path: UPoints, enabled: true },
          ]}
          texts={
            preferences.locationLabels
              ? [
                  { text: "South Plains", lat: 210, long: -215, size: 13 },
                  { text: "West Rail", lat: 30, long: -281, size: 13 },
                  { text: "West Access", lat: -112, long: -360, size: 13 },
                  { text: "Highlands", lat: -78, long: -80, size: 13 },
                  { text: "Water Access", lat: -219, long: 93, size: 13 },
                  { text: "N.W. Ridge", lat: -260, long: -140, size: 13 },
                  { text: "Northern Jungle", lat: -318, long: 160, size: 13 },
                  { text: "North Lake", lat: -370, long: 325, size: 13 },
                  { text: "East Lake", lat: -136, long: 445, size: 13 },
                  { text: "East Coast", lat: -92, long: 541, size: 13 },
                  { text: "Swamps", lat: 294, long: 54, size: 13 },
                  { text: "Jungle I Sector", lat: -31, long: 85, size: 13 },
                ]
              : []
          }
        />
      </div>
    </SidebarProvider>
  );
}

export default App;
