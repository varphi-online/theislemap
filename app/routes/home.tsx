import type { Route } from "./+types/home";
import ImageOverlayCanvas from "~/components/ImageOverlayCanvas";
import { useEffect, useState } from "react";
import LiveNumericScreenOCR from "~/components/LiveNumericScreenOCR";

import { ArrowRightIcon, Cpu, FlaskConicalIcon, Trash2Icon, X } from "lucide-react";
import { Switch } from "~/components/ui/switch";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "New React Router App" },
    { name: "description", content: "Welcome to React Router!" },
  ];
}

export default function Home() {
  const [UPoints, setUPoints] = useState<Array<[number, number]>>([]);
  const [CPoints, setCPoints] = useState<Array<[number, number]>>([]);
  const [inp, setInp] = useState("");
  const [first, setFirst] = useState(true);
  const [canvasWidth, setCanvasWidth] = useState(1000);
  const [cordex, setCordex] = useState(false);
  const [cordexEnabled, setCordexEnabled] = useState(false);
  useEffect(() => {
    // Ensure this code runs only in the browser

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

  useEffect(()=>{
    if(first&&CPoints.length>0){
      setFirst(false)
      setCordexEnabled(true)
    }
  },[CPoints])

  return (
    <div className="">
      <div className="flex justify-center items-center flex-col lg:flex-row gap-10">
        <div className="flex flex-col items-center text-white bg-[#303849] p-3 rounded-xl gap-3">
          <div className="flex justify-between w-full min-w-70 gap-8 items-center">
            <p>Traditional</p>
            <Switch
              // style={{ transform: "translateX(-25%)" }}
              checked={cordexEnabled}
              onCheckedChange={setCordexEnabled}
            />
            <p>Cordex</p>
          </div>
          {!cordexEnabled && (
            <div className="flex gap-2 items-center">
              <Trash2Icon 
              className="w-8 h-8 cursor-pointer border-transparent hover:border-gray-500 rounded-lg border-2 p-1" 
              onClick={()=>setUPoints([])}
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
                if (e.key == "Enter") {
                setUPoints((o) => [
                  ...o,
                  (() => {
                  let coords = inp.split(", ");
                  return [parseFloat(coords[1]), parseFloat(coords[0])];
                  })(),
                ]);
                setInp("");
                }
              }}
              />
              <ArrowRightIcon className="w-8 h-8 cursor-pointer border-transparent hover:border-gray-500 rounded-lg border-2 p-1" onClick={()=>{
                if (inp.length>1){
                setUPoints((o) => [
                  ...o,
                  (() => {
                  let coords = inp.split(", ");
                  return [parseFloat(coords[1]), parseFloat(coords[0])];
                  })(),
                ])};
                setInp("");
              }}/>
            </div>
          )}

          {!cordexEnabled ? (
            [...UPoints].reverse().map((p, index) => {
              // Added index for a more robust key
              return (
                <button
                  key={`${p[0]}-${p[1]}-${index}`} // Using a more unique key
                  onClick={() => {
                    // Create a new array without the point to be deleted
                    const newUPoints = UPoints.filter(
                      (point) => point[0] !== p[0] || point[1] !== p[1]
                    );
                    // Update the state with the new array
                    setUPoints(newUPoints);
                  }}
                  className="text-white bg-red-500 hover:bg-red-700 p-1 px-2 rounded" // Added some styling for visibility
                >
                  ({p[0]}, {p[1]}) <X size={16} className="inline" />{" "}
                  {/* Added an X icon */}
                </button>
              );
            })
          ) : (
            <p>
              {CPoints.length > 0 ? CPoints[0][0].toFixed(2) : ""},{" "}
              {CPoints.length > 0 ? CPoints[0][1].toFixed(2) : ""}
            </p>
          )}
        </div>
        <ImageOverlayCanvas
          imageUrls={["map-light.png", "water.png"]}
          imageWorldWidth={1346}
          initialHeight={canvasWidth}
          initialWidth={canvasWidth}
          points={cordexEnabled ? CPoints : UPoints}
        />
        <button
          className="text-white flex gap-2 border-2 border-gray-800 hover:border-white cursor-pointer p-2 rounded-md"
          onClick={() => setCordex(true)}
        >
          Activate Cordex <FlaskConicalIcon />
        </button>

        <div
          className={`absolute left-0 top-0 w-[100vw] h-[100vh] ${
            cordex ? "visible" : "hidden"
          }`}
        >
          <X
            className="absolute right-4 top-4 z-[999] border-transparent hover:border-gray-500 border-2 rounded-md cursor-pointer"
            onClick={() => setCordex(false)}
          />
          <LiveNumericScreenOCR
            numberTuples={CPoints}
            setNumberTuples={setCPoints}
          />
        </div>
      </div>
    </div>
  );
}
