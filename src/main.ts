import "./styles.css";
import { gameConfig, type CarryResourceKind, type EnemyCategoryId, type EnemyConfig } from "./gameConfig.ts";
import type {
  BiomeKind,
  Enemy,
  EnemyRadarKind,
  EnemyShot,
  Explosion,
  HelpButton,
  PixelSprite,
  ProjectedEnemy,
  ProjectedEnemyShot,
  ProjectedExplosion,
  ProjectedResource,
  ProjectedShot,
  RadarFilterButton,
  RadarKind,
  RadarObject,
  Resource,
  ResourceKind,
  RestorePhase,
  SavePromptButton,
  SaveState,
  ShopButton,
  Shot,
  Vec3,
  WeaponButton,
} from "./model.ts";
import {
  baseShipSprite,
  enemySprites,
  pixelText,
  playerSprites,
  radarSkullSprite,
  resourceSprites,
  shotSprite,
} from "./sprite.ts";

const canvas = getElement<HTMLCanvasElement>("view");
const ctx = getCanvasContext(canvas);

const TAU = Math.PI * 2;
const moveStep = gameConfig.world.moveStep;
const turnStep = gameConfig.world.turnStep;
const collectionDistance = gameConfig.resources.collectionDistance;
let p: Vec3;
let forward: Vec3;
let startShipPos: Vec3;
let resources: Resource[] = [];
let enemies: Enemy[] = [];
let shots: Shot[] = [];
let enemyShots: EnemyShot[] = [];
let explosions: Explosion[] = [];
let projectileHitCooldown = 0;
let resourceCount: number = gameConfig.resources.count;
let nextEnemyId = 1;
let lastTime = 0;
let playerWalkCycle = 0;
let zoom: number = gameConfig.world.zoom;
let sphereRadiusWorld: number = gameConfig.world.sphereRadius;
let visibleRadiusWorld = 1;
let speed: number = gameConfig.world.speed;
let speedUpgradePurchases = 0;
let minimumResourceDistance: number = gameConfig.resources.minimumDistance;
let collectedResources: Record<CarryResourceKind, number> = { ...gameConfig.player.initialResources };
let resourceCapacity: Record<CarryResourceKind, number> = { ...gameConfig.player.initialCapacity };
let capacityUpgradePurchases: Record<CarryResourceKind, number> = {
  life: 0,
  energy: 0,
  gold: 0,
};
let lifeDrainTimer: number = gameConfig.biomes.green.lifeDrain.intervalFrames;
let distRadar: number = gameConfig.radar.initialRange;
let radarUpgradePurchases = 0;
let detectorRange: number = gameConfig.enemyDetector.initialRange;
let detectorUpgradePurchases = 0;
let detectorEnabled = false;
let detectorCooldown = 0;
let detectorActiveTimer = 0;
let detectorKills = 0;
let weaponOptionsOpen = false;
let weaponButtons: WeaponButton[] = [];
let savePurchases = 0;
let shipPartsCollected = 0;
let shipPartsInstalled = 0;
let shipPartInstallTimer = 0;
let lastInstalledPartIndex: number | null = null;
let gameWon = false;
let gameOver = false;
let mouseMoveTarget: Vec3 | null = null;
let mouseShotTarget: Vec3 | null = null;
let shopOpen = false;
let activeShopId: number | null = null;
let ignoredShopId: number | null = null;
let shopButtons: ShopButton[] = [];
let savePoint: Vec3 | null = null;
let saveState: SaveState | null = null;
let pendingSaveResourceId: number | null = null;
let pendingSavePoint: Vec3 | null = null;
let savePromptMessage = "";
let ignoredSaveId: number | null = null;
let savePromptButtons: SavePromptButton[] = [];
let helpOpen = false;
let uiLanguage: "fr" | "en" = "fr";
let helpButtons: HelpButton[] = [];
let radarFilters: Record<RadarKind, boolean> = {
  life: true,
  energy: true,
  gold: true,
  shop: true,
  save: true,
  shipPart: true,
  baseShip: true,
  "enemy:crawler": true,
  "enemy:spawnling": true,
  "enemy:nest": true,
  "enemy:turret": true,
};
let radarFilterButtons: RadarFilterButton[] = [];
let radarOptionsOpen = false;
let restorePhase: RestorePhase = "idle";
let restoreTimer = 0;
let visibilityScale = 1;

const pressed = new Set<string>();
const radarLabels: Record<RadarKind, string> = {
  life: "VIE",
  energy: "ENERGIE",
  gold: "OR",
  shop: "SHOP",
  save: "SAVE",
  shipPart: "PIECE",
  baseShip: "BASE",
  "enemy:crawler": "CRAWLER",
  "enemy:spawnling": "SPAWN",
  "enemy:nest": "NID",
  "enemy:turret": "TOUREL",
};

function isCarryResourceKind(kind: ResourceKind): kind is CarryResourceKind {
  return kind === "life" || kind === "energy" || kind === "gold";
}

function getEnemyRadarKind(categoryId: EnemyCategoryId): RadarKind {
  return `enemy:${categoryId}` as RadarKind;
}

function isEnemyRadarKind(kind: RadarKind): kind is EnemyRadarKind {
  return kind.startsWith("enemy:");
}

function getElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);

  if (!element) {
    throw new Error(`Missing #${id} element.`);
  }

  return element as T;
}

function getCanvasContext(target: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = target.getContext("2d");

  if (!context) {
    throw new Error("Canvas 2D context is not available.");
  }

  return context;
}

function vec(x: number, y: number, z: number): Vec3 {
  return { x, y, z };
}

function add(a: Vec3, b: Vec3): Vec3 {
  return vec(a.x + b.x, a.y + b.y, a.z + b.z);
}

function scale(a: Vec3, scalar: number): Vec3 {
  return vec(a.x * scalar, a.y * scalar, a.z * scalar);
}

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return vec(
    a.y * b.z - a.z * b.y,
    a.z * b.x - a.x * b.z,
    a.x * b.y - a.y * b.x,
  );
}

function norm(a: Vec3): Vec3 {
  const length = Math.hypot(a.x, a.y, a.z) || 1;
  return scale(a, 1 / length);
}

function rotateAroundAxis(v: Vec3, axis: Vec3, angle: number): Vec3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);

  return add(
    add(scale(v, c), scale(cross(axis, v), s)),
    scale(axis, dot(axis, v) * (1 - c)),
  );
}

function reset(): void {
  p = norm(vec(0.28, -0.18, 0.94));
  startShipPos = p;
  forward = norm(vec(0.12, 0.98, 0.15));
  forward = norm(add(forward, scale(p, -dot(forward, p))));
  createSaveState(p, null);
}

function respawnPlayer(): void {
  if (saveState) {
    collectedResources = { ...saveState.resources };
    resourceCapacity = { ...saveState.capacity };
    capacityUpgradePurchases = { ...saveState.capacityPurchases };
    lifeDrainTimer = getCurrentLifeDrainInterval();
    speed = saveState.speed;
    speedUpgradePurchases = saveState.speedUpgradePurchases;
    distRadar = saveState.distRadar;
    radarUpgradePurchases = saveState.radarPurchases;
    detectorRange = saveState.detectorRange;
    detectorUpgradePurchases = saveState.detectorUpgradePurchases;
    detectorEnabled = saveState.detectorEnabled;
    detectorKills = saveState.detectorKills;
    detectorCooldown = 0;
    detectorActiveTimer = 0;
    weaponOptionsOpen = false;
    savePurchases = saveState.savePurchases;
    shipPartsCollected = saveState.shipPartsCollected;
    shipPartsInstalled = saveState.shipPartsInstalled;
    shipPartInstallTimer = 0;
    lastInstalledPartIndex = null;
    ignoredSaveId = saveState.resourceId;
  }

  p = savePoint ?? saveState?.pos ?? p;
  forward = tangentToward(p, vec(0, 0, 1)) ?? norm(add(vec(0.12, 0.98, 0.15), scale(p, -dot(vec(0.12, 0.98, 0.15), p))));
  mouseMoveTarget = null;
  mouseShotTarget = null;
  shots = [];
  enemyShots = [];
  projectileHitCooldown = 0;
  explosions = [];
}

function startRestoreSequence(): void {
  if (restorePhase !== "idle") {
    return;
  }

  shopOpen = false;
  weaponOptionsOpen = false;
  pendingSavePoint = null;
  activeShopId = null;
  mouseMoveTarget = null;
  mouseShotTarget = null;
  pressed.clear();
  shots = [];
  enemyShots = [];
  projectileHitCooldown = 0;
  explosions.push({
    pos: p,
    age: 0,
    ttl: gameConfig.restore.playerExplosionTtl,
  });
  restorePhase = "collapse";
  restoreTimer = 0;
  visibilityScale = 1;
}

function updateRestoreSequence(dt: number): void {
  if (restorePhase === "idle") {
    return;
  }

  updateExplosions(dt);
  restoreTimer += dt;

  if (restorePhase === "collapse") {
    const progress = clamp(restoreTimer / gameConfig.restore.collapseFrames, 0, 1);
    visibilityScale = Math.max(gameConfig.restore.minVisibilityScale, 1 - progress);

    if (progress < 1) {
      return;
    }

    if (collectedResources.life <= 0) {
      gameOver = true;
      restorePhase = "idle";
      restoreTimer = 0;
      visibilityScale = 1;
      return;
    }

    respawnPlayer();
    restorePhase = "expand";
    restoreTimer = 0;
    visibilityScale = gameConfig.restore.minVisibilityScale;
    return;
  }

  const progress = clamp(restoreTimer / gameConfig.restore.expandFrames, 0, 1);
  visibilityScale = gameConfig.restore.minVisibilityScale + (1 - gameConfig.restore.minVisibilityScale) * progress;

  if (progress >= 1) {
    restorePhase = "idle";
    restoreTimer = 0;
    visibilityScale = 1;
  }
}

function createSaveState(pos: Vec3, resourceId: number | null): void {
  savePoint = pos;
  saveState = {
    resourceId,
    pos,
    resources: { ...collectedResources },
    capacity: { ...resourceCapacity },
    capacityPurchases: { ...capacityUpgradePurchases },
    lifeDrainTimer,
    distRadar,
    radarPurchases: radarUpgradePurchases,
    savePurchases,
    shipPartsCollected,
    shipPartsInstalled,
    detectorRange,
    detectorUpgradePurchases,
    detectorEnabled,
    detectorKills,
    speed,
    speedUpgradePurchases,
  };
}

function randomUnitVector(): Vec3 {
  const z = Math.random() * 2 - 1;
  const radius = Math.sqrt(1 - z * z);
  const theta = Math.random() * TAU;

  return vec(Math.cos(theta) * radius, Math.sin(theta) * radius, z);
}

function terrainNoise(pos: Vec3): number {
  return (
    Math.sin(pos.x * 7.1 + pos.y * 2.3) +
    Math.sin(pos.y * 8.7 - pos.z * 4.4) * 0.7 +
    Math.cos(pos.z * 6.2 + pos.x * 3.8) * 0.6
  ) / 2.3;
}

function getBiome(pos: Vec3): BiomeKind {
  const noise = terrainNoise(pos);

  if (noise < -0.32) {
    return "sea";
  }

  if (noise > 0.58 || (pos.z > 0.62 && noise > 0.24)) {
    return "radioactive";
  }

  if (noise > 0.18 || pos.z < -0.42) {
    return "desert";
  }

  return "green";
}

function getBiomeColor(biome: BiomeKind): string {
  return gameConfig.biomes[biome].color;
}

function getCurrentLifeDrainInterval(): number {
  return gameConfig.biomes[getBiome(p)].lifeDrain.intervalFrames;
}

function isEnemyBiomeBlocked(pos: Vec3, enemyConfig: EnemyConfig): boolean {
  return enemyConfig.blockedBiomes.includes(getBiome(pos));
}

function pickResourceKindForBiome(biome: BiomeKind): CarryResourceKind {
  const weights = gameConfig.biomes[biome].resourceWeights;
  const total = weights.life + weights.energy + weights.gold;
  let roll = Math.random() * total;

  if (roll < weights.life) {
    return "life";
  }

  roll -= weights.life;

  if (roll < weights.energy) {
    return "energy";
  }

  return "gold";
}

function surfaceDistance(a: Vec3, b: Vec3): number {
  return Math.acos(clamp(dot(a, b), -1, 1)) * sphereRadiusWorld;
}

function moveAlongSurface(pos: Vec3, direction: Vec3, distance: number): { pos: Vec3; direction: Vec3 } {
  const angle = distance / sphereRadiusWorld;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const nextPos = norm(add(scale(pos, c), scale(direction, s)));
  const nextDirection = norm(add(scale(pos, -s), scale(direction, c)));

  return { pos: nextPos, direction: nextDirection };
}

function minDistanceToShotPath(start: Vec3, direction: Vec3, travelDistance: number, target: Vec3): number {
  const steps = Math.max(3, Math.ceil(travelDistance / Math.max(0.8, gameConfig.shots.hitDistance * 0.45)));
  let minDistance = Number.POSITIVE_INFINITY;

  for (let step = 0; step <= steps; step += 1) {
    const sample = moveAlongSurface(start, direction, (travelDistance * step) / steps).pos;
    minDistance = Math.min(minDistance, surfaceDistance(sample, target));
  }

  return minDistance;
}

function moveEnemyTowardAllowedBiomes(pos: Vec3, target: Vec3, distance: number, enemyConfig: EnemyConfig): Vec3 {
  const tangent = add(target, scale(pos, -dot(target, pos)));

  if (Math.hypot(tangent.x, tangent.y, tangent.z) < 0.0001) {
    return pos;
  }

  const direction = norm(tangent);
  const steps = Math.max(2, Math.ceil(distance / 0.4));

  for (let step = 1; step <= steps; step += 1) {
    const sample = moveAlongSurface(pos, direction, (distance * step) / steps).pos;

    if (isEnemyBiomeBlocked(sample, enemyConfig)) {
      return pos;
    }
  }

  return moveAlongSurface(pos, direction, distance).pos;
}

function getEnemySize(enemyConfig: EnemyConfig): number {
  return enemyConfig.size + Math.random() * enemyConfig.sizeVariance;
}

function getEnemyConfig(categoryId: EnemyCategoryId): EnemyConfig {
  return gameConfig.enemies[categoryId] as EnemyConfig;
}

function createEnemy(categoryId: EnemyCategoryId, pos: Vec3, spawnedById?: number): Enemy {
  const enemyConfig = getEnemyConfig(categoryId);

  return {
    id: nextEnemyId++,
    categoryId,
    pos,
    size: getEnemySize(enemyConfig),
    spawnTimer: enemyConfig.spawn ? Math.random() * enemyConfig.spawn.intervalFrames : 0,
    shotTimer: 0,
    exploreTimer: enemyConfig.explore ? Math.random() * enemyConfig.explore.retargetFrames : 0,
    exploreTarget: enemyConfig.explore ? findEnemyExploreTarget(pos, enemyConfig) ?? undefined : undefined,
    spawnedById,
  };
}

function findEnemySpawnPosition(origin: Vec3, enemyConfig: EnemyConfig, distance: number): Vec3 | null {
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const random = randomUnitVector();
    const tangent = add(random, scale(origin, -dot(random, origin)));

    if (Math.hypot(tangent.x, tangent.y, tangent.z) < 0.0001) {
      continue;
    }

    const pos = moveEnemyTowardAllowedBiomes(origin, norm(tangent), distance, enemyConfig);

    if (pos !== origin && !isEnemyBiomeBlocked(pos, enemyConfig)) {
      return pos;
    }
  }

  return null;
}

function findEnemyExploreTarget(origin: Vec3, enemyConfig: EnemyConfig): Vec3 | null {
  if (!enemyConfig.explore) {
    return null;
  }

  return findEnemySpawnPosition(origin, enemyConfig, enemyConfig.explore.targetDistance);
}

function tangentToward(from: Vec3, target: Vec3): Vec3 | null {
  const tangent = add(target, scale(from, -dot(target, from)));

  if (Math.hypot(tangent.x, tangent.y, tangent.z) < 0.0001) {
    return null;
  }

  return norm(tangent);
}

function signedAngleAroundAxis(from: Vec3, to: Vec3, axis: Vec3): number {
  return Math.atan2(dot(axis, cross(from, to)), dot(from, to));
}

function rotateForwardToward(targetDirection: Vec3, maxAngle: number): boolean {
  const angle = signedAngleAroundAxis(forward, targetDirection, p);

  if (Math.abs(angle) <= maxAngle) {
    forward = targetDirection;
    return true;
  }

  forward = norm(rotateAroundAxis(forward, p, Math.sign(angle) * maxAngle));
  return Math.abs(angle) <= gameConfig.mouse.alignmentAngle;
}

function canPlaceResource(pos: Vec3, existing: Resource[], minDistance: number): boolean {
  return existing.every((resource) => surfaceDistance(pos, resource.pos) > minDistance);
}

function makeResources(count = resourceCount, minDistance = minimumResourceDistance): void {
  const next: Resource[] = [];
  const nextCount = clamp(Math.round(count), 1, 500);
  const nextMinimumDistance = clamp(minDistance, 0, Math.PI * sphereRadiusWorld);
  const maxAttempts = Math.max(5000, nextCount * nextCount * 3);
  let attempts = 0;

  while (next.length < nextCount && attempts < maxAttempts) {
    attempts += 1;
    const pos = randomUnitVector();

    if (!canPlaceResource(pos, next, nextMinimumDistance)) {
      continue;
    }

    const index = next.length;
    next.push({
      n: index + 1,
      pos,
      size: 0.75 + Math.random() * 0.45,
      kind: pickResourceKindForBiome(getBiome(pos)),
    });
  }

  let shopAttempts = 0;

  while (next.filter((resource) => resource.kind === "shop").length < gameConfig.shops.count && shopAttempts < 3000) {
    shopAttempts += 1;
    const pos = randomUnitVector();

    if (!canPlaceResource(pos, next, nextMinimumDistance * 1.8)) {
      continue;
    }

    next.push({
      n: next.length + 1,
      pos,
      size: 1.2,
      kind: "shop",
    });
  }

  let saveAttempts = 0;

  while (next.filter((resource) => resource.kind === "save").length < gameConfig.saves.count && saveAttempts < 3000) {
    saveAttempts += 1;
    const pos = randomUnitVector();

    if (!canPlaceResource(pos, next, nextMinimumDistance * 1.8)) {
      continue;
    }

    next.push({
      n: next.length + 1,
      pos,
      size: 1.1,
      kind: "save",
    });
  }

  let shipPartAttempts = 0;

  while (
    next.filter((resource) => resource.kind === "shipPart").length < gameConfig.mission.shipPartCount &&
    shipPartAttempts < 5000
  ) {
    shipPartAttempts += 1;
    const pos = randomUnitVector();

    if (surfaceDistance(pos, startShipPos) < gameConfig.enemies.crawler.aggroDistance || !canPlaceResource(pos, next, nextMinimumDistance * 2)) {
      continue;
    }

    next.push({
      n: next.length + 1,
      pos,
      size: 1.15,
      kind: "shipPart",
    });
  }

  resourceCount = nextCount;
  minimumResourceDistance = nextMinimumDistance;
  resources = next;
}

function makeEnemies(): void {
  const next: Enemy[] = [];
  const entries = Object.keys(gameConfig.enemies).map((categoryId) => [
    categoryId as EnemyCategoryId,
    getEnemyConfig(categoryId as EnemyCategoryId),
  ]) as Array<[EnemyCategoryId, EnemyConfig]>;

  for (const [categoryId, enemyConfig] of entries) {
    const maxAttempts = enemyConfig.count * 120;
    let attempts = 0;
    let categoryCount = 0;

    while (categoryCount < enemyConfig.count && attempts < maxAttempts) {
      attempts += 1;
      const pos = randomUnitVector();

      if (isEnemyBiomeBlocked(pos, enemyConfig)) {
        continue;
      }

      if (surfaceDistance(pos, p) < enemyConfig.aggroDistance * 1.4) {
        continue;
      }

      next.push(createEnemy(categoryId, pos));
      categoryCount += 1;
    }
  }

  enemies = next;
}

function move(distance: number): void {
  const c = Math.cos(distance);
  const s = Math.sin(distance);
  const nextP = add(scale(p, c), scale(forward, s));
  const nextForward = add(scale(p, -s), scale(forward, c));
  p = norm(nextP);
  forward = norm(nextForward);
}

function moveToMouseTarget(dt: number): boolean {
  if (!mouseMoveTarget) {
    return false;
  }

  const distanceToTarget = surfaceDistance(p, mouseMoveTarget);

  if (distanceToTarget <= gameConfig.mouse.targetDistance) {
    mouseMoveTarget = null;
    return false;
  }

  const nextForward = tangentToward(p, mouseMoveTarget);

  if (!nextForward) {
    mouseMoveTarget = null;
    return false;
  }

  const aligned = rotateForwardToward(nextForward, gameConfig.mouse.turnStep * dt);

  if (aligned || Math.abs(signedAngleAroundAxis(forward, nextForward, p)) <= gameConfig.mouse.alignmentAngle) {
    move(Math.min(moveStep * speed * dt, distanceToTarget / sphereRadiusWorld));
    return true;
  }

  return false;
}

function turn(angle: number): void {
  forward = norm(rotateAroundAxis(forward, p, angle));
}

function collectNearbyResources(): void {
  const remaining: Resource[] = [];
  let nearShop = false;
  let nearSave = false;

  for (const resource of resources) {
    const distance = surfaceDistance(p, resource.pos);

    if (resource.kind === "shop" && distance <= gameConfig.shops.openDistance) {
      nearShop = true;

      if (ignoredShopId !== resource.n && activeShopId !== resource.n) {
        shopOpen = true;
        activeShopId = resource.n;
      }

      if (shopOpen) {
        mouseMoveTarget = null;
      }

      remaining.push(resource);
      continue;
    }

    if (resource.kind === "save" && distance <= gameConfig.saves.activationDistance) {
      nearSave = true;

      if (ignoredSaveId !== resource.n && pendingSaveResourceId !== resource.n) {
        pendingSaveResourceId = resource.n;
        pendingSavePoint = resource.pos;
        savePromptMessage = "";
        mouseMoveTarget = null;
      }

      remaining.push(resource);
      continue;
    }

    if (resource.kind === "shipPart" && distance <= gameConfig.mission.shipPartCollectionDistance) {
      shipPartsCollected = Math.min(gameConfig.mission.shipPartCount, shipPartsCollected + 1);
      explosions.push({
        pos: resource.pos,
        age: 0,
        ttl: 18,
      });
      continue;
    }

    if (isCarryResourceKind(resource.kind) && distance <= collectionDistance) {
      if (collectedResources[resource.kind] >= resourceCapacity[resource.kind]) {
        remaining.push(resource);
        continue;
      }

      collectedResources[resource.kind] = Math.min(
        resourceCapacity[resource.kind],
        collectedResources[resource.kind] + 1,
      );

      if (resource.kind === "life") {
        lifeDrainTimer = getCurrentLifeDrainInterval();
      }

      continue;
    }

    remaining.push(resource);
  }

  if (!nearShop) {
    activeShopId = null;
    ignoredShopId = null;
  }

  if (!nearSave) {
    ignoredSaveId = null;
  }

  resources = remaining;
}

function updateShipRepair(dt: number): void {
  if (shipPartInstallTimer > 0) {
    shipPartInstallTimer = Math.max(0, shipPartInstallTimer - dt);
  }

  if (
    shipPartsInstalled >= shipPartsCollected ||
    shipPartsInstalled >= gameConfig.mission.shipPartCount ||
    surfaceDistance(p, startShipPos) > gameConfig.mission.baseRepairDistance
  ) {
    return;
  }

  shipPartsInstalled += 1;
  lastInstalledPartIndex = shipPartsInstalled - 1;
  shipPartInstallTimer = gameConfig.mission.shipPartInstallFrames;
  mouseMoveTarget = null;

  explosions.push({
    pos: startShipPos,
    age: 0,
    ttl: 22,
  });
}

function fireShot(direction = forward): void {
  if (gameWon || gameOver || restorePhase !== "idle" || shopOpen || collectedResources.energy < gameConfig.shots.energyCost) {
    return;
  }

  collectedResources.energy -= gameConfig.shots.energyCost;
  shots.push({
    pos: p,
    direction: norm(add(direction, scale(p, -dot(direction, p)))),
    ttl: gameConfig.shots.lifeFrames,
  });
}

function updateMouseShot(dt: number): void {
  if (!mouseShotTarget) {
    return;
  }

  const shotDirection = tangentToward(p, mouseShotTarget);

  if (!shotDirection) {
    mouseShotTarget = null;
    return;
  }

  const aligned = rotateForwardToward(shotDirection, gameConfig.mouse.turnStep * dt);

  if (aligned || Math.abs(signedAngleAroundAxis(forward, shotDirection, p)) <= gameConfig.mouse.alignmentAngle) {
    fireShot(shotDirection);
    mouseShotTarget = null;
  }
}

function updateShots(dt: number): void {
  const nextShots: Shot[] = [];
  const destroyedEnemies = new Set<number>();

  for (const shot of shots) {
    const travelDistance = gameConfig.shots.moveDistance * dt;
    const moved = moveAlongSurface(shot.pos, shot.direction, travelDistance);
    const nextShot: Shot = {
      pos: moved.pos,
      direction: moved.direction,
      ttl: shot.ttl - dt,
    };

    const hitEnemy = enemies.find(
      (enemy) =>
        !destroyedEnemies.has(enemy.id) &&
        minDistanceToShotPath(shot.pos, shot.direction, travelDistance, enemy.pos) <=
          gameConfig.shots.hitDistance + enemy.size,
    );

    if (hitEnemy) {
      destroyedEnemies.add(hitEnemy.id);
      explosions.push({
        pos: nextShot.pos,
        age: 0,
        ttl: 18,
      });
      continue;
    }

    if (nextShot.ttl > 0) {
      nextShots.push(nextShot);
    }
  }

  if (destroyedEnemies.size > 0) {
    enemies = enemies.filter((enemy) => !destroyedEnemies.has(enemy.id));
  }

  shots = nextShots;
}

function updateEnemyShots(dt: number): void {
  const nextShots: EnemyShot[] = [];
  projectileHitCooldown = Math.max(0, projectileHitCooldown - dt);

  for (const shot of enemyShots) {
    const ownerConfig = getEnemyConfig(enemies.find((enemy) => enemy.id === shot.ownerId)?.categoryId ?? "turret");
    const shootConfig = ownerConfig.shoot ?? gameConfig.enemies.turret.shoot;
    const travelDistance = shootConfig.moveDistance * dt;
    const moved = moveAlongSurface(shot.pos, shot.direction, travelDistance);
    const nextShot: EnemyShot = {
      ...shot,
      pos: moved.pos,
      direction: moved.direction,
      ttl: shot.ttl - dt,
    };

    if (minDistanceToShotPath(shot.pos, shot.direction, travelDistance, p) <= shootConfig.hitDistance) {
      collectedResources.life = 0;
      explosions.push({
        pos: p,
        age: 0,
        ttl: gameConfig.restore.playerExplosionTtl,
      });
      enemyShots = [];
      startRestoreSequence();
      return;
    }

    if (nextShot.ttl > 0) {
      nextShots.push(nextShot);
    }
  }

  enemyShots = nextShots;
}

function updateExplosions(dt: number): void {
  explosions = explosions
    .map((explosion) => ({ ...explosion, age: explosion.age + dt }))
    .filter((explosion) => explosion.age < explosion.ttl);
}

function isInsideDetectorRange(enemy: Enemy): boolean {
  return surfaceDistance(p, enemy.pos) <= detectorRange + enemy.size;
}

function triggerEnemyDetector(targets: Enemy[]): boolean {
  if (!detectorEnabled || targets.length === 0) {
    return false;
  }

  if (detectorActiveTimer <= 0) {
    if (detectorCooldown > 0) {
      return false;
    }

    const energyCost = getDetectorEnergyCost();

    if (collectedResources.energy < energyCost) {
      detectorEnabled = false;
      return false;
    }

    collectedResources.energy -= energyCost;
    detectorActiveTimer = gameConfig.enemyDetector.activeFrames;
    detectorCooldown = gameConfig.enemyDetector.cooldownFrames;
    explosions.push({
      pos: p,
      age: 0,
      ttl: gameConfig.enemyDetector.explosionTtl,
    });
  }

  for (const enemy of targets) {
    explosions.push({
      pos: enemy.pos,
      age: 0,
      ttl: gameConfig.enemyDetector.explosionTtl,
    });
  }

  const destroyedIds = new Set(targets.map((enemy) => enemy.id));
  enemies = enemies.filter((enemy) => !destroyedIds.has(enemy.id));
  detectorKills += destroyedIds.size;
  return true;
}

function updateEnemyDetector(dt: number): void {
  detectorCooldown = Math.max(0, detectorCooldown - dt);
  detectorActiveTimer = Math.max(0, detectorActiveTimer - dt);

  if (!detectorEnabled || enemies.length === 0) {
    return;
  }

  triggerEnemyDetector(enemies.filter(isInsideDetectorRange));
}

function updateEnemies(dt: number): void {
  const remainingEnemies: Enemy[] = [];
  const spawnedEnemies: Enemy[] = [];

  for (let index = 0; index < enemies.length; index += 1) {
    const enemy = enemies[index];
    const enemyConfig = getEnemyConfig(enemy.categoryId);
    let nextEnemy = enemy;
    const distanceToPlayer = surfaceDistance(enemy.pos, p);

    if (enemyConfig.spawn) {
      const spawnTimer = enemy.spawnTimer - dt;
      const activeChildren = enemies.filter((candidate) => candidate.spawnedById === enemy.id).length;

      if (spawnTimer <= 0 && activeChildren < enemyConfig.spawn.maxChildren) {
        const childCategoryId = enemyConfig.spawn.categoryId as EnemyCategoryId;
        const childConfig = getEnemyConfig(childCategoryId);
        const childPos = findEnemySpawnPosition(enemy.pos, childConfig, enemyConfig.spawn.spawnDistance);

        if (childPos) {
          spawnedEnemies.push(createEnemy(childCategoryId, childPos, enemy.id));
        }
      }

      nextEnemy = {
        ...nextEnemy,
        spawnTimer:
          spawnTimer <= 0
            ? enemyConfig.spawn.intervalFrames + Math.max(0, spawnTimer)
            : spawnTimer,
      };
    }

    if (enemyConfig.shoot) {
      const inShootRange = distanceToPlayer <= enemyConfig.shoot.range;
      const shotTimer = inShootRange ? Math.max(0, enemy.shotTimer - dt) : 0;
      let didShoot = false;

      if (inShootRange && shotTimer <= 0) {
        const shotDirection = tangentToward(enemy.pos, p);

        if (shotDirection) {
          enemyShots.push({
            ownerId: enemy.id,
            pos: enemy.pos,
            direction: shotDirection,
            ttl: enemyConfig.shoot.lifeFrames,
          });
          didShoot = true;
        }
      }

      nextEnemy = {
        ...nextEnemy,
        shotTimer: didShoot ? enemyConfig.shoot.intervalFrames : shotTimer,
      };
    }

    if (enemyConfig.canMove && distanceToPlayer <= enemyConfig.aggroDistance) {
      nextEnemy = {
        ...nextEnemy,
        pos: moveEnemyTowardAllowedBiomes(enemy.pos, p, enemyConfig.moveDistance * dt, enemyConfig),
      };
    } else if (enemyConfig.canMove && enemyConfig.explore) {
      let exploreTimer = enemy.exploreTimer - dt;
      let exploreTarget = enemy.exploreTarget;

      if (!exploreTarget || exploreTimer <= 0 || surfaceDistance(enemy.pos, exploreTarget) <= enemyConfig.moveDistance * dt) {
        exploreTarget = findEnemyExploreTarget(enemy.pos, enemyConfig) ?? undefined;
        exploreTimer = enemyConfig.explore.retargetFrames;
      }

      if (exploreTarget) {
        const nextPos = moveEnemyTowardAllowedBiomes(enemy.pos, exploreTarget, enemyConfig.moveDistance * dt, enemyConfig);

        if (nextPos === enemy.pos) {
          exploreTarget = findEnemyExploreTarget(enemy.pos, enemyConfig) ?? undefined;
          exploreTimer = enemyConfig.explore.retargetFrames;
        }

        nextEnemy = {
          ...nextEnemy,
          pos: nextPos,
          exploreTimer,
          exploreTarget,
        };
      } else {
        nextEnemy = {
          ...nextEnemy,
          exploreTimer,
          exploreTarget,
        };
      }
    }

    const nextDistanceToPlayer = surfaceDistance(nextEnemy.pos, p);

    if (isInsideDetectorRange(nextEnemy) && triggerEnemyDetector([nextEnemy])) {
      continue;
    }

    if (!enemyConfig.shoot && nextDistanceToPlayer <= enemyConfig.hitDistance) {
      collectedResources.life = Math.max(0, collectedResources.life - 1);
      startRestoreSequence();
      remainingEnemies.push(...enemies.slice(index + 1));
      break;
    }

    remainingEnemies.push(nextEnemy);
  }

  enemies = [...remainingEnemies, ...spawnedEnemies];
}

function updateLifeDrain(dt: number): void {
  const intervalFrames = getCurrentLifeDrainInterval();
  lifeDrainTimer = Math.min(lifeDrainTimer, intervalFrames);
  lifeDrainTimer = Math.max(0, lifeDrainTimer - dt);

  if (lifeDrainTimer > 0) {
    return;
  }

  collectedResources.life = Math.max(0, collectedResources.life - 1);
  lifeDrainTimer = intervalFrames;
  gameOver = collectedResources.life <= 0;
}

function countRemainingResources(): Record<CarryResourceKind, number> {
  return resources.reduce<Record<CarryResourceKind, number>>(
    (counts, resource) => {
      if (isCarryResourceKind(resource.kind)) {
        counts[resource.kind] += 1;
      }

      return counts;
    },
    { life: 0, energy: 0, gold: 0 },
  );
}

function checkVictory(): void {
  gameWon = shipPartsInstalled >= gameConfig.mission.shipPartCount && enemies.length === 0;
}

function setSphereSize(nextSphereSize: number): void {
  sphereRadiusWorld = Math.max(0.5, Math.min(100, nextSphereSize));
  zoom = Math.max(1.05, sphereRadiusWorld / Math.min(visibleRadiusWorld, sphereRadiusWorld * 0.95));
  visibleRadiusWorld = sphereRadiusWorld / zoom;
}

function setZoom(nextZoom: number): void {
  zoom = Math.max(1.05, Math.min(8, nextZoom));
  visibleRadiusWorld = sphereRadiusWorld / zoom;
}

function setSpeed(nextSpeed: number): void {
  speed = Math.max(0.25, Math.min(gameConfig.shopUpgrades.speed.maxSpeed, nextSpeed));
}

function getUpgradeCost(kind: CarryResourceKind): number {
  const upgrade = gameConfig.shopUpgrades[kind];
  return upgrade.baseCost + capacityUpgradePurchases[kind] * upgrade.costStep;
}

function getRadarUpgradeCost(): number {
  const upgrade = gameConfig.shopUpgrades.radar;
  return upgrade.baseCost + radarUpgradePurchases * upgrade.costStep;
}

function getSpeedUpgradeCost(): number {
  const upgrade = gameConfig.shopUpgrades.speed;
  return upgrade.baseCost + speedUpgradePurchases * upgrade.costStep;
}

function getDetectorUpgradeCost(): number {
  const upgrade = gameConfig.enemyDetector;
  return upgrade.baseCost + detectorUpgradePurchases * upgrade.costStep;
}

function getDetectorEnergyCost(): number {
  return Math.max(
    1,
    Math.ceil(detectorRange * gameConfig.enemyDetector.energyCostPerRange) +
      detectorKills * gameConfig.enemyDetector.energyCostPerKill,
  );
}

function getSaveEnergyCost(): number {
  return gameConfig.saves.energyCost + savePurchases * gameConfig.saves.energyCostStep;
}

function buyCapacity(kind: CarryResourceKind): void {
  const cost = getUpgradeCost(kind);

  if (collectedResources.gold < cost) {
    return;
  }

  collectedResources.gold -= cost;
  resourceCapacity[kind] += gameConfig.shopUpgrades[kind].capacityStep;
  capacityUpgradePurchases[kind] += 1;
}

function buyRadarRange(): void {
  const cost = getRadarUpgradeCost();

  if (collectedResources.gold < cost) {
    return;
  }

  collectedResources.gold -= cost;
  distRadar += gameConfig.shopUpgrades.radar.rangeStep;
  radarUpgradePurchases += 1;
}

function buySpeed(): void {
  const cost = getSpeedUpgradeCost();

  if (collectedResources.gold < cost || speed >= gameConfig.shopUpgrades.speed.maxSpeed) {
    return;
  }

  collectedResources.gold -= cost;
  setSpeed(speed + gameConfig.shopUpgrades.speed.speedStep);
  speedUpgradePurchases += 1;
}

function buyDetectorRange(): void {
  const cost = getDetectorUpgradeCost();

  if (collectedResources.gold < cost) {
    return;
  }

  collectedResources.gold -= cost;
  detectorRange += gameConfig.enemyDetector.rangeStep;
  detectorUpgradePurchases += 1;
}

function resize(): void {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const width = Math.round(rect.width * dpr);
  const height = Math.round(rect.height * dpr);

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function getProjectionBasis(): { cx: number; cy: number; clipRadius: number; sphereRadius: number; right: Vec3 } {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const cx = width / 2;
  const cy = height / 2;
  const baseClipRadius = Math.max(40, Math.min(width, height) / 2 - gameConfig.radar.visionMargin);
  const clipRadius = Math.max(1, baseClipRadius * visibilityScale);
  const sphereRadius = (clipRadius * sphereRadiusWorld) / visibleRadiusWorld;
  const right = norm(cross(forward, p));

  return { cx, cy, clipRadius, sphereRadius, right };
}

function getSpherePointFromMouse(event: MouseEvent): Vec3 | null {
  const rect = canvas.getBoundingClientRect();
  const { cx, cy, clipRadius, sphereRadius, right } = getProjectionBasis();
  const screenX = event.clientX - rect.left;
  const screenY = event.clientY - rect.top;

  if (Math.hypot(screenX - cx, screenY - cy) > clipRadius) {
    return null;
  }

  const localX = (screenX - cx) / sphereRadius;
  const localY = -(screenY - cy) / sphereRadius;
  const localRadiusSq = localX * localX + localY * localY;

  if (localRadiusSq > 1) {
    return null;
  }

  const depth = Math.sqrt(1 - localRadiusSq);
  return norm(add(add(scale(right, localX), scale(forward, localY)), scale(p, depth)));
}

function getCanvasMousePosition(event: MouseEvent): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();

  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}

function isInsideButton(point: { x: number; y: number }, button: { x: number; y: number; width: number; height: number }): boolean {
  return (
    point.x >= button.x &&
    point.x <= button.x + button.width &&
    point.y >= button.y &&
    point.y <= button.y + button.height
  );
}

function handleHelpClick(event: MouseEvent): boolean {
  const point = getCanvasMousePosition(event);
  const button = helpButtons.find((candidate) => isInsideButton(point, candidate));

  if (!button) {
    return helpOpen;
  }

  if (button.action === "open-help") {
    helpOpen = true;
    return true;
  }

  if (button.action === "close-help") {
    helpOpen = false;
    return true;
  }

  uiLanguage = button.action === "lang-fr" ? "fr" : "en";
  return true;
}

function handleShopClick(event: MouseEvent): boolean {
  if (!shopOpen) {
    return false;
  }

  const point = getCanvasMousePosition(event);
  const button = shopButtons.find((candidate) => isInsideButton(point, candidate));

  if (!button) {
    return true;
  }

  if (button.action === "close") {
    ignoredShopId = activeShopId;
    shopOpen = false;
    return true;
  }

  if (button.action === "buy-life") buyCapacity("life");
  if (button.action === "buy-energy") buyCapacity("energy");
  if (button.action === "buy-gold") buyCapacity("gold");
  if (button.action === "buy-radar") buyRadarRange();
  if (button.action === "buy-detector") buyDetectorRange();
  if (button.action === "buy-speed") buySpeed();
  return true;
}

function handleWeaponClick(event: MouseEvent): boolean {
  const point = getCanvasMousePosition(event);
  const button = weaponButtons.find((candidate) => isInsideButton(point, candidate));

  if (!button) {
    return false;
  }

  if (button.action === "toggle-panel") {
    weaponOptionsOpen = !weaponOptionsOpen;
    return true;
  }

  detectorEnabled = !detectorEnabled;
  detectorCooldown = 0;
  return true;
}

function handleRadarFilterClick(event: MouseEvent): boolean {
  const point = getCanvasMousePosition(event);
  const button = radarFilterButtons.find((candidate) => isInsideButton(point, candidate));

  if (!button) {
    return false;
  }

  if (button.action === "toggle-panel") {
    radarOptionsOpen = !radarOptionsOpen;
    return true;
  }

  if (button.action === "disable-all") {
    for (const kind of Object.keys(radarFilters) as RadarKind[]) {
      radarFilters[kind] = false;
    }

    return true;
  }

  if (button.kind) {
    radarFilters[button.kind] = !radarFilters[button.kind];
  }

  return true;
}

function closeSavePrompt(shouldSave: boolean): void {
  if (shouldSave && pendingSavePoint) {
    const saveCost = getSaveEnergyCost();

    if (collectedResources.energy < saveCost) {
      savePromptMessage = "ENERGIE BASSE";
      return;
    }

    collectedResources.energy -= saveCost;
    savePurchases += 1;
    createSaveState(pendingSavePoint, pendingSaveResourceId);
  }

  ignoredSaveId = pendingSaveResourceId;
  pendingSaveResourceId = null;
  pendingSavePoint = null;
  savePromptMessage = "";
}

function handleSavePromptClick(event: MouseEvent): boolean {
  if (!pendingSavePoint) {
    return false;
  }

  const point = getCanvasMousePosition(event);
  const button = savePromptButtons.find((candidate) => isInsideButton(point, candidate));

  if (!button) {
    return true;
  }

  closeSavePrompt(button.action === "save-confirm");
  return true;
}

function drawGrid(cx: number, cy: number, radius: number): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = "rgba(238, 242, 243, 0.12)";
  ctx.lineWidth = 1;

  for (let i = 1; i <= 3; i += 1) {
    ctx.beginPath();
    ctx.arc(0, 0, (radius * i) / 4, 0, TAU);
    ctx.stroke();
  }

  for (let i = 0; i < 12; i += 1) {
    const a = (i * TAU) / 12;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a) * radius, Math.sin(a) * radius);
    ctx.stroke();
  }

  ctx.restore();
}

function drawTerrain(cx: number, cy: number, radius: number, right: Vec3): void {
  const tileSize = Math.max(4, Math.floor(radius / 120));
  const left = Math.floor(cx - radius);
  const top = Math.floor(cy - radius);
  const diameter = Math.ceil(radius * 2);

  ctx.save();
  ctx.imageSmoothingEnabled = false;

  for (let y = top; y <= top + diameter; y += tileSize) {
    for (let x = left; x <= left + diameter; x += tileSize) {
      const localX = (x + tileSize / 2 - cx) / radius;
      const localY = -(y + tileSize / 2 - cy) / radius;
      const localRadiusSq = localX * localX + localY * localY;

      if (localRadiusSq > 1) {
        continue;
      }

      const depth = Math.sqrt(1 - localRadiusSq);
      const surfacePos = norm(add(add(scale(right, localX), scale(forward, localY)), scale(p, depth)));
      const light = 0.78 + depth * 0.18;

      ctx.globalAlpha = light;
      ctx.fillStyle = getBiomeColor(getBiome(surfacePos));
      ctx.fillRect(x, y, tileSize + 1, tileSize + 1);
    }
  }

  ctx.globalAlpha = 1;
  ctx.fillStyle = "rgba(7, 9, 13, 0.16)";
  ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
  ctx.restore();
}

function drawPixelSprite(sprite: PixelSprite, x: number, y: number, pixelSize: number): void {
  const width = sprite.rows[0]?.length ?? 0;
  const height = sprite.rows.length;
  const left = x - (width * pixelSize) / 2;
  const top = y - (height * pixelSize) / 2;

  ctx.save();
  ctx.imageSmoothingEnabled = false;

  for (let rowIndex = 0; rowIndex < sprite.rows.length; rowIndex += 1) {
    const row = sprite.rows[rowIndex];

    for (let colIndex = 0; colIndex < row.length; colIndex += 1) {
      const colorKey = row[colIndex];
      const color = sprite.palette[colorKey];

      if (!color) {
        continue;
      }

      ctx.fillStyle = color;
      ctx.fillRect(
        Math.round(left + colIndex * pixelSize),
        Math.round(top + rowIndex * pixelSize),
        Math.ceil(pixelSize),
        Math.ceil(pixelSize),
      );
    }
  }

  ctx.restore();
}

function drawPlayer(cx: number, cy: number): void {
  const frameIndex = Math.floor(playerWalkCycle / 6) % playerSprites.length;
  const bob = playerWalkCycle > 0 && frameIndex % 2 === 1 ? -2 : 0;
  drawPixelSprite(playerSprites[frameIndex], cx, cy - 7 + bob, 4);
}

function drawPixelText(text: string, x: number, y: number, pixelSize: number, color: string): void {
  let cursorX = x;

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = color;

  for (const character of text.toUpperCase()) {
    const pattern = pixelText[character] ?? pixelText[" "];

    for (let rowIndex = 0; rowIndex < pattern.length; rowIndex += 1) {
      const row = pattern[rowIndex];

      for (let colIndex = 0; colIndex < row.length; colIndex += 1) {
        if (row[colIndex] !== "1") {
          continue;
        }

        ctx.fillRect(
          Math.round(cursorX + colIndex * pixelSize),
          Math.round(y + rowIndex * pixelSize),
          pixelSize,
          pixelSize,
        );
      }
    }

    cursorX += 4 * pixelSize;
  }

  ctx.restore();
}

function drawReadableText(text: string, x: number, y: number, color: string, size = 13): void {
  ctx.save();
  ctx.fillStyle = color;
  ctx.font = `${size}px Consolas, "Courier New", monospace`;
  ctx.textBaseline = "top";
  ctx.fillText(text, x, y);
  ctx.restore();
}

function drawPanelFrame(x: number, y: number, width: number, height: number): void {
  ctx.fillStyle = "rgba(6, 9, 14, 0.82)";
  ctx.fillRect(x, y, width, height);
  ctx.strokeStyle = "#5dd7d2";
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, width - 2, height - 2);
  ctx.fillStyle = "#111827";
  ctx.fillRect(x + 6, y + 6, width - 12, height - 12);
  ctx.strokeStyle = "#203845";
  ctx.strokeRect(x + 7, y + 7, width - 14, height - 14);
}

function drawPixelBar(
  x: number,
  y: number,
  width: number,
  height: number,
  value: number,
  max: number,
  fillColor: string,
  backColor = "#1f2430",
): void {
  const safeMax = Math.max(1, max);
  const ratio = clamp(value / safeMax, 0, 1);
  const fillWidth = Math.max(0, Math.floor((width - 4) * ratio));

  ctx.fillStyle = "#05070a";
  ctx.fillRect(x, y, width, height);
  ctx.strokeStyle = "#46505e";
  ctx.strokeRect(x + 1, y + 1, width - 2, height - 2);
  ctx.fillStyle = backColor;
  ctx.fillRect(x + 3, y + 3, width - 6, height - 6);
  ctx.fillStyle = fillColor;
  ctx.fillRect(x + 3, y + 3, fillWidth, height - 6);

  const segmentCount = Math.min(safeMax, 24);
  if (segmentCount > 1) {
    ctx.fillStyle = "rgba(6, 9, 14, 0.55)";
    for (let index = 1; index < segmentCount; index += 1) {
      const segmentX = Math.round(x + 3 + ((width - 6) * index) / segmentCount);
      ctx.fillRect(segmentX, y + 3, 1, height - 6);
    }
  }
}

function getHudRows(remainingResources: Record<CarryResourceKind, number>): Array<{
  kind: CarryResourceKind;
  color: string;
  collected: number;
  capacity: number;
  remaining: number;
}> {
  return [
    {
      kind: "life",
      color: "#ff6f86",
      collected: collectedResources.life,
      capacity: resourceCapacity.life,
      remaining: remainingResources.life,
    },
    {
      kind: "energy",
      color: "#ffef6e",
      collected: collectedResources.energy,
      capacity: resourceCapacity.energy,
      remaining: remainingResources.energy,
    },
    {
      kind: "gold",
      color: "#ffcf5a",
      collected: collectedResources.gold,
      capacity: resourceCapacity.gold,
      remaining: remainingResources.gold,
    },
  ];
}

function drawInventoryPanel(rows: ReturnType<typeof getHudRows>): void {
  const pixelSize = 3;
  const panelWidth = 238;
  const panelHeight = 218;
  const x = 22;
  const y = 22;
  const lifeRow = rows.find((row) => row.kind === "life");
  const carryRows = rows.filter((row) => row.kind !== "life");
  const carriedShipParts = Math.max(0, shipPartsCollected - shipPartsInstalled);

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  drawPanelFrame(x, y, panelWidth, panelHeight);

  drawPixelText("INVENTAIRE", x + 18, y + 16, 3, "#eef2f3");

  if (lifeRow) {
    const lifeBarWidth = Math.min(160, 78 + lifeRow.capacity * 8);

    drawPixelSprite(resourceSprites.life, x + 32, y + 54, 2.5);
    drawPixelText("VIE", x + 58, y + 43, 2, "#ff6f86");
    drawPixelBar(x + 58, y + 61, lifeBarWidth, 16, lifeRow.collected, lifeRow.capacity, "#ff6f86", "#3a1720");
  }

  drawPixelText("COL", x + 72, y + 86, 2, "#a9b1b7");
  drawPixelText("CAP", x + 138, y + 86, 2, "#a9b1b7");

  for (let index = 0; index < carryRows.length; index += 1) {
    const row = carryRows[index];
    const rowY = y + 108 + index * 24;

    drawPixelSprite(resourceSprites[row.kind], x + 34, rowY + 7, 2.5);
    drawPixelText(String(row.collected), x + 72, rowY, pixelSize, row.color);
    drawPixelText(String(row.capacity), x + 138, rowY, pixelSize, row.color);
  }

  const extraY = y + 162;
  ctx.strokeStyle = "#203845";
  ctx.beginPath();
  ctx.moveTo(x + 18, extraY - 10);
  ctx.lineTo(x + panelWidth - 18, extraY - 10);
  ctx.stroke();

  drawPixelText("VIT", x + 22, extraY, 2, "#34d399");
  drawPixelText("UP", x + 70, extraY, 2, "#a9b1b7");
  drawPixelText(String(speedUpgradePurchases), x + 104, extraY - 4, pixelSize, "#34d399");
  drawPixelText(String(Math.round(speed * 100)), x + 146, extraY - 4, pixelSize, "#34d399");

  drawPixelSprite(resourceSprites.shipPart, x + 34, extraY + 37, 2.2);
  drawPixelText("CARGO", x + 62, extraY + 28, 2, "#d7f3ff");
  drawPixelText(String(carriedShipParts), x + 146, extraY + 24, pixelSize, carriedShipParts > 0 ? "#ffcf5a" : "#6b7280");
  ctx.restore();
}

function drawHud(width: number): void {
  const pixelSize = 3;
  const panelWidth = 220;
  const panelHeight = 232;
  const x = Math.max(16, width - panelWidth - 22);
  const y = 22;
  const rows = getHudRows(countRemainingResources());

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  drawPanelFrame(x, y, panelWidth, panelHeight);

  drawPixelText("SUR SPHERE", x + 18, y + 16, 3, "#eef2f3");
  drawPixelText("RESTE", x + 72, y + 39, 2, "#a9b1b7");

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const rowY = y + 58 + index * 24;

    drawPixelSprite(resourceSprites[row.kind], x + 36, rowY + 7, 2.5);
    drawPixelText(String(row.remaining), x + 72, rowY, pixelSize, row.color);
  }

  drawPixelText("ENNEMIS", x + 18, y + 132, 2, "#ff6f61");
  drawPixelText(String(enemies.length), x + 102, y + 128, pixelSize, "#ff6f61");
  drawPixelText("PIECES", x + 18, y + 154, 2, "#d7f3ff");
  drawPixelText(`${shipPartsInstalled}/${gameConfig.mission.shipPartCount}`, x + 102, y + 150, 2, "#d7f3ff");
  drawPixelText("RADAR", x + 18, y + 176, 2, "#5dd7d2");
  drawPixelText(String(Math.round(distRadar)), x + 102, y + 172, pixelSize, "#5dd7d2");
  drawPixelText("VIE DANS", x + 18, y + 198, 2, "#ff6f86");
  drawPixelBar(
    x + 112,
    y + 194,
    84,
    16,
    lifeDrainTimer,
    getCurrentLifeDrainInterval(),
    "#ff6f86",
    "#3a1720",
  );
  ctx.restore();

  drawInventoryPanel(rows);
}

function drawShipBlueprint(width: number, height: number): void {
  const isNearBase = surfaceDistance(p, startShipPos) <= gameConfig.mission.baseRepairDistance;

  if (!isNearBase && shipPartInstallTimer <= 0) {
    return;
  }

  const partCount = gameConfig.mission.shipPartCount;
  const columns = Math.min(7, Math.max(1, partCount));
  const slotSize = 30;
  const gap = 8;
  const panelWidth = Math.max(260, 52 + columns * slotSize + (columns - 1) * gap);
  const panelHeight = 124;
  const x = width / 2 - panelWidth / 2;
  const y = Math.max(68, height - panelHeight - 22);
  const cargoCount = Math.max(0, shipPartsCollected - shipPartsInstalled);

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  drawPanelFrame(x, y, panelWidth, panelHeight);
  drawPixelText("PLAN TECH", x + 20, y + 16, 3, "#d7f3ff");
  drawPixelText("CARGO", x + panelWidth - 104, y + 18, 2, "#a9b1b7");
  drawPixelText(String(cargoCount), x + panelWidth - 40, y + 14, 3, cargoCount > 0 ? "#ffcf5a" : "#6b7280");

  ctx.strokeStyle = "#46505e";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + 22, y + 49);
  ctx.lineTo(x + panelWidth - 22, y + 49);
  ctx.stroke();

  const startX = x + (panelWidth - (columns * slotSize + (columns - 1) * gap)) / 2;
  const slotsY = y + 66;

  for (let index = 0; index < partCount; index += 1) {
    const slotX = startX + index * (slotSize + gap);
    const installed = index < shipPartsInstalled;
    const carried = index >= shipPartsInstalled && index < shipPartsCollected;
    const isNew = lastInstalledPartIndex === index && shipPartInstallTimer > 0;

    ctx.fillStyle = installed ? "#12383c" : carried ? "#3b2b16" : "#111827";
    ctx.fillRect(slotX, slotsY, slotSize, slotSize);
    ctx.strokeStyle = isNew ? "#fff1a8" : installed ? "#5dd7d2" : carried ? "#ffcf5a" : "#46505e";
    ctx.lineWidth = isNew ? 3 : 2;
    ctx.strokeRect(slotX + 1, slotsY + 1, slotSize - 2, slotSize - 2);

    if (installed || carried) {
      const pulse = isNew ? 2.1 + Math.sin(shipPartInstallTimer * 0.6) * 0.25 : 1.8;
      drawPixelSprite(resourceSprites.shipPart, slotX + slotSize / 2, slotsY + slotSize / 2, pulse);
    } else {
      ctx.fillStyle = "#2b3442";
      ctx.fillRect(slotX + 8, slotsY + 8, 14, 14);
      ctx.fillStyle = "#111827";
      ctx.fillRect(slotX + 12, slotsY + 12, 6, 6);
    }
  }

  const statusLabel = shipPartsInstalled >= partCount ? "REPARE" : cargoCount > 0 ? "RETOUR BASE" : "MANQUANT";
  const statusColor = shipPartsInstalled >= partCount ? "#5dd7d2" : cargoCount > 0 ? "#ffcf5a" : "#6b7280";
  drawPixelText(statusLabel, x + 22, y + 102, 2, statusColor);
  drawPixelText(`${shipPartsInstalled}/${partCount}`, x + panelWidth - 76, y + 98, 3, statusColor);
  ctx.restore();
}

function drawResource(resource: ProjectedResource, size: number, front: boolean): void {
  if (!front) {
    ctx.fillStyle = "rgba(255,255,255,0.16)";
    ctx.fillRect(resource.x - size / 2, resource.y - size / 2, size, size);
    return;
  }

  drawPixelSprite(resourceSprites[resource.kind], resource.x, resource.y, Math.max(2, Math.min(5, size / 4)));
}

function drawBaseShip(x: number, y: number, front: boolean): void {
  if (!front) {
    return;
  }

  const pulse = shipPartInstallTimer > 0 ? 1 + Math.sin(shipPartInstallTimer * 0.45) * 0.14 : 1;
  drawPixelSprite(baseShipSprite, x, y, gameConfig.mission.baseShipSize * pulse);

  if (shipPartInstallTimer > 0) {
    const progress = 1 - shipPartInstallTimer / gameConfig.mission.shipPartInstallFrames;

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = 1 - progress * 0.35;
    ctx.strokeStyle = "#d7f3ff";
    ctx.lineWidth = 3;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.arc(x, y, 34 + progress * 26, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#5dd7d2";
    for (let index = 0; index < 6; index += 1) {
      const angle = progress * TAU + (index * TAU) / 6;
      ctx.fillRect(Math.round(x + Math.cos(angle) * 42 - 3), Math.round(y + Math.sin(angle) * 42 - 3), 6, 6);
    }
    ctx.restore();
  }
}

function drawDetectorRange(cx: number, cy: number, worldToScreen: number): void {
  if (!detectorEnabled || restorePhase !== "idle") {
    return;
  }

  const radius = detectorRange * worldToScreen;

  ctx.save();
  const isActive = detectorActiveTimer > 0;

  ctx.globalAlpha = isActive ? 0.72 : detectorCooldown > 0 ? 0.28 : 0.5;
  ctx.strokeStyle = isActive ? "#fff1a8" : detectorCooldown > 0 ? "#a9b1b7" : "#ffcf5a";
  ctx.lineWidth = isActive ? 3 : 2;
  ctx.setLineDash(isActive ? [] : [5, 6]);
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = isActive ? 0.13 : detectorCooldown > 0 ? 0.04 : 0.07;
  ctx.fillStyle = "#ffcf5a";
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function drawEnemy(enemy: ProjectedEnemy, size: number, front: boolean): void {
  if (!front) {
    return;
  }

  const pixelSize = Math.max(2, Math.min(5, size / 4));

  drawPixelSprite(enemySprites[enemy.categoryId], enemy.x, enemy.y, pixelSize);

  if (enemy.categoryId !== "turret") {
    return;
  }

  const aimDirection = tangentToward(enemy.pos, p);

  if (!aimDirection) {
    return;
  }

  const { right } = getProjectionBasis();
  const aimX = dot(aimDirection, right);
  const aimY = -dot(aimDirection, forward);
  const length = Math.hypot(aimX, aimY);

  if (length < 0.001) {
    return;
  }

  const barrelLength = Math.max(12, pixelSize * 5);
  const barrelWidth = Math.max(5, pixelSize * 1.6);
  const ux = aimX / length;
  const uy = aimY / length;
  const px = -uy;
  const py = ux;

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#111827";
  ctx.fillRect(
    Math.round(enemy.x + ux * 2 + px * (-barrelWidth / 2)),
    Math.round(enemy.y + uy * 2 + py * (-barrelWidth / 2)),
    Math.ceil(barrelWidth),
    Math.ceil(barrelWidth),
  );
  ctx.strokeStyle = "#facc15";
  ctx.lineWidth = Math.max(3, pixelSize);
  ctx.beginPath();
  ctx.moveTo(enemy.x + ux * 3, enemy.y + uy * 3);
  ctx.lineTo(enemy.x + ux * barrelLength, enemy.y + uy * barrelLength);
  ctx.stroke();
  ctx.fillStyle = "#fff1a8";
  ctx.fillRect(Math.round(enemy.x + ux * barrelLength - 3), Math.round(enemy.y + uy * barrelLength - 3), 6, 6);
  ctx.restore();
}

function drawEnemyThreatRange(
  enemy: ProjectedEnemy,
  worldToScreen: number,
  cx: number,
  cy: number,
  sphereRadius: number,
  right: Vec3,
): void {
  const enemyConfig = getEnemyConfig(enemy.categoryId);

  if (enemy.depth < 0) {
    return;
  }

  const range = enemyConfig.shoot?.range ?? (enemy.categoryId === "crawler" ? enemyConfig.aggroDistance : 0);

  if (range <= 0) {
    return;
  }

  const inRange = surfaceDistance(enemy.pos, p) <= range;
  const radius = range * worldToScreen;
  const color = enemyConfig.shoot ? "#ff6f61" : "#f97316";
  const tangentASeed = Math.abs(enemy.pos.z) < 0.92 ? vec(0, 0, 1) : vec(1, 0, 0);
  const tangentA = norm(cross(enemy.pos, tangentASeed));
  const tangentB = norm(cross(enemy.pos, tangentA));
  const angleRadius = range / sphereRadiusWorld;

  ctx.save();
  ctx.globalAlpha = inRange ? 0.66 : 0.46;
  ctx.strokeStyle = inRange ? "#ffcf5a" : color;
  ctx.lineWidth = inRange ? 3 : 2;
  ctx.setLineDash([8, 6]);
  ctx.beginPath();
  ctx.arc(enemy.x, enemy.y, radius, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = inRange ? 0.1 : 0.06;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(enemy.x, enemy.y, radius, 0, TAU);
  ctx.fill();

  ctx.globalAlpha = inRange ? 0.9 : 0.58;
  ctx.strokeStyle = inRange ? "#fff1a8" : color;
  ctx.lineWidth = inRange ? 3 : 2;
  ctx.setLineDash([]);
  ctx.beginPath();

  let drawing = false;
  for (let index = 0; index <= 72; index += 1) {
    const angle = (index / 72) * TAU;
    const point = norm(
      add(
        scale(enemy.pos, Math.cos(angleRadius)),
        scale(add(scale(tangentA, Math.cos(angle)), scale(tangentB, Math.sin(angle))), Math.sin(angleRadius)),
      ),
    );
    const depth = dot(point, p);

    if (depth < 0) {
      drawing = false;
      continue;
    }

    const x = cx + dot(point, right) * sphereRadius;
    const y = cy - dot(point, forward) * sphereRadius;

    if (!drawing) {
      ctx.moveTo(x, y);
      drawing = true;
    } else {
      ctx.lineTo(x, y);
    }
  }

  ctx.stroke();
  ctx.restore();
}

function drawShot(shot: ProjectedShot, size: number, front: boolean): void {
  if (!front) {
    return;
  }

  drawPixelSprite(shotSprite, shot.x, shot.y, Math.max(2, Math.min(4, size / 3)));
}

function drawEnemyShot(shot: ProjectedEnemyShot, size: number, front: boolean): void {
  if (!front) {
    return;
  }

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = "#ffcf5a";
  ctx.fillRect(Math.round(shot.x - size * 0.75), Math.round(shot.y - size * 0.75), Math.ceil(size * 1.5), Math.ceil(size * 1.5));
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#071014";
  ctx.fillRect(Math.round(shot.x - size * 0.58), Math.round(shot.y - size * 0.58), Math.ceil(size * 1.16), Math.ceil(size * 1.16));
  ctx.fillStyle = "#ff6f61";
  ctx.fillRect(Math.round(shot.x - size / 2), Math.round(shot.y - size / 2), size, size);
  ctx.fillStyle = "#fff1a8";
  ctx.fillRect(Math.round(shot.x - size / 4), Math.round(shot.y - size / 4), Math.max(4, size / 2), Math.max(4, size / 2));
  ctx.restore();
}

function getTopButtonLayout(width: number): { help: HelpButton; radar: RadarFilterButton; weapon: WeaponButton } {
  const gap = 12;
  const helpWidth = 80;
  const radarWidth = 112;
  const weaponWidth = 96;
  const totalWidth = helpWidth + gap + radarWidth + gap + weaponWidth;
  const x = width / 2 - totalWidth / 2;
  const y = 18;

  return {
    help: {
      action: "open-help",
      x,
      y,
      width: helpWidth,
      height: 32,
    },
    radar: {
      action: "toggle-panel",
      x: x + helpWidth + gap,
      y,
      width: radarWidth,
      height: 32,
    },
    weapon: {
      action: "toggle-panel",
      x: x + helpWidth + gap + radarWidth + gap,
      y,
      width: weaponWidth,
      height: 32,
    },
  };
}

function drawHelpButton(width: number): void {
  const label = uiLanguage === "fr" ? "AIDE" : "HELP";
  const { help: button } = getTopButtonLayout(width);

  helpButtons = helpOpen ? helpButtons.filter((candidate) => candidate.action !== "open-help") : [button];
  ctx.save();
  ctx.fillStyle = "#12383c";
  ctx.fillRect(button.x, button.y, button.width, button.height);
  ctx.strokeStyle = "#5dd7d2";
  ctx.lineWidth = 2;
  ctx.strokeRect(button.x + 1, button.y + 1, button.width - 2, button.height - 2);
  drawPixelText(label, button.x + 14, button.y + 9, 3, "#eef2f3");
  ctx.restore();
}

function drawWeaponMenu(width: number, height: number): void {
  const topButtons = getTopButtonLayout(width);
  const toggleButton = topButtons.weapon;
  const panelWidth = 242;
  const panelHeight = 132;
  const x = Math.min(width - panelWidth - 16, Math.max(16, toggleButton.x + toggleButton.width / 2 - panelWidth / 2));
  const preferredY = toggleButton.y + toggleButton.height + 12;
  const y = Math.min(Math.max(preferredY, height - panelHeight - 18), preferredY);
  const detectorButton: WeaponButton = {
    action: "toggle-detector",
    x: x + panelWidth - 78,
    y: y + 56,
    width: 56,
    height: 28,
  };

  weaponButtons = weaponOptionsOpen ? [toggleButton, detectorButton] : [toggleButton];
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = weaponOptionsOpen ? "#3b2b16" : detectorEnabled ? "#203845" : "#1f2430";
  ctx.fillRect(toggleButton.x, toggleButton.y, toggleButton.width, toggleButton.height);
  ctx.strokeStyle = detectorEnabled ? "#ffcf5a" : weaponOptionsOpen ? "#ffcf5a" : "#46505e";
  ctx.lineWidth = 2;
  ctx.strokeRect(toggleButton.x + 1, toggleButton.y + 1, toggleButton.width - 2, toggleButton.height - 2);
  drawPixelText("ARME", toggleButton.x + 15, toggleButton.y + 9, 3, detectorEnabled ? "#ffcf5a" : "#a9b1b7");

  if (!weaponOptionsOpen) {
    ctx.restore();
    return;
  }

  drawPanelFrame(x, y, panelWidth, panelHeight);
  drawPixelText("DETECTEUR", x + 18, y + 16, 3, "#ffcf5a");
  drawPixelText("RAYON", x + 22, y + 55, 2, "#a9b1b7");
  drawPixelText(String(Math.round(detectorRange)), x + 92, y + 51, 3, "#ffcf5a");
  drawPixelText("ENERGIE", x + 22, y + 84, 2, "#a9b1b7");
  drawPixelSprite(resourceSprites.energy, x + 104, y + 93, 2);
  drawPixelText(String(getDetectorEnergyCost()), x + 128, y + 80, 3, "#ffef6e");
  drawPixelText("KILL", x + 164, y + 84, 2, "#a9b1b7");
  drawPixelText(String(detectorKills), x + 212, y + 80, 3, "#ff6f61");
  ctx.fillStyle = detectorEnabled ? "#12383c" : "#241820";
  ctx.fillRect(detectorButton.x, detectorButton.y, detectorButton.width, detectorButton.height);
  ctx.strokeStyle = detectorEnabled ? "#5dd7d2" : "#46505e";
  ctx.strokeRect(detectorButton.x + 1, detectorButton.y + 1, detectorButton.width - 2, detectorButton.height - 2);
  drawPixelText(detectorEnabled ? "ON" : "OFF", detectorButton.x + 9, detectorButton.y + 9, 2, detectorEnabled ? "#eef2f3" : "#6b7280");

  if (detectorActiveTimer > 0) {
    drawPixelBar(x + 22, y + 110, panelWidth - 44, 10, detectorActiveTimer, gameConfig.enemyDetector.activeFrames, "#fff1a8");
  } else if (detectorCooldown > 0) {
    drawPixelBar(x + 22, y + 110, panelWidth - 44, 10, gameConfig.enemyDetector.cooldownFrames - detectorCooldown, gameConfig.enemyDetector.cooldownFrames, "#ffcf5a");
  }

  ctx.restore();
}

function drawHelpRow(
  icon: PixelSprite,
  title: string,
  description: string,
  x: number,
  y: number,
  color: string,
): void {
  drawPixelSprite(icon, x + 22, y + 18, 2.4);
  drawReadableText(title, x + 58, y + 8, color, 14);
  drawReadableText(description, x + 58, y + 27, "#d7dde2", 12);
}

function drawHelpOverlay(width: number, height: number): void {
  if (!helpOpen) {
    return;
  }

  const isFr = uiLanguage === "fr";
  const boxWidth = Math.min(760, width - 44);
  const boxHeight = Math.min(648, height - 44);
  const x = width / 2 - boxWidth / 2;
  const y = height / 2 - boxHeight / 2;
  const closeButton: HelpButton = { action: "close-help", x: x + boxWidth - 54, y: y + 18, width: 34, height: 30 };
  const frButton: HelpButton = { action: "lang-fr", x: x + boxWidth - 172, y: y + 58, width: 52, height: 28 };
  const enButton: HelpButton = { action: "lang-en", x: x + boxWidth - 112, y: y + 58, width: 52, height: 28 };
  const rows = [
    {
      icon: resourceSprites.life,
      title: isFr ? "COEUR / VIE" : "HEART / LIFE",
      description: isFr ? "Restaure la vie et remet la barre VIE DANS au maximum." : "Restores life and refills the LIFE TIMER bar.",
      color: "#ff6f86",
    },
    {
      icon: resourceSprites.energy,
      title: isFr ? "ECLAIR / ENERGIE" : "BOLT / ENERGY",
      description: isFr ? "Sert a tirer et a payer une sauvegarde." : "Used to shoot and to pay for saves.",
      color: "#ffef6e",
    },
    {
      icon: resourceSprites.gold,
      title: isFr ? "OR" : "GOLD",
      description: isFr ? "Permet d'acheter des capacites dans les magasins." : "Buys capacity upgrades in shops.",
      color: "#ffcf5a",
    },
    {
      icon: resourceSprites.save,
      title: isFr ? "SAUVEGARDE" : "SAVE POINT",
      description: isFr ? "Point de retour payant en energie. Memorise ressources et capacites." : "Energy-paid checkpoint. Stores resources and capacities.",
      color: "#60a5fa",
    },
    {
      icon: resourceSprites.shipPart,
      title: isFr ? "PIECE VAISSEAU" : "SHIP PART",
      description: isFr ? "Recupere toutes les pieces pour reparer le vaisseau." : "Collect every part to repair the ship.",
      color: "#d7f3ff",
    },
    {
      icon: baseShipSprite,
      title: isFr ? "VAISSEAU DEPART" : "START SHIP",
      description: isFr ? "Grand vaisseau au point de depart, objectif final a reparer." : "Large ship at the start point, final repair objective.",
      color: "#5dd7d2",
    },
    {
      icon: enemySprites.crawler,
      title: isFr ? "CRAWLER" : "CRAWLER",
      description: isFr ? "Ennemi mobile. Il fonce sur le joueur quand il entre dans son cercle." : "Moving enemy. Chases the player inside its range circle.",
      color: "#ff6f61",
    },
    {
      icon: enemySprites.turret,
      title: isFr ? "TOURELLE" : "TURRET",
      description: isFr ? "Immobile. Tire a portee. Un impact retire un coeur." : "Static. Shoots in range. A hit removes one heart.",
      color: "#f97316",
    },
    {
      icon: resourceSprites.energy,
      title: isFr ? "DETECTEUR" : "DETECTOR",
      description: isFr ? "Arme automatique. Explose les ennemis proches et consomme de l'energie." : "Automatic weapon. Explodes nearby enemies and spends energy.",
      color: "#ffcf5a",
    },
    {
      icon: enemySprites.nest,
      title: isFr ? "NID" : "NEST",
      description: isFr ? "Immobile. Produit des spawnlings qui explorent la sphere." : "Static. Produces spawnlings that explore the sphere.",
      color: "#dc2626",
    },
    {
      icon: resourceSprites.shop,
      title: isFr ? "MAGASIN" : "SHOP",
      description: isFr ? "Achete des capacites de vie, energie, or et radar." : "Buys life, energy, gold and radar capacity upgrades.",
      color: "#b779ff",
    },
  ];

  helpButtons = [closeButton, frButton, enButton];
  ctx.save();
  ctx.fillStyle = "rgba(3, 6, 10, 0.72)";
  ctx.fillRect(0, 0, width, height);
  drawPanelFrame(x, y, boxWidth, boxHeight);
  drawPixelText(isFr ? "AIDE" : "HELP", x + 28, y + 24, 5, "#eef2f3");
  drawReadableText(isFr ? "Objets, ennemis et ressources" : "Items, enemies and resources", x + 32, y + 72, "#a9b1b7", 13);

  for (const button of [frButton, enButton]) {
    const selected = (button.action === "lang-fr" && isFr) || (button.action === "lang-en" && !isFr);
    ctx.fillStyle = selected ? "#12383c" : "#1f2430";
    ctx.fillRect(button.x, button.y, button.width, button.height);
    ctx.strokeStyle = selected ? "#5dd7d2" : "#46505e";
    ctx.strokeRect(button.x + 1, button.y + 1, button.width - 2, button.height - 2);
    drawPixelText(button.action === "lang-fr" ? "FR" : "EN", button.x + 12, button.y + 8, 2, selected ? "#eef2f3" : "#a9b1b7");
  }

  ctx.fillStyle = "#33151a";
  ctx.fillRect(closeButton.x, closeButton.y, closeButton.width, closeButton.height);
  ctx.strokeStyle = "#ff6f61";
  ctx.strokeRect(closeButton.x + 1, closeButton.y + 1, closeButton.width - 2, closeButton.height - 2);
  drawPixelText("X", closeButton.x + 11, closeButton.y + 8, 3, "#ff6f61");

  const startY = y + 112;
  const rowHeight = 50;
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const rowY = startY + index * rowHeight;

    if (rowY + rowHeight > y + boxHeight - 20) {
      break;
    }

    ctx.fillStyle = index % 2 === 0 ? "rgba(20, 28, 36, 0.52)" : "rgba(10, 16, 22, 0.52)";
    ctx.fillRect(x + 18, rowY, boxWidth - 36, rowHeight - 6);
    drawHelpRow(row.icon, row.title, row.description, x + 18, rowY, row.color);
  }

  ctx.restore();
}

function drawExplosion(explosion: ProjectedExplosion, front: boolean): void {
  if (!front) {
    return;
  }

  const progress = explosion.age / explosion.ttl;
  const radius = 8 + progress * 22;
  const sparks = 8;

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = 1 - progress;

  for (let index = 0; index < sparks; index += 1) {
    const angle = (index / sparks) * TAU + progress * 0.8;
    const distance = radius * (0.35 + progress);
    const x = explosion.x + Math.cos(angle) * distance;
    const y = explosion.y + Math.sin(angle) * distance;

    ctx.fillStyle = index % 2 === 0 ? "#ffcf5a" : "#ff6f61";
    ctx.fillRect(Math.round(x - 3), Math.round(y - 3), 6, 6);
  }

  ctx.fillStyle = progress < 0.5 ? "#fff1a8" : "#ffcf5a";
  ctx.fillRect(Math.round(explosion.x - 4), Math.round(explosion.y - 4), 8, 8);
  ctx.restore();
}

function getRadarColor(kind: RadarObject["kind"]): string {
  if (kind === "life") return "#ff6f86";
  if (kind === "energy") return "#ffef6e";
  if (kind === "gold") return "#ffcf5a";
  if (kind === "shop") return "#b779ff";
  if (kind === "save") return "#60a5fa";
  if (kind === "shipPart") return "#d7f3ff";
  if (kind === "baseShip") return "#5dd7d2";
  if (kind === "enemy:crawler") return "#ff6f61";
  if (kind === "enemy:spawnling") return "#f97316";
  if (kind === "enemy:nest") return "#dc2626";
  if (kind === "enemy:turret") return "#fb7185";
  return "#ff6f61";
}

function drawRadarKindIcon(kind: RadarKind, x: number, y: number, pixelSize: number): void {
  if (kind === "baseShip") {
    drawPixelSprite(baseShipSprite, x, y, Math.max(1.2, pixelSize * 0.72));
    return;
  }

  if (isEnemyRadarKind(kind)) {
    drawPixelSprite(radarSkullSprite, x, y, pixelSize);
    return;
  }

  drawPixelSprite(resourceSprites[kind], x, y, pixelSize);
}

function drawRadarFilterPanel(width: number, height: number): void {
  const rows = (Object.keys(radarFilters) as RadarKind[]).map((kind) => ({
    kind,
    label: radarLabels[kind],
  }));
  const panelWidth = 228;
  const rowHeight = 36;
  const panelPaddingTop = 94;
  const panelPaddingBottom = 18;
  const panelHeight = panelPaddingTop + rows.length * rowHeight + panelPaddingBottom;
  const topButtons = getTopButtonLayout(width);
  const x = Math.max(16, width / 2 - panelWidth / 2);
  const preferredY = topButtons.radar.y + topButtons.radar.height + 12;
  const maxY = Math.max(preferredY, height - panelHeight - 18);
  const y = Math.min(maxY, preferredY);
  const toggleButton = topButtons.radar;

  const disableAllButton: RadarFilterButton = {
    action: "disable-all",
    x: x + 18,
    y: y + 50,
    width: panelWidth - 36,
    height: 28,
  };

  radarFilterButtons = [toggleButton];
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = radarOptionsOpen ? "#12383c" : "#1f2430";
  ctx.fillRect(toggleButton.x, toggleButton.y, toggleButton.width, toggleButton.height);
  ctx.strokeStyle = radarOptionsOpen ? "#5dd7d2" : "#46505e";
  ctx.lineWidth = 2;
  ctx.strokeRect(toggleButton.x + 1, toggleButton.y + 1, toggleButton.width - 2, toggleButton.height - 2);
  drawPixelText("RADAR", toggleButton.x + 14, toggleButton.y + 9, 3, radarOptionsOpen ? "#eef2f3" : "#5dd7d2");

  if (!radarOptionsOpen) {
    ctx.restore();
    return;
  }

  ctx.fillStyle = "rgba(6, 9, 14, 0.82)";
  ctx.fillRect(x, y, panelWidth, panelHeight);
  ctx.strokeStyle = "#5dd7d2";
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, panelWidth - 2, panelHeight - 2);
  ctx.fillStyle = "#111827";
  ctx.fillRect(x + 6, y + 6, panelWidth - 12, panelHeight - 12);
  ctx.strokeStyle = "#203845";
  ctx.strokeRect(x + 7, y + 7, panelWidth - 14, panelHeight - 14);
  drawPixelText("RADAR", x + 20, y + 16, 3, "#eef2f3");

  radarFilterButtons.push(disableAllButton);
  ctx.fillStyle = "#241820";
  ctx.fillRect(disableAllButton.x, disableAllButton.y, disableAllButton.width, disableAllButton.height);
  ctx.strokeStyle = "#ff6f61";
  ctx.strokeRect(disableAllButton.x + 1, disableAllButton.y + 1, disableAllButton.width - 2, disableAllButton.height - 2);
  drawPixelText("TOUS OFF", disableAllButton.x + 28, disableAllButton.y + 8, 2, "#ff6f61");

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const rowY = y + panelPaddingTop + index * rowHeight;
    const enabled = radarFilters[row.kind];
    const color = getRadarColor(row.kind);
    const button: RadarFilterButton = {
      action: "toggle-kind",
      kind: row.kind,
      x: x + panelWidth - 76,
      y: rowY - 6,
      width: 54,
      height: 26,
    };

    radarFilterButtons.push(button);
    drawRadarKindIcon(row.kind, x + 28, rowY + 6, isEnemyRadarKind(row.kind) ? 2 : 2.2);
    drawPixelText(row.label, x + 52, rowY, 2, enabled ? color : "#6b7280");
    ctx.fillStyle = enabled ? "#12383c" : "#241820";
    ctx.fillRect(button.x, button.y, button.width, button.height);
    ctx.strokeStyle = enabled ? "#5dd7d2" : "#46505e";
    ctx.strokeRect(button.x + 1, button.y + 1, button.width - 2, button.height - 2);
    drawPixelText(enabled ? "ON" : "OFF", button.x + 9, button.y + 8, 2, enabled ? "#eef2f3" : "#6b7280");
  }

  ctx.restore();
}

function drawRadarBlips(cx: number, cy: number, clipRadius: number, sphereRadius: number, right: Vec3): void {
  const objects: RadarObject[] = [
    { kind: "baseShip", pos: startShipPos },
    ...resources.map((resource) => ({ kind: resource.kind, pos: resource.pos })),
    ...enemies.map((enemy) => ({ kind: getEnemyRadarKind(enemy.categoryId), pos: enemy.pos })),
  ];
  const blips = objects
    .map((object) => {
      const projectedX = dot(object.pos, right) * sphereRadius;
      const projectedY = -dot(object.pos, forward) * sphereRadius;
      const screenDistance = Math.hypot(projectedX, projectedY);
      const radarDistance = Math.max(0, (screenDistance - clipRadius) / (clipRadius / visibleRadiusWorld));

      return {
        ...object,
        projectedX,
        projectedY,
        screenDistance,
        radarDistance,
      };
    })
    .filter(
      (object) =>
        radarFilters[object.kind] &&
        object.screenDistance > clipRadius &&
        object.radarDistance <= distRadar,
    )
    .sort((a, b) => a.radarDistance - b.radarDistance)
    .slice(0, gameConfig.radar.maxBlips);

  ctx.save();
  ctx.imageSmoothingEnabled = false;

  for (const blip of blips) {
    const angle = Math.atan2(blip.projectedY, blip.projectedX);
    const x = cx + Math.cos(angle) * (clipRadius + 18);
    const y = cy + Math.sin(angle) * (clipRadius + 18);
    const color = getRadarColor(blip.kind);

    ctx.fillStyle = "#071014";
    ctx.fillRect(Math.round(x - 7), Math.round(y - 7), 14, 14);
    ctx.strokeStyle = color;
    ctx.strokeRect(Math.round(x - 7), Math.round(y - 7), 14, 14);

    if (isEnemyRadarKind(blip.kind) || blip.kind === "baseShip") {
      drawRadarKindIcon(blip.kind, x, y, 2);
    } else {
      ctx.fillStyle = color;
      ctx.fillRect(Math.round(x - 3), Math.round(y - 3), 6, 6);
    }

    drawPixelText(String(Math.round(blip.radarDistance)), x + 12, y - 9, 3, color);
  }

  ctx.restore();
}

function drawShopInterface(width: number, height: number): void {
  if (!shopOpen) {
    return;
  }

  const boxWidth = 520;
  const boxHeight = 466;
  const x = width / 2 - boxWidth / 2;
  const y = height / 2 - boxHeight / 2;
  const rows: Array<{ kind: CarryResourceKind; label: string; color: string }> = [
    { kind: "life", label: "VIE", color: "#ff6f86" },
    { kind: "energy", label: "ENERGIE", color: "#ffef6e" },
    { kind: "gold", label: "OR", color: "#ffcf5a" },
  ];

  shopButtons = [];
  ctx.save();
  ctx.fillStyle = "rgba(6, 9, 14, 0.94)";
  ctx.fillRect(x, y, boxWidth, boxHeight);
  ctx.strokeStyle = "#b779ff";
  ctx.lineWidth = 3;
  ctx.strokeRect(x + 2, y + 2, boxWidth - 4, boxHeight - 4);
  ctx.fillStyle = "#111827";
  ctx.fillRect(x + 10, y + 10, boxWidth - 20, boxHeight - 20);
  ctx.strokeStyle = "#2dd4bf";
  ctx.strokeRect(x + 12, y + 12, boxWidth - 24, boxHeight - 24);

  drawPixelSprite(resourceSprites.shop, x + 56, y + 48, 4);
  drawPixelText("SHOP", x + 96, y + 30, 5, "#b779ff");
  drawPixelText("OR", x + 332, y + 34, 3, "#ffcf5a");
  drawPixelText(String(collectedResources.gold), x + 370, y + 32, 4, "#ffcf5a");

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const rowY = y + 88 + index * 58;
    const cost = getUpgradeCost(row.kind);
    const button = {
      action: `buy-${row.kind}` as ShopButton["action"],
      x: x + 348,
      y: rowY - 8,
      width: 126,
      height: 38,
    };

    shopButtons.push(button);
    drawPixelSprite(resourceSprites[row.kind], x + 42, rowY + 8, 3);
    drawPixelText(row.label, x + 76, rowY, 3, row.color);
    drawPixelText("CAP", x + 178, rowY, 2, "#a9b1b7");
    drawPixelText(String(resourceCapacity[row.kind]), x + 226, rowY - 2, 3, row.color);
    drawPixelText("COUT", x + 178, rowY + 24, 2, "#a9b1b7");
    drawPixelText(String(cost), x + 242, rowY + 20, 3, "#ffcf5a");

    ctx.fillStyle = collectedResources.gold >= cost ? "#203845" : "#1f2430";
    ctx.fillRect(button.x, button.y, button.width, button.height);
    ctx.strokeStyle = collectedResources.gold >= cost ? "#5dd7d2" : "#46505e";
    ctx.strokeRect(button.x + 1, button.y + 1, button.width - 2, button.height - 2);
    drawPixelText("BUY", button.x + 30, button.y + 11, 3, collectedResources.gold >= cost ? "#eef2f3" : "#6b7280");
  }

  const radarRowY = y + 88 + rows.length * 58;
  const radarCost = getRadarUpgradeCost();
  const radarButton: ShopButton = {
    action: "buy-radar",
    x: x + 348,
    y: radarRowY - 8,
    width: 126,
    height: 38,
  };

  shopButtons.push(radarButton);
  ctx.fillStyle = "#071014";
  ctx.fillRect(x + 29, radarRowY - 5, 24, 24);
  ctx.strokeStyle = "#5dd7d2";
  ctx.strokeRect(x + 29, radarRowY - 5, 24, 24);
  ctx.fillStyle = "#5dd7d2";
  ctx.fillRect(x + 38, radarRowY + 4, 6, 6);
  drawPixelText("RADAR", x + 76, radarRowY, 3, "#5dd7d2");
  drawPixelText("DIST", x + 178, radarRowY, 2, "#a9b1b7");
  drawPixelText(String(Math.round(distRadar)), x + 242, radarRowY - 2, 3, "#5dd7d2");
  drawPixelText("COUT", x + 178, radarRowY + 24, 2, "#a9b1b7");
  drawPixelText(String(radarCost), x + 242, radarRowY + 20, 3, "#ffcf5a");

  ctx.fillStyle = collectedResources.gold >= radarCost ? "#203845" : "#1f2430";
  ctx.fillRect(radarButton.x, radarButton.y, radarButton.width, radarButton.height);
  ctx.strokeStyle = collectedResources.gold >= radarCost ? "#5dd7d2" : "#46505e";
  ctx.strokeRect(radarButton.x + 1, radarButton.y + 1, radarButton.width - 2, radarButton.height - 2);
  drawPixelText("BUY", radarButton.x + 30, radarButton.y + 11, 3, collectedResources.gold >= radarCost ? "#eef2f3" : "#6b7280");

  const detectorRowY = radarRowY + 58;
  const detectorCost = getDetectorUpgradeCost();
  const detectorButton: ShopButton = {
    action: "buy-detector",
    x: x + 348,
    y: detectorRowY - 8,
    width: 126,
    height: 38,
  };

  shopButtons.push(detectorButton);
  ctx.fillStyle = "#3b2b16";
  ctx.fillRect(x + 29, detectorRowY - 5, 24, 24);
  ctx.strokeStyle = "#ffcf5a";
  ctx.strokeRect(x + 29, detectorRowY - 5, 24, 24);
  ctx.fillStyle = "#ffcf5a";
  ctx.fillRect(x + 36, detectorRowY + 2, 10, 10);
  ctx.fillStyle = "#111827";
  ctx.fillRect(x + 39, detectorRowY + 5, 4, 4);
  drawPixelText("DETECT", x + 76, detectorRowY, 3, "#ffcf5a");
  drawPixelText("RAYON", x + 178, detectorRowY, 2, "#a9b1b7");
  drawPixelText(String(Math.round(detectorRange)), x + 242, detectorRowY - 2, 3, "#ffcf5a");
  drawPixelText("COUT", x + 178, detectorRowY + 24, 2, "#a9b1b7");
  drawPixelText(String(detectorCost), x + 242, detectorRowY + 20, 3, "#ffcf5a");

  ctx.fillStyle = collectedResources.gold >= detectorCost ? "#3b2b16" : "#1f2430";
  ctx.fillRect(detectorButton.x, detectorButton.y, detectorButton.width, detectorButton.height);
  ctx.strokeStyle = collectedResources.gold >= detectorCost ? "#ffcf5a" : "#46505e";
  ctx.strokeRect(detectorButton.x + 1, detectorButton.y + 1, detectorButton.width - 2, detectorButton.height - 2);
  drawPixelText("BUY", detectorButton.x + 30, detectorButton.y + 11, 3, collectedResources.gold >= detectorCost ? "#eef2f3" : "#6b7280");

  const speedRowY = detectorRowY + 58;
  const speedCost = getSpeedUpgradeCost();
  const canBuySpeed = collectedResources.gold >= speedCost && speed < gameConfig.shopUpgrades.speed.maxSpeed;
  const speedButton: ShopButton = {
    action: "buy-speed",
    x: x + 348,
    y: speedRowY - 8,
    width: 126,
    height: 38,
  };

  shopButtons.push(speedButton);
  ctx.fillStyle = "#101827";
  ctx.fillRect(x + 29, speedRowY - 5, 24, 24);
  ctx.strokeStyle = "#34d399";
  ctx.strokeRect(x + 29, speedRowY - 5, 24, 24);
  ctx.fillStyle = "#34d399";
  ctx.fillRect(x + 35, speedRowY + 7, 14, 4);
  ctx.fillRect(x + 43, speedRowY + 3, 4, 12);
  drawPixelText("VITESSE", x + 76, speedRowY, 3, "#34d399");
  drawPixelText("NIV", x + 178, speedRowY, 2, "#a9b1b7");
  drawPixelText(String(Math.round(speed * 100)), x + 226, speedRowY - 2, 3, "#34d399");
  drawPixelText("COUT", x + 178, speedRowY + 24, 2, "#a9b1b7");
  drawPixelText(speed >= gameConfig.shopUpgrades.speed.maxSpeed ? "MAX" : String(speedCost), x + 242, speedRowY + 20, 3, "#ffcf5a");

  ctx.fillStyle = canBuySpeed ? "#123827" : "#1f2430";
  ctx.fillRect(speedButton.x, speedButton.y, speedButton.width, speedButton.height);
  ctx.strokeStyle = canBuySpeed ? "#34d399" : "#46505e";
  ctx.strokeRect(speedButton.x + 1, speedButton.y + 1, speedButton.width - 2, speedButton.height - 2);
  drawPixelText("BUY", speedButton.x + 30, speedButton.y + 11, 3, canBuySpeed ? "#eef2f3" : "#6b7280");

  const closeButton: ShopButton = { action: "close", x: x + boxWidth - 72, y: y + 22, width: 42, height: 34 };
  shopButtons.push(closeButton);
  ctx.fillStyle = "#33151a";
  ctx.fillRect(closeButton.x, closeButton.y, closeButton.width, closeButton.height);
  ctx.strokeStyle = "#ff6f61";
  ctx.strokeRect(closeButton.x + 1, closeButton.y + 1, closeButton.width - 2, closeButton.height - 2);
  drawPixelText("X", closeButton.x + 14, closeButton.y + 9, 3, "#ff6f61");
  ctx.restore();
}

function drawSavePrompt(width: number, height: number): void {
  if (!pendingSavePoint) {
    return;
  }

  const saveCost = getSaveEnergyCost();
  const boxWidth = 430;
  const boxHeight = 172;
  const x = width / 2 - boxWidth / 2;
  const y = height / 2 - boxHeight / 2;
  const yesButton: SavePromptButton = {
    action: "save-confirm",
    x: x + 76,
    y: y + 112,
    width: 112,
    height: 38,
  };
  const noButton: SavePromptButton = {
    action: "save-cancel",
    x: x + 242,
    y: y + 112,
    width: 112,
    height: 38,
  };

  savePromptButtons = [yesButton, noButton];
  ctx.save();
  ctx.fillStyle = "rgba(6, 9, 14, 0.94)";
  ctx.fillRect(x, y, boxWidth, boxHeight);
  ctx.strokeStyle = "#60a5fa";
  ctx.lineWidth = 3;
  ctx.strokeRect(x + 2, y + 2, boxWidth - 4, boxHeight - 4);
  ctx.fillStyle = "#111827";
  ctx.fillRect(x + 10, y + 10, boxWidth - 20, boxHeight - 20);
  ctx.strokeStyle = "#2dd4bf";
  ctx.strokeRect(x + 12, y + 12, boxWidth - 24, boxHeight - 24);
  drawPixelSprite(resourceSprites.save, x + 56, y + 62, 3);
  drawPixelText("SAUVEGARDER", x + 104, y + 36, 4, "#d7f3ff");
  drawPixelText("CE POINT", x + 126, y + 78, 3, "#60a5fa");
  drawPixelText("COUT", x + 262, y + 78, 2, "#a9b1b7");
  drawPixelSprite(resourceSprites.energy, x + 324, y + 85, 2);
  drawPixelText(String(saveCost), x + 346, y + 74, 3, "#ffef6e");

  if (savePromptMessage) {
    drawPixelText(savePromptMessage, x + 104, y + 98, 2, "#ff6f61");
  }

  ctx.fillStyle = "#12383c";
  ctx.fillRect(yesButton.x, yesButton.y, yesButton.width, yesButton.height);
  ctx.strokeStyle = "#5dd7d2";
  ctx.strokeRect(yesButton.x + 1, yesButton.y + 1, yesButton.width - 2, yesButton.height - 2);
  drawPixelText("OUI", yesButton.x + 29, yesButton.y + 11, 3, "#eef2f3");

  ctx.fillStyle = "#33151a";
  ctx.fillRect(noButton.x, noButton.y, noButton.width, noButton.height);
  ctx.strokeStyle = "#ff6f61";
  ctx.strokeRect(noButton.x + 1, noButton.y + 1, noButton.width - 2, noButton.height - 2);
  drawPixelText("NON", noButton.x + 29, noButton.y + 11, 3, "#eef2f3");
  ctx.restore();
}

function drawGameOver(width: number, height: number): void {
  if (!gameOver) {
    return;
  }

  const boxWidth = 304;
  const boxHeight = 96;
  const x = width / 2 - boxWidth / 2;
  const y = height / 2 - boxHeight / 2;

  ctx.save();
  ctx.fillStyle = "rgba(6, 9, 14, 0.9)";
  ctx.fillRect(x, y, boxWidth, boxHeight);
  ctx.strokeStyle = "#ff6f61";
  ctx.lineWidth = 3;
  ctx.strokeRect(x + 2, y + 2, boxWidth - 4, boxHeight - 4);
  drawPixelText("GAME OVER", x + 42, y + 32, 5, "#ff6f61");
  ctx.restore();
}

function drawVictory(width: number, height: number): void {
  if (!gameWon) {
    return;
  }

  const boxWidth = 420;
  const boxHeight = 126;
  const x = width / 2 - boxWidth / 2;
  const y = height / 2 - boxHeight / 2;

  ctx.save();
  ctx.fillStyle = "rgba(6, 9, 14, 0.92)";
  ctx.fillRect(x, y, boxWidth, boxHeight);
  ctx.strokeStyle = "#5dd7d2";
  ctx.lineWidth = 3;
  ctx.strokeRect(x + 2, y + 2, boxWidth - 4, boxHeight - 4);
  drawPixelText("VICTOIRE", x + 76, y + 26, 5, "#5dd7d2");
  drawReadableText("Vaisseau repare et planete nettoyee.", x + 64, y + 86, "#d7f3ff", 14);
  ctx.restore();
}

function draw(): void {
  resize();

  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const { cx, cy, clipRadius, sphereRadius, right } = getProjectionBasis();
  const worldToScreen = clipRadius / visibleRadiusWorld;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#0f1115";
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, clipRadius, 0, TAU);
  ctx.clip();

  const shade = ctx.createRadialGradient(
    cx - clipRadius * 0.25,
    cy - clipRadius * 0.28,
    clipRadius * 0.1,
    cx,
    cy,
    clipRadius,
  );
  shade.addColorStop(0, "#202834");
  shade.addColorStop(0.58, "#151a21");
  shade.addColorStop(1, "#090b0e");
  ctx.fillStyle = shade;
  ctx.fillRect(cx - clipRadius, cy - clipRadius, clipRadius * 2, clipRadius * 2);
  drawTerrain(cx, cy, sphereRadius, right);
  drawGrid(cx, cy, sphereRadius);

  const projected = resources
    .map<ProjectedResource>((resource) => {
      const depth = dot(resource.pos, p);

      return {
        ...resource,
        depth,
        x: cx + dot(resource.pos, right) * sphereRadius,
        y: cy - dot(resource.pos, forward) * sphereRadius,
      };
    })
    .sort((a, b) => a.depth - b.depth);
  const projectedBaseShip = {
    depth: dot(startShipPos, p),
    x: cx + dot(startShipPos, right) * sphereRadius,
    y: cy - dot(startShipPos, forward) * sphereRadius,
  };
  const projectedEnemies = enemies
    .map<ProjectedEnemy>((enemy) => {
      const depth = dot(enemy.pos, p);

      return {
        ...enemy,
        depth,
        x: cx + dot(enemy.pos, right) * sphereRadius,
        y: cy - dot(enemy.pos, forward) * sphereRadius,
      };
    })
    .sort((a, b) => a.depth - b.depth);
  const projectedShots = shots
    .map<ProjectedShot>((shot) => {
      const depth = dot(shot.pos, p);

      return {
        ...shot,
        depth,
        x: cx + dot(shot.pos, right) * sphereRadius,
        y: cy - dot(shot.pos, forward) * sphereRadius,
      };
    })
    .sort((a, b) => a.depth - b.depth);
  const projectedEnemyShots = enemyShots
    .map<ProjectedEnemyShot>((shot) => {
      const depth = dot(shot.pos, p);

      return {
        ...shot,
        depth,
        x: cx + dot(shot.pos, right) * sphereRadius,
        y: cy - dot(shot.pos, forward) * sphereRadius,
      };
    })
    .sort((a, b) => a.depth - b.depth);
  const projectedExplosions = explosions
    .map<ProjectedExplosion>((explosion) => {
      const depth = dot(explosion.pos, p);

      return {
        ...explosion,
        depth,
        x: cx + dot(explosion.pos, right) * sphereRadius,
        y: cy - dot(explosion.pos, forward) * sphereRadius,
      };
    })
    .sort((a, b) => a.depth - b.depth);

  for (const resource of projected) {
    const front = resource.depth >= 0;
    const size = Math.max(10, resource.size * worldToScreen * 2.4 * (front ? 1 : 0.72));
    const alpha = front ? 0.96 : 0.16;

    ctx.globalAlpha = alpha;
    drawResource(resource, size, front);
  }

  ctx.globalAlpha = projectedBaseShip.depth >= 0 ? 0.98 : 0;
  drawBaseShip(projectedBaseShip.x, projectedBaseShip.y, projectedBaseShip.depth >= 0);

  ctx.globalAlpha = 1;
  for (const enemy of projectedEnemies) {
    drawEnemyThreatRange(enemy, worldToScreen, cx, cy, sphereRadius, right);
  }

  drawDetectorRange(cx, cy, worldToScreen);

  for (const enemy of projectedEnemies) {
    const front = enemy.depth >= 0;
    const size = Math.max(12, enemy.size * worldToScreen * 2.8 * (front ? 1 : 0.7));
    const alpha = front ? 0.98 : 0.2;

    ctx.globalAlpha = alpha;
    drawEnemy(enemy, size, front);
  }

  for (const shot of projectedShots) {
    const front = shot.depth >= 0;
    const size = Math.max(8, worldToScreen * 1.2);

    ctx.globalAlpha = front ? 0.98 : 0;
    drawShot(shot, size, front);
  }

  for (const shot of projectedEnemyShots) {
    const front = shot.depth >= 0;
    const size = Math.max(gameConfig.enemies.turret.shoot.projectileSize, worldToScreen * 1.8);

    ctx.globalAlpha = front ? 0.98 : 0;
    drawEnemyShot(shot, size, front);
  }

  for (const explosion of projectedExplosions) {
    const front = explosion.depth >= 0;

    ctx.globalAlpha = front ? 1 : 0;
    drawExplosion(explosion, front);
  }

  ctx.globalAlpha = 1;
  ctx.restore();

  ctx.strokeStyle = "rgba(238, 242, 243, 0.75)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, clipRadius, 0, TAU);
  ctx.stroke();

  ctx.strokeStyle = "rgba(93, 215, 210, 0.9)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, clipRadius + 8, -Math.PI / 2 - 0.25, -Math.PI / 2 + 0.25);
  ctx.stroke();

  if (restorePhase === "idle") {
    drawRadarBlips(cx, cy, clipRadius, sphereRadius, right);
  }

  if (restorePhase !== "collapse") {
    drawPlayer(cx, cy);
  }

  drawRadarFilterPanel(width, height);
  drawHud(width);
  drawShipBlueprint(width, height);
  drawHelpButton(width);
  drawWeaponMenu(width, height);
  drawShopInterface(width, height);
  drawSavePrompt(width, height);
  drawHelpOverlay(width, height);
  drawVictory(width, height);
  drawGameOver(width, height);
}

function step(time: number): void {
  const dt = Math.min(32, time - lastTime || 16) / 16.67;
  lastTime = time;

  if (restorePhase !== "idle") {
    updateRestoreSequence(dt);
  } else if (!gameWon && !gameOver && !helpOpen && !shopOpen && !pendingSavePoint) {
    let isWalking = false;
    const wantsToWalk = pressed.has("ArrowUp") || pressed.has("ArrowDown") || mouseMoveTarget !== null;

    if (pressed.has("ArrowUp")) {
      move(moveStep * speed * dt);
      isWalking = true;
    }

    if (pressed.has("ArrowDown")) {
      move(-moveStep * speed * dt);
      isWalking = true;
    }

    if (pressed.has("ArrowRight")) turn(-turnStep * speed * dt);
    if (pressed.has("ArrowLeft")) turn(turnStep * speed * dt);

    isWalking = moveToMouseTarget(dt) || isWalking;
    playerWalkCycle = wantsToWalk || isWalking ? playerWalkCycle + dt * 1.6 : 0;
    updateMouseShot(dt);
    collectNearbyResources();
    updateShipRepair(dt);
    updateLifeDrain(dt);
    updateShots(dt);
    updateEnemyShots(dt);
    updateExplosions(dt);
    updateEnemyDetector(dt);
    updateEnemies(dt);
    checkVictory();
  }

  draw();
  requestAnimationFrame(step);
}

window.addEventListener("keydown", (event) => {
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(event.key)) {
    event.preventDefault();
  }

  if (restorePhase !== "idle") {
    return;
  }

  if (event.key === "Escape" && helpOpen) {
    helpOpen = false;
    return;
  }

  if (event.key === "Escape" && shopOpen) {
    ignoredShopId = activeShopId;
    shopOpen = false;
    return;
  }

  if (event.key === "Escape" && weaponOptionsOpen) {
    weaponOptionsOpen = false;
    return;
  }

  if (event.key === "Escape" && pendingSavePoint) {
    closeSavePrompt(false);
    return;
  }

  if (event.key === " " && !event.repeat) {
    fireShot();
  }

  pressed.add(event.key);
});

window.addEventListener("keyup", (event) => {
  pressed.delete(event.key);
});

canvas.addEventListener("contextmenu", (event) => {
  event.preventDefault();
});

canvas.addEventListener("mousedown", (event) => {
  if (restorePhase !== "idle") {
    event.preventDefault();
    return;
  }

  if (handleHelpClick(event)) {
    event.preventDefault();
    return;
  }

  if (handleSavePromptClick(event)) {
    event.preventDefault();
    return;
  }

  if (handleShopClick(event)) {
    event.preventDefault();
    return;
  }

  if (handleWeaponClick(event)) {
    event.preventDefault();
    return;
  }

  if (handleRadarFilterClick(event)) {
    event.preventDefault();
    return;
  }

  const target = getSpherePointFromMouse(event);

  if (!target) {
    return;
  }

  if (event.button === 2) {
    event.preventDefault();
    mouseMoveTarget = target;
    return;
  }

  if (event.button === 0) {
    event.preventDefault();
    mouseShotTarget = target;
  }
});

window.addEventListener("resize", draw);

reset();
setZoom(gameConfig.world.zoom);
setSphereSize(gameConfig.world.sphereRadius);
setSpeed(gameConfig.world.speed);
makeResources();
makeEnemies();
requestAnimationFrame(step);
