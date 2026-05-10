import type { CarryResourceKind, EnemyCategoryId } from "./gameConfig.ts";
export type { BiomeKind } from "./gameConfig.ts";

export type Vec3 = {
  x: number;
  y: number;
  z: number;
};

export type ResourceKind = CarryResourceKind | "shop" | "save" | "shipPart";

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
  categoryId: EnemyCategoryId;
  pos: Vec3;
  size: number;
  spawnTimer: number;
  shotTimer: number;
  exploreTimer: number;
  exploreTarget?: Vec3;
  spawnedById?: number;
};

export type Shot = {
  pos: Vec3;
  direction: Vec3;
  ttl: number;
};

export type EnemyShot = Shot & {
  ownerId: number;
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

export type ProjectedEnemyShot = EnemyShot & {
  depth: number;
  x: number;
  y: number;
};

export type ProjectedExplosion = Explosion & {
  depth: number;
  x: number;
  y: number;
};

export type EnemyRadarKind = `enemy:${EnemyCategoryId}`;
export type RadarKind = ResourceKind | "baseShip" | EnemyRadarKind;

export type RadarObject = {
  kind: RadarKind;
  pos: Vec3;
};

export type RestorePhase = "idle" | "collapse" | "expand";

export type ShopButton = {
  action: "buy-life" | "buy-energy" | "buy-gold" | "buy-radar" | "buy-detector" | "buy-speed" | "close";
  x: number;
  y: number;
  width: number;
  height: number;
};

export type RadarFilterButton = {
  action: "toggle-panel" | "toggle-kind" | "disable-all";
  kind?: RadarKind;
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

export type HelpButton = {
  action: "open-help" | "close-help" | "lang-fr" | "lang-en";
  x: number;
  y: number;
  width: number;
  height: number;
};

export type WeaponButton = {
  action: "toggle-panel" | "toggle-detector";
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
  savePurchases: number;
  shipPartsCollected: number;
  shipPartsInstalled: number;
  detectorRange: number;
  detectorUpgradePurchases: number;
  detectorEnabled: boolean;
  detectorKills: number;
  speed: number;
  speedUpgradePurchases: number;
};

export type PixelSprite = {
  rows: string[];
  palette: Record<string, string>;
};

export type PixelTextPattern = string[];
