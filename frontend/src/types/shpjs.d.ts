// shpjs ships no type declarations: the one function used here.
declare module 'shpjs' {
  export function getShapefile(parts: { shp: ArrayBuffer; dbf?: ArrayBuffer; cpg?: string; prj?: string }): Promise<GeoJSON.FeatureCollection | GeoJSON.FeatureCollection[]>
}
