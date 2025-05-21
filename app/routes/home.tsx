import type { Route } from "./+types/home";
import { Welcome } from "../welcome/welcome";
import ImageOverlayCanvas from "~/components/ImageOverlayCanvas";
import { useState } from "react";
import LiveNumericScreenOCR from "~/components/LiveNumericScreenOCR";

export function meta({ }: Route.MetaArgs) {
  return [
    { title: "New React Router App" },
    { name: "description", content: "Welcome to React Router!" },
  ];
}

export default function Home() {

  const [UPoints, setUPoints] = useState<Array<[number, number]>>([]);
  const [inp, setInp] = useState("");

  return <div className="flex">
    <div>
    <ImageOverlayCanvas imageUrls={["map-light.png", "water.png"]} imageWorldWidth={1346} initialHeight={700} initialWidth={700} points={UPoints} />
    <input value={inp}
    onChange={v=>{setInp(v.target.value)}}
    onKeyUp={e => {
      e.preventDefault();
      if(e.key == "Enter"){
      setUPoints(o => [...o, (() => {
        let coords = inp.split(", ");
        return [parseFloat(coords[1]), parseFloat(coords[0])]
      })()])
      setInp("")
    }}} />
    {JSON.stringify(UPoints)}
    </div>
    <LiveNumericScreenOCR numberTuples={UPoints} setNumberTuples={setUPoints}/>
</div>;
}
