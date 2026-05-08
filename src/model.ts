import type { CarryResourceKind } from "./gameConfig.ts";

export type Vec3 = {
  x: number;
  y: number;
  z: number;
};

export type ResourceKind = CarryResourceKind | "shop" | "save";
export type BiomeKind = "sea" | "green" | "desert" | "radioactive";

export type Resource = {
  n: number;
  pos: Vec3;
  size: number;
  kind: ResourceKind;
};

export type ProjectedResource = Resource & {
  depth: number;
  x: number;
  y: number;
};

export type Enemy = {
  id: number;
  pos: Vec3;
  size: number;
};

export type Shot = {
  pos: Vec3;
  direction: Vec3;
  ttl: number;
};

export type Explosion = {
  pos: Vec3;
  age: number;
  ttl: number;
};

export type ProjectedEnemy = Enemy & {
  depth: number;
  x: number;
  y: number;
};

export type ProjectedShot = Shot & {
  depth: number;
  x: number;
  y: number;
};

export type ProjectedExplosion = Explosion & {
  depth: number;
  x: number;
  y: number;
};

export type RadarObject = {
  kind: ResourceKind | "enemy";
  pos: Vec3;
};

export type RadarKind = RadarObject["kind"];
export type RestorePhase = "idle" | "collapse" | "expand";

export type ShopButton = {
  action: "buy-life" | "buy-energy" | "buy-gold" | "buy-radar" | "close";
  x: number;
  y: number;
  width: number;
  height: number;
};

export type RadarFilterButton = {
  kind: RadarKind;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type SavePromptButton = {
  action: "save-confirm" | "save-cancel";
  x: number;
  y: number;
  width: number;
  height: number;
};

export type SaveState = {
  resourceId: number | null;
  pos: Vec3;
  resources: Record<CarryResourceKind, number>;
  capacity: Record<CarryResourceKind, number>;
  capacityPurchases: Record<CarryResourceKind, number>;
  lifeDrainTimer: number;
  distRadar: number;
  radarPurchases: number;
};

export type PixelSprite = {
  rows: string[];
  palette: Record<string, string>;
};

export type PixelTextPattern = string[];
