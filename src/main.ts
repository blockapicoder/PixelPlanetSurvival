import "./styles.css";
import { gameConfig, type CarryResourceKind } from "./gameConfig.ts";
import type {
  BiomeKind,
  Enemy,
  Explosion,
  PixelSprite,
  ProjectedEnemy,
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
} from "./model.ts";
import {
  enemySprite,
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
let resources: Resource[] = [];
let enemies: Enemy[] = [];
let shots: Shot[] = [];
let explosions: Explosion[] = [];
let resourceCount: number = gameConfig.resources.count;
let nextEnemyId = 1;
let lastTime = 0;
let playerWalkCycle = 0;
let zoom: number = gameConfig.world.zoom;
let sphereRadiusWorld: number = gameConfig.world.sphereRadius;
let visibleRadiusWorld = 1;
let speed: number = gameConfig.world.speed;
let minimumResourceDistance: number = gameConfig.resources.minimumDistance;
let collectedResources: Record<CarryResourceKind, number> = { ...gameConfig.player.initialResources };
let resourceCapacity: Record<CarryResourceKind, number> = { ...gameConfig.player.initialCapacity };
let capacityUpgradePurchases: Record<CarryResourceKind, number> = {
  life: 0,
  energy: 0,
  gold: 0,
};
let lifeDrainTimer: number = gameConfig.player.lifeDrain.intervalFrames;
let distRadar: number = gameConfig.radar.initialRange;
let radarUpgradePurchases = 0;
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
let radarFilters: Record<RadarKind, boolean> = {
  life: true,
  energy: true,
  gold: true,
  shop: true,
  save: true,
  enemy: true,
};
let radarFilterButtons: RadarFilterButton[] = [];
let restorePhase: RestorePhase = "idle";
let restoreTimer = 0;
let visibilityScale = 1;

const pressed = new Set<string>();

function isCarryResourceKind(kind: ResourceKind): kind is CarryResourceKind {
  return kind === "life" || kind === "energy" || kind === "gold";
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
  forward = norm(vec(0.12, 0.98, 0.15));
  forward = norm(add(forward, scale(p, -dot(forward, p))));
  createSaveState(p, null);
}

function respawnPlayer(): void {
  if (saveState) {
    collectedResources = { ...saveState.resources };
    resourceCapacity = { ...saveState.capacity };
    capacityUpgradePurchases = { ...saveState.capacityPurchases };
    lifeDrainTimer = gameConfig.player.lifeDrain.intervalFrames;
    distRadar = saveState.distRadar;
    radarUpgradePurchases = saveState.radarPurchases;
    ignoredSaveId = saveState.resourceId;
  }

  p = savePoint ?? saveState?.pos ?? p;
  forward = tangentToward(p, vec(0, 0, 1)) ?? norm(add(vec(0.12, 0.98, 0.15), scale(p, -dot(vec(0.12, 0.98, 0.15), p))));
  mouseMoveTarget = null;
  mouseShotTarget = null;
  shots = [];
  explosions = [];
}

function startRestoreSequence(): void {
  if (restorePhase !== "idle") {
    return;
  }

  shopOpen = false;
  pendingSavePoint = null;
  activeShopId = null;
  mouseMoveTarget = null;
  mouseShotTarget = null;
  pressed.clear();
  shots = [];
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

function moveTowardOnSurface(pos: Vec3, target: Vec3, distance: number): Vec3 {
  const tangent = add(target, scale(pos, -dot(target, pos)));

  if (Math.hypot(tangent.x, tangent.y, tangent.z) < 0.0001) {
    return pos;
  }

  return moveAlongSurface(pos, norm(tangent), distance).pos;
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

  resourceCount = nextCount;
  minimumResourceDistance = nextMinimumDistance;
  resources = next;
}

function makeEnemies(count = gameConfig.enemies.count): void {
  const next: Enemy[] = [];
  const maxAttempts = count * 120;
  let attempts = 0;

  while (next.length < count && attempts < maxAttempts) {
    attempts += 1;
    const pos = randomUnitVector();

    if (surfaceDistance(pos, p) < gameConfig.enemies.aggroDistance * 1.4) {
      continue;
    }

    next.push({
      id: nextEnemyId,
      pos,
      size: 0.9 + Math.random() * 0.35,
    });
    nextEnemyId += 1;
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
        lifeDrainTimer = gameConfig.player.lifeDrain.intervalFrames;
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

function fireShot(direction = forward): void {
  if (gameOver || restorePhase !== "idle" || shopOpen || collectedResources.energy < gameConfig.shots.energyCost) {
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

function updateExplosions(dt: number): void {
  explosions = explosions
    .map((explosion) => ({ ...explosion, age: explosion.age + dt }))
    .filter((explosion) => explosion.age < explosion.ttl);
}

function updateEnemies(dt: number): void {
  const remainingEnemies: Enemy[] = [];

  for (let index = 0; index < enemies.length; index += 1) {
    const enemy = enemies[index];
    let nextEnemy = enemy;
    const distanceToPlayer = surfaceDistance(enemy.pos, p);

    if (distanceToPlayer <= gameConfig.enemies.aggroDistance) {
      nextEnemy = {
        ...enemy,
        pos: moveTowardOnSurface(enemy.pos, p, gameConfig.enemies.moveDistance * dt),
      };
    }

    if (surfaceDistance(nextEnemy.pos, p) <= gameConfig.enemies.hitDistance) {
      collectedResources.life = Math.max(0, collectedResources.life - 1);
      startRestoreSequence();
      remainingEnemies.push(...enemies.slice(index + 1));
      break;
    }

    remainingEnemies.push(nextEnemy);
  }

  enemies = remainingEnemies;
}

function updateLifeDrain(dt: number): void {
  lifeDrainTimer = Math.max(0, lifeDrainTimer - dt);

  if (lifeDrainTimer > 0) {
    return;
  }

  collectedResources.life = Math.max(0, collectedResources.life - 1);
  lifeDrainTimer = gameConfig.player.lifeDrain.intervalFrames;
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
  speed = Math.max(0.25, Math.min(3, nextSpeed));
}

function getUpgradeCost(kind: CarryResourceKind): number {
  const upgrade = gameConfig.shopUpgrades[kind];
  return upgrade.baseCost + capacityUpgradePurchases[kind] * upgrade.costStep;
}

function getRadarUpgradeCost(): number {
  const upgrade = gameConfig.shopUpgrades.radar;
  return upgrade.baseCost + radarUpgradePurchases * upgrade.costStep;
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

function handleShopClick(event: MouseEvent): boolean {
  if (!shopOpen) {
    return false;
  }

  const point = getCanvasMousePosition(event);
  const button = shopButtons.find(
    (candidate) =>
      point.x >= candidate.x &&
      point.x <= candidate.x + candidate.width &&
      point.y >= candidate.y &&
      point.y <= candidate.y + candidate.height,
  );

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
  return true;
}

function handleRadarFilterClick(event: MouseEvent): boolean {
  const point = getCanvasMousePosition(event);
  const button = radarFilterButtons.find(
    (candidate) =>
      point.x >= candidate.x &&
      point.x <= candidate.x + candidate.width &&
      point.y >= candidate.y &&
      point.y <= candidate.y + candidate.height,
  );

  if (!button) {
    return false;
  }

  radarFilters[button.kind] = !radarFilters[button.kind];
  return true;
}

function closeSavePrompt(shouldSave: boolean): void {
  if (shouldSave && pendingSavePoint) {
    if (collectedResources.energy < gameConfig.saves.energyCost) {
      savePromptMessage = "ENERGIE BASSE";
      return;
    }

    collectedResources.energy -= gameConfig.saves.energyCost;
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
  const button = savePromptButtons.find(
    (candidate) =>
      point.x >= candidate.x &&
      point.x <= candidate.x + candidate.width &&
      point.y >= candidate.y &&
      point.y <= candidate.y + candidate.height,
  );

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

function drawHud(width: number): void {
  const pixelSize = 3;
  const panelWidth = 270;
  const panelHeight = 210;
  const x = Math.max(16, width - panelWidth - 22);
  const y = 22;
  const remainingResources = countRemainingResources();
  const rows: Array<{ kind: CarryResourceKind; color: string; collected: number; capacity: number; remaining: number }> =
    [
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

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "rgba(6, 9, 14, 0.82)";
  ctx.fillRect(x, y, panelWidth, panelHeight);
  ctx.strokeStyle = "#5dd7d2";
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, panelWidth - 2, panelHeight - 2);
  ctx.fillStyle = "#111827";
  ctx.fillRect(x + 6, y + 6, panelWidth - 12, panelHeight - 12);
  ctx.strokeStyle = "#203845";
  ctx.strokeRect(x + 7, y + 7, panelWidth - 14, panelHeight - 14);

  drawPixelText("RESSOURCES", x + 18, y + 16, 3, "#eef2f3");
  drawPixelText("COL", x + 58, y + 39, 2, "#a9b1b7");
  drawPixelText("CAP", x + 122, y + 39, 2, "#a9b1b7");
  drawPixelText("RESTE", x + 178, y + 39, 2, "#a9b1b7");

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const rowY = y + 58 + index * 24;

    drawPixelSprite(resourceSprites[row.kind], x + 34, rowY + 7, 2.5);
    drawPixelText(String(row.collected), x + 58, rowY, pixelSize, row.color);
    drawPixelText(String(row.capacity), x + 122, rowY, pixelSize, row.color);
    drawPixelText(String(row.remaining), x + 178, rowY, pixelSize, row.color);
  }

  drawPixelText("ENNEMIS", x + 18, y + 132, 2, "#ff6f61");
  drawPixelText(String(enemies.length), x + 102, y + 128, pixelSize, "#ff6f61");
  drawPixelText("RADAR", x + 18, y + 154, 2, "#5dd7d2");
  drawPixelText(String(Math.round(distRadar)), x + 102, y + 150, pixelSize, "#5dd7d2");
  drawPixelText("VIE DANS", x + 18, y + 176, 2, "#ff6f86");
  drawPixelText(String(Math.ceil(lifeDrainTimer / 60)), x + 126, y + 172, pixelSize, "#ff6f86");
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

function drawEnemy(enemy: ProjectedEnemy, size: number, front: boolean): void {
  if (!front) {
    ctx.fillStyle = "rgba(220,38,38,0.18)";
    ctx.fillRect(enemy.x - size / 2, enemy.y - size / 2, size, size);
    return;
  }

  drawPixelSprite(enemySprite, enemy.x, enemy.y, Math.max(2, Math.min(5, size / 4)));
}

function drawShot(shot: ProjectedShot, size: number, front: boolean): void {
  if (!front) {
    return;
  }

  drawPixelSprite(shotSprite, shot.x, shot.y, Math.max(2, Math.min(4, size / 3)));
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
  return "#ff6f61";
}

function drawRadarKindIcon(kind: RadarKind, x: number, y: number, pixelSize: number): void {
  if (kind === "enemy") {
    drawPixelSprite(radarSkullSprite, x, y, pixelSize);
    return;
  }

  drawPixelSprite(resourceSprites[kind], x, y, pixelSize);
}

function drawRadarFilterPanel(height: number): void {
  const panelWidth = 176;
  const panelHeight = 226;
  const x = 22;
  const y = Math.max(22, height / 2 - panelHeight / 2);
  const rows: Array<{ kind: RadarKind; label: string }> = [
    { kind: "life", label: "VIE" },
    { kind: "energy", label: "ENERGIE" },
    { kind: "gold", label: "OR" },
    { kind: "shop", label: "SHOP" },
    { kind: "save", label: "SAVE" },
    { kind: "enemy", label: "ENNEMI" },
  ];

  radarFilterButtons = [];
  ctx.save();
  ctx.imageSmoothingEnabled = false;
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

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const rowY = y + 48 + index * 28;
    const enabled = radarFilters[row.kind];
    const color = getRadarColor(row.kind);
    const button: RadarFilterButton = {
      kind: row.kind,
      x: x + 126,
      y: rowY - 5,
      width: 28,
      height: 22,
    };

    radarFilterButtons.push(button);
    drawRadarKindIcon(row.kind, x + 28, rowY + 6, row.kind === "enemy" ? 2 : 2.2);
    drawPixelText(row.label, x + 52, rowY, 2, enabled ? color : "#6b7280");
    ctx.fillStyle = enabled ? "#12383c" : "#241820";
    ctx.fillRect(button.x, button.y, button.width, button.height);
    ctx.strokeStyle = enabled ? "#5dd7d2" : "#46505e";
    ctx.strokeRect(button.x + 1, button.y + 1, button.width - 2, button.height - 2);
    drawPixelText(enabled ? "ON" : "NO", button.x + 5, button.y + 6, 2, enabled ? "#eef2f3" : "#6b7280");
  }

  ctx.restore();
}

function drawRadarBlips(cx: number, cy: number, clipRadius: number, sphereRadius: number, right: Vec3): void {
  const objects: RadarObject[] = [
    ...resources.map((resource) => ({ kind: resource.kind, pos: resource.pos })),
    ...enemies.map((enemy) => ({ kind: "enemy" as const, pos: enemy.pos })),
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

    if (blip.kind === "enemy") {
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
  const boxHeight = 350;
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
  drawPixelText(String(gameConfig.saves.energyCost), x + 346, y + 74, 3, "#ffef6e");

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

  drawRadarFilterPanel(height);
  drawHud(width);
  drawShopInterface(width, height);
  drawSavePrompt(width, height);
  drawGameOver(width, height);
}

function step(time: number): void {
  const dt = Math.min(32, time - lastTime || 16) / 16.67;
  lastTime = time;

  if (restorePhase !== "idle") {
    updateRestoreSequence(dt);
  } else if (!gameOver && !shopOpen && !pendingSavePoint) {
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
    updateLifeDrain(dt);
    updateShots(dt);
    updateExplosions(dt);
    updateEnemies(dt);
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

  if (event.key === "Escape" && shopOpen) {
    ignoredShopId = activeShopId;
    shopOpen = false;
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

  if (handleSavePromptClick(event)) {
    event.preventDefault();
    return;
  }

  if (handleShopClick(event)) {
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
