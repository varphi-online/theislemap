import type { Route } from "./+types/home";
// import { Welcome } from "../welcome/welcome"; // Assuming this was for an example, remove if not used
import ImageOverlayCanvas from "~/components/ImageOverlayCanvas";
import { useEffect, useState } from "react";
import LiveNumericScreenOCR from "~/components/LiveNumericScreenOCR";

import {
  ArrowRightIcon,
  Cpu, // Assuming Cpu was for an example, remove if not used
  FlaskConicalIcon,
  Trash2Icon,
  X,
} from "lucide-react";
import { Switch } from "~/components/ui/switch";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "New React Router App" },
    { name: "description", content: "Welcome to React Router!" },
  ];
}

// Define a consistent size for SSR or as a fallback before client dimensions are known
const SSR_FALLBACK_CANVAS_SIZE = 1000; // Or any other suitable default

export default function Home() {
  const [UPoints, setUPoints] = useState<Array<[number, number]>>([]);
  const [CPoints, setCPoints] = useState<Array<[number, number]>>([]);
  const [inp, setInp] = useState("");
  const [first, setFirst] = useState(true);
  // Store canvas size as an object, initialize to null to indicate it's not yet determined client-side
  const [canvasDimensions, setCanvasDimensions] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [cordex, setCordex] = useState(false);
  const [cordexEnabled, setCordexEnabled] = useState(false);

  useEffect(() => {
    // This effect runs only on the client
    const handleResize = () => {
      const size =
        window.innerHeight < window.innerWidth
          ? window.innerHeight
          : window.innerWidth;
      // Ensure a minimum practical size
      const practicalSize = Math.max(300, size * 0.9); // Example: 90% of smaller dimension, min 300px
      setCanvasDimensions({ width: practicalSize, height: practicalSize });
    };

    handleResize(); // Set initial size on client mount
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []); // Empty dependency array ensures this runs once on mount and cleans up on unmount

  useEffect(() => {
    if (first && CPoints.length > 0) {
      setFirst(false);
      setCordexEnabled(true);
    }
  }, [CPoints, first]); // Added 'first' to dependency array

  return (
    <div className="">
      <div className="flex justify-center items-center flex-col lg:flex-row gap-10 p-4">
        <div className="flex flex-col items-center text-white bg-[#303849] p-3 rounded-xl gap-3">
          <div className="flex justify-between w-full min-w-70 gap-8 items-center">
            <p>Traditional</p>
            <Switch
              checked={cordexEnabled}
              onCheckedChange={setCordexEnabled}
            />
            <p>Cordex</p>
          </div>
          {!cordexEnabled && (
            <div className="flex gap-2 items-center">
              <Trash2Icon
                className="w-8 h-8 cursor-pointer border-transparent hover:border-gray-500 rounded-lg border-2 p-1"
                onClick={() => setUPoints([])}
              />
              <input
                value={inp}
                className="border-1 text-white p-2 rounded-lg bg-[#262b37]"
                placeholder="LAT, LONG, ALT"
                onChange={(v) => {
                  setInp(v.target.value);
                }}
                onKeyUp={(e) => {
                  e.preventDefault();
                  if (e.key === "Enter" && inp.trim() !== "") {
                    const coords = inp.split(",").map((s) => parseFloat(s.trim()));
                    if (coords.length >= 2 && !isNaN(coords[0]) && !isNaN(coords[1])) {
                      setUPoints((o) => [...o, [coords[1], coords[0]]]);
                    }
                    setInp("");
                  }
                }}
              />
              <ArrowRightIcon
                className="w-8 h-8 cursor-pointer border-transparent hover:border-gray-500 rounded-lg border-2 p-1"
                onClick={() => {
                  if (inp.trim() !== "") {
                    const coords = inp.split(",").map((s) => parseFloat(s.trim()));
                     if (coords.length >= 2 && !isNaN(coords[0]) && !isNaN(coords[1])) {
                       setUPoints((o) => [...o, [coords[1], coords[0]]]);
                     }
                    setInp("");
                  }
                }}
              />
            </div>
          )}

          {!cordexEnabled
            ? [...UPoints].reverse().map((p, index) => (
                <button
                  key={`${p[0]}-${p[1]}-${index}`}
                  onClick={() => {
                    setUPoints((prevUPoints) =>
                      prevUPoints.filter(
                        (point, i) =>
                          !(point[0] === p[0] && point[1] === p[1] && i === UPoints.length - 1 - index)
                      ),
                    );
                  }}
                  className="text-white bg-red-500 hover:bg-red-700 p-1 px-2 rounded"
                >
                  ({p[0]}, {p[1]}) <X size={16} className="inline" />
                </button>
              ))
            : CPoints.length > 0 && (
                <p>
                  {CPoints[0][0].toFixed(2)}, {CPoints[0][1].toFixed(2)}
                </p>
              )}
        </div>

        {/* Container for the canvas with fallback dimensions for SSR */}
        <div
          style={{
            width: canvasDimensions
              ? canvasDimensions.width
              : SSR_FALLBACK_CANVAS_SIZE,
            height: canvasDimensions
              ? canvasDimensions.height
              : SSR_FALLBACK_CANVAS_SIZE,
          }}
        >
          {canvasDimensions ? ( // Only render ImageOverlayCanvas when dimensions are known client-side
            <ImageOverlayCanvas
              imageUrls={["map-light.png", "water.png"]}
              imageWorldWidth={1346}
              initialHeight={canvasDimensions.height}
              initialWidth={canvasDimensions.width}
              points={cordexEnabled ? CPoints : UPoints}
            />
          ) : (
            // Placeholder for SSR and initial client render before dimensions are set
            <div
              style={{
                width: "100%",
                height: "100%",
                border: "1px solid black",
                backgroundColor: "#262b37",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "white",
              }}
            >
              Loading Map...
            </div>
          )}
        </div>

        <button
          className="text-white flex gap-2 border-2 border-gray-800 hover:border-white cursor-pointer p-2 rounded-md"
          onClick={() => setCordex(true)}
        >
          Activate Cordex <FlaskConicalIcon />
        </button>

        <div
          className={`fixed inset-0 bg-gray-900 bg-opacity-75 z-50 ${
            cordex ? "visible" : "hidden"
          }`} // Using fixed and inset-0 for full screen overlay
        >
          <div className="relative bg-white w-full h-full overflow-auto">
            {" "}
            {/* Container for OCR content */}
            <X
              className="absolute right-4 top-4 z-[999] border-transparent hover:border-gray-500 border-2 rounded-md cursor-pointer text-black"
              onClick={() => setCordex(false)}
              size={32}
            />
            {cordex && ( // Conditionally render to ensure Tesseract only loads when needed
                <LiveNumericScreenOCR
                numberTuples={CPoints}
                setNumberTuples={setCPoints}
                />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}