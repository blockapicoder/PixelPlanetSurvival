export type CarryResourceKind = "life" | "energy" | "gold";
export type BiomeKind = "sea" | "green" | "desert" | "radioactive";

export type ResourceAmounts = Record<CarryResourceKind, number>;
export type BiomeConfig = {
  color: string;
  resourceWeights: ResourceAmounts;
  lifeDrain: {
    intervalFrames: number;
  };
};
export type EnemySpawnConfig<TCategory extends string = string> = {
  categoryId: TCategory;
  intervalFrames: number;
  spawnDistance: number;
  maxChildren: number;
};
export type EnemyExploreConfig = {
  retargetFrames: number;
  targetDistance: number;
};
export type EnemyConfig<TSpawnCategory extends string = string> = {
  count: number;
  size: number;
  sizeVariance: number;
  canMove: boolean;
  aggroDistance: number;
  hitDistance: number;
  moveDistance: number;
  blockedBiomes: BiomeKind[];
  explore?: EnemyExploreConfig;
  spawn?: EnemySpawnConfig<TSpawnCategory>;
};
export type EnemiesConfig = {
  crawler: EnemyConfig;
  spawnling: EnemyConfig;
  nest: EnemyConfig<"spawnling">;
};
export type CapacityUpgradeConfig = {
  capacityStep: number;
  baseCost: number;
  costStep: number;
};
export type RadarUpgradeConfig = {
  rangeStep: number;
  baseCost: number;
  costStep: number;
};
export type GameConfig = {
  player: {
    initialResources: ResourceAmounts;
    initialCapacity: ResourceAmounts;
  };
  world: {
    zoom: number;
    sphereRadius: number;
    speed: number;
    moveStep: number;
    turnStep: number;
  };
  resources: {
    count: number;
    minimumDistance: number;
    collectionDistance: number;
  };
  biomes: Record<BiomeKind, BiomeConfig>;
  shops: {
    count: number;
    openDistance: number;
  };
  saves: {
    count: number;
    activationDistance: number;
    energyCost: number;
  };
  radar: {
    initialRange: number;
    maxBlips: number;
    visionMargin: number;
  };
  enemies: EnemiesConfig;
  restore: {
    collapseFrames: number;
    expandFrames: number;
    minVisibilityScale: number;
    playerExplosionTtl: number;
  };
  shots: {
    moveDistance: number;
    hitDistance: number;
    lifeFrames: number;
    energyCost: number;
  };
  mouse: {
    targetDistance: number;
    turnStep: number;
    alignmentAngle: number;
  };
  shopUpgrades: Record<CarryResourceKind, CapacityUpgradeConfig> & {
    radar: RadarUpgradeConfig;
  };
};

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
      lifeDrain: {
        intervalFrames: 2100,
      },
    },
    green: {
      color: "#2f8f4e",
      resourceWeights: {
        life: 5,
        energy: 2,
        gold: 2,
      },
      lifeDrain: {
        intervalFrames: 1900,
      },
    },
    desert: {
      color: "#c9a45a",
      resourceWeights: {
        life: 1,
        energy: 2,
        gold: 6,
      },
      lifeDrain: {
        intervalFrames: 1450,
      },
    },
    radioactive: {
      color: "#e40909",
      resourceWeights: {
        life: 1,
        energy: 7,
        gold: 3,
      },
      lifeDrain: {
        intervalFrames: 1050,
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
    crawler: {
      count: 34,
      size: 0.9,
      sizeVariance: 0.35,
      canMove: true,
      aggroDistance: 24,
      hitDistance: 2.4,
      moveDistance: 0.62,
      blockedBiomes: ["sea"],
    },
    spawnling: {
      count: 0,
      size: 0.72,
      sizeVariance: 0.22,
      canMove: true,
      aggroDistance: 30,
      hitDistance: 2.1,
      moveDistance: 0.78,
      blockedBiomes: ["sea", "radioactive"],
      explore: {
        retargetFrames: 260,
        targetDistance: 18,
      },
    },
    nest: {
      count: 5,
      size: 1.55,
      sizeVariance: 0.2,
      canMove: false,
      aggroDistance: 0,
      hitDistance: 3.2,
      moveDistance: 0,
      blockedBiomes: ["sea"],
      spawn: {
        categoryId: "spawnling",
        intervalFrames: 520,
        spawnDistance: 5,
        maxChildren: 4,
      },
    },
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
} as const satisfies GameConfig;

export type EnemyCategoryId = keyof typeof gameConfig.enemies;
