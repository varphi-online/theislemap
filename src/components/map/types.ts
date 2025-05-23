import type { CSSProperties } from "react";

export interface MapImage {
    url: string;
    lat: number;
    long: number;
    width: number; //units
    height: number;//units
}

export interface MapText {
    text: string;
    lat: number;
    long: number;
    size: number;
}

export interface Location {
    lat: number;
    long: number;
}

export type Path = {path: Location[], enabled: boolean, color?: CSSProperties["color"]}