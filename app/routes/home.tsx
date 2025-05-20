import type { Route } from "./+types/home";
import { Welcome } from "../welcome/welcome";
import ImageOverlayCanvas from "~/components/ImageOverlayCanvas";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "New React Router App" },
    { name: "description", content: "Welcome to React Router!" },
  ];
}

export default function Home() {
  return <ImageOverlayCanvas imageUrls={["map-light.png","water.png"]} imageWorldWidth={1346} initialHeight={700} initialWidth={700} points={[[0,0],[31,42]]}/>;
}
