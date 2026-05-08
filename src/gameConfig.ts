export type CarryResourceKind = "life" | "energy" | "gold";

export const gameConfig = {
  player: {
    initialResources: {
      life: 5,
      energy: 8,
      gold: 0,
    },
    initialCapacity: {
      life: 5,
      energy: 5,
      gold: 10,
    },
    lifeDrain: {
      intervalFrames: 1900,
    },
  },
  world: {
    zoom: 2,
    sphereRadius: 100,
    speed: 1,
    moveStep: 0.0055,
    turnStep: 0.09,
  },
  resources: {
    count: 500,
    minimumDistance: 3,
    collectionDistance: 2.8,
  },
  biomes: {
    sea: {
      color: "#176b89",
      resourceWeights: {
        life: 1,
        energy: 5,
        gold: 1,
      },
    },
    green: {
      color: "#2f8f4e",
      resourceWeights: {
        life: 5,
        energy: 2,
        gold: 2,
      },
    },
    desert: {
      color: "#c9a45a",
      resourceWeights: {
        life: 1,
        energy: 2,
        gold: 6,
      },
    },
    radioactive: {
      color: "#8ee84f",
      resourceWeights: {
        life: 1,
        energy: 7,
        gold: 3,
      },
    },
  },
  shops: {
    count: 8,
    openDistance: 3,
  },
  saves: {
    count: 5,
    activationDistance: 3,
    energyCost: 2,
  },
  radar: {
    initialRange: 18,
    maxBlips: 36,
    visionMargin: 86,
  },
  enemies: {
    count: 34,
    aggroDistance: 24,
    hitDistance: 2.4,
    moveDistance: 0.62,
  },
  restore: {
    collapseFrames: 38,
    expandFrames: 30,
    minVisibilityScale: 0.02,
    playerExplosionTtl: 34,
  },
  shots: {
    moveDistance: 4.6,
    hitDistance: 3.2,
    lifeFrames: 46,
    energyCost: 1,
  },
  mouse: {
    targetDistance: 1.2,
    turnStep: 0.055,
    alignmentAngle: 0.08,
  },
  shopUpgrades: {
    life: {
      capacityStep: 2,
      baseCost: 8,
      costStep: 5,
    },
    energy: {
      capacityStep: 4,
      baseCost: 6,
      costStep: 4,
    },
    gold: {
      capacityStep: 25,
      baseCost: 10,
      costStep: 7,
    },
    radar: {
      rangeStep: 8,
      baseCost: 12,
      costStep: 8,
    },
  },
} as const;
