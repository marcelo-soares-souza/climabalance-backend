import { fromUrl } from "geotiff";
import sharp from "sharp";
import proj4 from "proj4";

export interface StacScene {
  id: string;
  collection: string;
  datetime: string;
  cloudCover: number | null;
  assets: Record<string, { href: string; type?: string; title?: string }>;
}

export interface SearchParams {
  lat: number;
  lng: number;
  startDate: string;
  endDate: string;
  maxCloud: number;
}

export interface ProcessedImage {
  bytes: Uint8Array;
  mimeType: string;
  isFallback: boolean;
}

interface PixelWindow {
  window: [number, number, number, number];
  tileWidth: number;
  tileHeight: number;
}

function isUtmProjection(originX: number): boolean {
  return Math.abs(originX) > 180;
}

function transformToUtm(bbox: {
  west: number;
  south: number;
  east: number;
  north: number;
}): { west: number; south: number; east: number; north: number } {
  const lat = (bbox.south + bbox.north) / 2;
  const lng = (bbox.west + bbox.east) / 2;
  const zone = Math.floor((lng + 180) / 6) + 1;
  const southFlag = lat >= 0 ? "" : " +south";
  const def = `+proj=utm +zone=${zone}${southFlag} +datum=WGS84 +units=m +no_defs`;

  const sw = proj4(def, [bbox.west, bbox.south]);
  const se = proj4(def, [bbox.east, bbox.south]);
  const nw = proj4(def, [bbox.west, bbox.north]);
  const ne = proj4(def, [bbox.east, bbox.north]);

  return {
    west: Math.min(sw[0], se[0], nw[0], ne[0]),
    south: Math.min(sw[1], se[1], nw[1], ne[1]),
    east: Math.max(sw[0], se[0], nw[0], ne[0]),
    north: Math.max(sw[1], se[1], nw[1], ne[1]),
  };
}

function calculatePixelWindow(
  image: import("geotiff").GeoTIFFImage,
  bbox: { west: number; south: number; east: number; north: number },
): PixelWindow {
  const originX = image.getOrigin()[0];
  const originY = image.getOrigin()[1];
  const resX = image.getResolution()[0];
  const resY = image.getResolution()[1];
  const width = image.getWidth();
  const height = image.getHeight();

  let west = bbox.west;
  let east = bbox.east;
  let south = bbox.south;
  let north = bbox.north;

  if (isUtmProjection(originX)) {
    const utm = transformToUtm(bbox);
    west = utm.west;
    east = utm.east;
    south = utm.south;
    north = utm.north;
  }

  const absResY = Math.abs(resY);

  const pxMinX = Math.max(0, Math.floor((west - originX) / resX));
  const pxMaxX = Math.min(width, Math.ceil((east - originX) / resX));

  let pxMinY: number;
  let pxMaxY: number;

  if (resY < 0) {
    pxMinY = Math.max(0, Math.floor((originY - north) / absResY));
    pxMaxY = Math.min(height, Math.ceil((originY - south) / absResY));
  } else {
    pxMinY = Math.max(0, Math.floor((south - originY) / absResY));
    pxMaxY = Math.min(height, Math.ceil((north - originY) / absResY));
  }

  const tileWidth = pxMaxX - pxMinX;
  const tileHeight = pxMaxY - pxMinY;

  return { window: [pxMinX, pxMinY, pxMaxX, pxMaxY], tileWidth, tileHeight };
}

const SENTINEL_COLLECTION = "sentinel-2-l2a";
const LANDSAT_COLLECTION = "landsat-c2l2";
const STAC_URL = "https://earth-search.aws.element84.com/v1/search";

export async function searchStacScenes(
  params: SearchParams,
): Promise<StacScene[]> {
  const datetime = `${params.startDate}T00:00:00Z/${params.endDate}T23:59:59Z`;

  const body = {
    collections: [SENTINEL_COLLECTION],
    limit: 50,
    intersects: {
      type: "Point",
      coordinates: [params.lng, params.lat],
    },
    query: { "eo:cloud_cover": { lt: params.maxCloud } },
    datetime,
    sortby: [{ field: "properties.eo:cloud_cover", direction: "asc" }],
  };

  const res = await fetch(STAC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`STAC search failed: ${res.status}`);
  }

  const data = (await res.json()) as {
    features?: Array<{
      id: string;
      collection: string;
      properties: { datetime: string; "eo:cloud_cover"?: number };
      assets: Record<string, { href: string; type?: string; title?: string }>;
    }>;
  };

  if (!data.features || data.features.length === 0) return [];

  return data.features.map((f) => ({
    id: f.id,
    collection: f.collection,
    datetime: f.properties.datetime,
    cloudCover: f.properties["eo:cloud_cover"] ?? null,
    assets: f.assets,
  }));
}

export async function searchLandsatFallback(
  params: SearchParams,
): Promise<StacScene[]> {
  const datetime = `${params.startDate}T00:00:00Z/${params.endDate}T23:59:59Z`;

  const body = {
    collections: [LANDSAT_COLLECTION],
    limit: 50,
    intersects: {
      type: "Point",
      coordinates: [params.lng, params.lat],
    },
    query: { "eo:cloud_cover": { lt: params.maxCloud } },
    datetime,
    sortby: [{ field: "properties.eo:cloud_cover", direction: "asc" }],
  };

  const res = await fetch(STAC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) return [];

  const data = (await res.json()) as {
    features?: Array<{
      id: string;
      collection: string;
      properties: { datetime: string; "eo:cloud_cover"?: number };
      assets: Record<string, { href: string; type?: string; title?: string }>;
    }>;
  };

  if (!data.features || data.features.length === 0) return [];

  return data.features.map((f) => ({
    id: f.id,
    collection: f.collection,
    datetime: f.properties.datetime,
    cloudCover: f.properties["eo:cloud_cover"] ?? null,
    assets: f.assets,
  }));
}

export function pickBestScene(scenes: StacScene[]): StacScene | null {
  if (scenes.length === 0) return null;
  return scenes.reduce((best, s) =>
    (s.cloudCover ?? 100) < (best.cloudCover ?? 100) ? s : best,
  );
}

export async function downloadRgbComposite(
  scene: StacScene,
  bbox: { west: number; south: number; east: number; north: number },
): Promise<ProcessedImage> {
  const isSentinel = scene.collection === SENTINEL_COLLECTION;

  const bandMap = isSentinel
    ? { red: "B04", green: "B03", blue: "B02" }
    : { red: "red", green: "green", blue: "nir08" };

  const bandKeys = [bandMap.red, bandMap.green, bandMap.blue] as const;
  const bandNames = ["red", "green", "blue"] as const;

  const hrefs: string[] = [];
  for (const key of bandKeys) {
    const asset = scene.assets[key];
    if (asset?.href) hrefs.push(asset.href);
  }

  if (hrefs.length < 3) {
    return downloadVisualFallback(scene, bbox);
  }

  try {
    return await composeFromBands(hrefs, bandNames, bbox);
  } catch {
    return downloadVisualFallback(scene, bbox);
  }
}

async function composeFromBands(
  hrefs: string[],
  _bandNames: readonly string[],
  bbox: { west: number; south: number; east: number; north: number },
): Promise<ProcessedImage> {
  const tiffs = await Promise.all(hrefs.map((h) => fromUrl(h)));
  const images = await Promise.all(tiffs.map((t) => t.getImage()));

  const { window, tileWidth, tileHeight } = calculatePixelWindow(
    images[0],
    bbox,
  );

  if (tileWidth <= 0 || tileHeight <= 0) {
    throw new Error("Bbox does not intersect scene");
  }

  const bandData = await Promise.all(
    images.map(async (img) => {
      const rasters = await img.readRasters({ window, samples: [0] });
      return rasters[0] as Float32Array | Uint16Array | Int16Array;
    }),
  );

  const stretched = bandData.map((data) => applyLinearStretch(data));

  const rgbBuffer = Buffer.alloc(tileWidth * tileHeight * 3);
  for (let i = 0; i < tileWidth * tileHeight; i++) {
    rgbBuffer[i * 3] = stretched[0][i];
    rgbBuffer[i * 3 + 1] = stretched[1][i];
    rgbBuffer[i * 3 + 2] = stretched[2][i];
  }

  const jpeg = await sharp(rgbBuffer, {
    raw: { width: tileWidth, height: tileHeight, channels: 3 },
  })
    .resize(1024, 1024, { fit: "outside", kernel: "lanczos3" })
    .jpeg({ quality: 85 })
    .toBuffer();

  return {
    bytes: new Uint8Array(jpeg),
    mimeType: "image/jpeg",
    isFallback: false,
  };
}

function applyLinearStretch(
  data: Float32Array | Uint16Array | Int16Array,
): Uint8Array {
  const len = data.length;
  const sorted = new Float64Array(data);
  sorted.sort();

  const minIdx = Math.floor(len * 0.02);
  const maxIdx = Math.ceil(len * 0.98);
  const minVal = sorted[minIdx];
  const maxVal = sorted[maxIdx];
  const range = maxVal - minVal;

  const result = new Uint8Array(len);
  if (range <= 0) {
    result.fill(128);
    return result;
  }

  for (let i = 0; i < len; i++) {
    const v = ((data[i] - minVal) / range) * 255;
    result[i] = Math.max(0, Math.min(255, Math.round(v)));
  }

  return result;
}

async function cropVisualGeoTiff(
  href: string,
  bbox: { west: number; south: number; east: number; north: number },
): Promise<ProcessedImage | null> {
  try {
    const tiff = await fromUrl(href);
    const image = await tiff.getImage();

    const { window, tileWidth, tileHeight } = calculatePixelWindow(image, bbox);

    if (tileWidth <= 0 || tileHeight <= 0) return null;

    const rasters = await image.readRasters({ window });

    if (rasters.length < 3) return null;

    const rgbBuffer = Buffer.alloc(tileWidth * tileHeight * 3);
    const data0 = rasters[0] as Uint8Array | Uint16Array | Float32Array;
    const data1 = rasters[1] as Uint8Array | Uint16Array | Float32Array;
    const data2 = rasters[2] as Uint8Array | Uint16Array | Float32Array;

    const isUint8 = data0 instanceof Uint8Array;
    for (let i = 0; i < tileWidth * tileHeight; i++) {
      rgbBuffer[i * 3] = isUint8 ? data0[i] : clampUint8(data0[i]);
      rgbBuffer[i * 3 + 1] = isUint8 ? data1[i] : clampUint8(data1[i]);
      rgbBuffer[i * 3 + 2] = isUint8 ? data2[i] : clampUint8(data2[i]);
    }

    const jpeg = await sharp(rgbBuffer, {
      raw: { width: tileWidth, height: tileHeight, channels: 3 },
    })
      .resize(1024, 1024, { fit: "outside", kernel: "lanczos3" })
      .jpeg({ quality: 85 })
      .toBuffer();

    return {
      bytes: new Uint8Array(jpeg),
      mimeType: "image/jpeg",
      isFallback: true,
    };
  } catch {
    return null;
  }
}

function clampUint8(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

async function downloadVisualFallback(
  scene: StacScene,
  bbox: { west: number; south: number; east: number; north: number },
): Promise<ProcessedImage> {
  const visualAsset =
    scene.assets["visual"] ?? scene.assets["rendered_preview"];

  if (!visualAsset?.href) {
    throw new Error("No visual or rendered_preview asset available");
  }

  const cropped = await cropVisualGeoTiff(visualAsset.href, bbox);
  if (cropped) return cropped;

  const res = await fetch(visualAsset.href);
  if (!res.ok) {
    throw new Error(`Failed to download visual asset: ${res.status}`);
  }

  const buffer = await res.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  let jpeg: Buffer;
  try {
    jpeg = await sharp(bytes)
      .resize(2048, 2048, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();
  } catch {
    throw new Error("Failed to decode visual asset (unsupported format)");
  }

  return {
    bytes: new Uint8Array(jpeg),
    mimeType: "image/jpeg",
    isFallback: true,
  };
}

export async function generateThumbnail(
  imageBytes: Uint8Array,
): Promise<Uint8Array> {
  const thumb = await sharp(Buffer.from(imageBytes))
    .resize(400, 400, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();
  return new Uint8Array(thumb);
}
