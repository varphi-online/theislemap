import { useEffect, useRef, useState } from "react";

import {
  ArrowRightIcon,
  FlaskConicalIcon,
  SidebarIcon,
  Trash2Icon,
  X,
} from "lucide-react";
import { Switch } from "./components/ui/switch";
import Map from "./components/map/Map";
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
import { RadioGroup, RadioGroupItem } from "@radix-ui/react-radio-group";
import { Label } from "@radix-ui/react-label";
import {
  AccordionContent,
  Accordion,
  AccordionItem,
  AccordionTrigger,
} from "./components/ui/accordion";

function parseLocationToTuple(inputStr: string): Location | null {
  if (typeof inputStr !== "string" || !(inputStr = inputStr.trim())) {
    return null;
  }

  const parseFloatClean = (s: string) => parseFloat(s.replace(/,/g, ""));
  let match, lat, lon;

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

  match = inputStr.match(/^(-?\d+)\,\s*(-?\d+)$/);
  if (
    match &&
    !isNaN((lat = parseInt(match[1], 10))) &&
    !isNaN((lon = parseInt(match[3], 10)))
  ) {
    return { lat: lat, long: lon };
  }

  return null;
}

function App() {
  const [UPoints, setUPoints] = useState<Location[]>([]);
  const [CPoints, setCPoints] = useState<Location[]>([]);
  const [inp, setInp] = useState("");
  const [first, setFirst] = useState(true);
  const [canvasWidth, setCanvasWidth] = useState(1000);
  const [mapStyle, setMapStyle] = useState("iml");

  const canvasContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleResize = () => {
      setCanvasWidth(
        window.innerHeight < window.innerWidth
          ? window.innerHeight
          : window.innerWidth
      );
    };

    window.addEventListener("resize", handleResize);

    handleResize();
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  useEffect(() => {
    if (first && CPoints.length > 0) {
      setFirst(false);
    }
  }, [CPoints]);

  return (
    <SidebarProvider className="flex">
      <Sidebar>
        <SidebarHeader>Cordex</SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <div className="flex flex-col items-center text-white bg-[#303849] p-3 rounded-xl gap-3 w-full">
              <div className="flex gap-2 items-center w-full">
                <Trash2Icon
                  className="w-8 h-8 cursor-pointer border-transparent hover:border-gray-500 rounded-lg border-2 p-1"
                  onClick={() => setUPoints([])}
                />
                <input
                  value={inp}
                  className="border-1 text-white p-2 rounded-lg bg-[#262b37] w-full"
                  placeholder="Lat, Long, Alt"
                  onChange={(v) => {
                    setInp(v.target.value);
                  }}
                  onKeyUp={(e) => {
                    e.preventDefault();
                    if (e.key == "Enter") {
                      const tuple = parseLocationToTuple(inp);
                      if (tuple) {
                        setUPoints((o) => [...o, tuple]);
                        setInp("");
                      }
                    }
                  }}
                />
                <ArrowRightIcon
                  className="w-8 h-8 cursor-pointer border-transparent hover:border-gray-500 rounded-lg border-2 p-1"
                  onClick={() => {
                    if (inp.length > 1) {
                      const tuple = parseLocationToTuple(inp);
                      if (tuple) {
                        setUPoints((o) => [...o, tuple]);
                        setInp("");
                      }
                    }
                    setInp("");
                  }}
                />
              </div>

              {[...UPoints].reverse().map((p, index) => {
                // Added index for a more robust key
                return (
                  <button
                    key={`${p.lat}-${p.long}-${index}`} // Using a more unique key
                    onClick={() => {
                      // Create a new array without the point to be deleted
                      const newUPoints = UPoints.filter(
                        (point) => point.lat !== p.lat || point.long !== p.long
                      );
                      // Update the state with the new array
                      setUPoints(newUPoints);
                    }}
                    className="text-white bg-red-500 hover:bg-red-700 p-1 px-2 rounded" // Added some styling for visibility
                  >
                    ({p.lat.toFixed(2)}, {p.long.toFixed(2)}){" "}
                    <X size={16} className="inline" /> {/* Added an X icon */}
                  </button>
                );
              })}
            </div>
          </SidebarGroup>
          <SidebarGroup>
            <Accordion
              type="single"
              collapsible
              className="w-ful bg-[#303849] rounded-xl"
            >
              <AccordionItem value="cor">
                <AccordionTrigger className="bg-[#303849] px-2 rounded-xl">
                  <div className="flex items-center gap-2">
                    Cordex <FlaskConicalIcon size={20} />
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pb-1">
                  <LiveNumericScreenOCR
                    numberTuples={CPoints}
                    setNumberTuples={setCPoints}
                  />
                  <p className="px-2 mt-1 w-full text-center">
                    {CPoints.length > 0 ? CPoints[0].lat.toFixed(2) + ", " : ""}{" "}
                    {CPoints.length > 0 ? CPoints[0].long.toFixed(2) : ""}
                  </p>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </SidebarGroup>
          <SidebarGroup>
            <h1>Map Style</h1>
            <RadioGroup
              defaultValue="iml"
              value={mapStyle}
              onValueChange={setMapStyle}
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
          </SidebarGroup>
          <SidebarGroup>
            <div className="flex items-end">
              Gridlines
              <Switch />
            </div>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>
      <SidebarTrigger>
        <SidebarIcon />
      </SidebarTrigger>
      <div
        className="flex justify-center w-full items-center flex-col"
        ref={canvasContainerRef}
      >
        <Map
          images={[
            mapStyle === "iml"
              ? {
                  url: "map-light.png",
                  lat: 0,
                  long: 57,
                  width: 1234,
                  height: 1234,
                }
              : {
                  url: "realmap.png",
                  lat: 2,
                  long: 2,
                  width: 1234,
                  height: 1234,
                },
            { url: "water.png", lat: 0, long: 57, width: 1234, height: 1234 },
          ]}
          initialHeight={window.innerHeight}
          initialWidth={
            window.innerWidth -
            (window.innerHeight <= window.innerWidth ? 320 : 0)
          }
          paths={[
            { path: CPoints, enabled: true, color: "black" },
            { path: UPoints, enabled: true },
          ]}
          texts={[{ text: "South Plains", lat: 210, long: -215, size: 13 }]}
        />
      </div>
    </SidebarProvider>
  );
}

export default App;
