/**
 * Tuning sidecars (catalog README, "Tuning sidecars"): plain JSON numbers, colours and proportions of species
 * behaviour and model recipes. Each file is a record keyed by the entry key (plants: the ornamental species);
 * the code that turns them into behaviour or geometry stays in the owning modules.
 */

/** Three numbers: an RGB colour (0..1) or a direction / position. */
export type TuningVec3 = readonly [number, number, number];
/** Inclusive range [min, max]. */
export type TuningRange = readonly [number, number];
/** Control points (position 0..1, value) of a smooth profile. */
export type TuningProfile = readonly (readonly [number, number])[];

/**
 * Locomotion of one gait. The stride is the distance one full cycle covers: the animation phase
 * advances by speed / stride, so the feet never slide (root motion like sync). Strides are
 * presentation only (never read by the simulation): deer walk about 1 stride/s, trot 1.9 and
 * gallop 2.6; elk walk 0.8, trot 1.5 and gallop 2, with hip sweeps of 20 to 40 degrees.
 */
export interface WildlifeGait {
  speed: number;
  stride: number;
}

export interface WildlifeCalmWeights {
  graze: number;
  idle: number;
  look: number;
  rest: number;
  walk: number;
}

/**
 * Behaviour profile of a wandering land animal (`animal:*`), `tuning/wildlife-profiles.json`. World scale: one
 * cell is about two metres; animals are slightly exaggerated for RTS readability.
 */
export interface WildlifeProfileTuning {
  /** Distance (world units) at which an unhurried threat makes it alert. */
  alertRadius: number;
  /**
   * Body footprint as a capsule along the heading: reach of the nose (front) and the rump (back)
   * from the centre, and the tallest point (ears, antlers); the capsule radius is `clearance`.
   */
  body: { back: number; front: number; height: number };
  calm: WildlifeCalmWeights;
  /** Capsule radius: half the body width plus a margin (rabbits pass narrow gaps, elk the least). */
  clearance: number;
  /** Nav cells kept free next to cliff drops (0: may walk to the very edge). */
  cliffMargin: number;
  /** Seconds range [min, max] of a timed state; durations are drawn skewed towards the minimum. */
  durations: {
    alert: TuningRange; graze: TuningRange; idle: TuningRange; look: TuningRange; recover: TuningRange;
    rest: TuningRange;
  };
  /** Closer than this a threat makes it flee at once. */
  fleeRadius: number;
  /** Group size range (rabbits mostly alone, deer and elk in small loose herds). */
  group: TuningRange;
  /** Body length (heading axis) used for the slope pitch samples. */
  length: number;
  /** Seconds to lie down (rising is faster, much faster when alarmed). */
  lieDown: number;
  /** How deep into a forest (world units from its edge) it goes; null: anywhere it fits. */
  maxForestDepth: number | null;
  /** Largest traversable slope in degrees (the code turns it into rise per unit with DMath). */
  maxSlopeDegrees: number;
  /** Smallest connected walkable area (world units squared) worth spawning in. */
  minRegionArea: number;
  /** Preferred distance between herd mates. */
  personalSpace: number;
  /** Reaction delay range before fleeing (seconds). */
  reaction: TuningRange;
  run: WildlifeGait;
  /** Flee until the threat is this far. */
  safeDistance: number;
  /** Instance size variation around 1. */
  sizeJitter: number;
  /** Free radius to stand and turn on the spot (spawns, targets, path corridors). */
  standRadius: number;
  trot: WildlifeGait;
  /** Radians per second at walking pace; faster gaits turn wider. */
  turnRate: number;
  walk: WildlifeGait;
  /** Wander leg length range. */
  wanderDistance: TuningRange;
}

/** Where a bird likes to fly: weights of the habitat channels. */
export interface BirdHabitatTuning {
  forest: number;
  grass: number;
  water: number;
}

/** One wing station from the shoulder (span 0) to the tip (span 1): chord as body x offsets. */
export interface BirdWingStation {
  /** Leading edge x (forward +), in wingspan units. */
  lead: number;
  span: number;
  /** 0 inner wing colour .. 1 tip colour. */
  tip: number;
  /** Trailing edge x, in wingspan units. */
  trail: number;
}

/**
 * Vertex colours of a bird: upper parts (cap, back, coverts, wing) and lighter under parts
 * (throat, breast, belly) so the bird separates from the ground below it.
 */
export interface BirdColorsTuning {
  back: TuningVec3;
  beak: TuningVec3;
  belly: TuningVec3;
  breast: TuningVec3;
  cap: TuningVec3;
  /** Inner wing leading edge (coverts): a bar, a sheen or the gull's grey mantle. */
  covert: TuningVec3;
  /** The small eye on each side of the head. */
  eye: TuningVec3;
  tail: TuningVec3;
  throat: TuningVec3;
  wing: TuningVec3;
  wingTip: TuningVec3;
}

/** The procedural silhouette of a bird, in wingspan units (span 1 = tip to tip). */
export interface BirdShapeTuning {
  /** Beak length relative to the body length. */
  beakLength: number;
  bodyLength: number;
  bodyRadius: number;
  colors: BirdColorsTuning;
  /**
   * Primary feather tips around the hand (3 or 6: they line up with the painted feathers), and
   * how deep the notches between them cut (0..1: the rook's separated fingers).
   */
  primaries: number;
  primaryNotch: number;
  /** Depth of the tail notch relative to its length (0 square .. 1 deeply forked). */
  tailFork: number;
  tailLength: number;
  tailWidth: number;
  wing: readonly BirdWingStation[];
}

/** Model and flight tuning of a bird (`bird:*`), `tuning/models/birds.json`. */
export interface BirdTuning {
  /** Cruise height above the ground, water or canopy (world units): min .. max. */
  altitude: TuningRange;
  /** Tendency to circle briefly above forests, 0..1. */
  circling: number;
  /** Wing angle at full flap (radians, up and down from the glide pose). */
  flapAmplitude: number;
  /** Flaps per second, before the per bird variation. */
  flapRate: number;
  /** Flock size range (1 = always alone). */
  flockMax: number;
  flockMin: number;
  /** Wing angle while gliding (radians, positive = raised V). */
  glideDihedral: number;
  /** How much the wings fold while gliding (0 spread .. 1 tucked: bounding flight). */
  glideFold: number;
  /** Share of the flight spent gliding, 0..1. */
  glideShare: number;
  habitat: BirdHabitatTuning;
  /** Lands into tree crowns and / or the grass; "none" only flies through. */
  perches: "canopy" | "ground" | "both" | "none";
  shape: BirdShapeTuning;
  /** Wingspan in world units (a cell is one unit; enlarged for readability from the camera). */
  size: number;
  /** Cruise speed (world units per second). */
  speed: number;
  /** Largest turn rate (radians per second): small birds turn sharper. */
  turnRate: number;
}

/** Where a butterfly likes to fly (weights of the habitat terms). */
export interface ButterflyHabitatTuning {
  edge: number;
  flowers: number;
  meadow: number;
  water: number;
}

/** One wing outline: radius keys [angle from forward (radians), radius] in increasing angle order. */
export interface ButterflyWingOutline {
  keys: readonly (readonly [number, number])[];
  /** Scalloped margin: waves over the whole margin and their depth (share of the radius). */
  scallopDepth?: number;
  scallops?: number;
}

/** Separate forewing and hindwing outlines (wing card units). */
export interface ButterflyWingShape {
  fore: ButterflyWingOutline;
  hind: ButterflyWingOutline;
}

/** Finishing of a painted wing side: base shading, margin band, fringe and veins. */
export interface ButterflyWingStyle {
  base: TuningVec3;
  baseStrength: number;
  fringe: TuningVec3;
  margin: TuningVec3;
  marginWidth: number;
  vein: TuningVec3;
  veinStrength: number;
}

/**
 * Model and flight tuning of a butterfly (`butterfly:*`), `tuning/models/butterflies.json`. The procedural wing
 * painting and marking recipes (functions) stay in the client's butterfly-species module.
 */
export interface ButterflyTuning {
  /** Body colour (head, thorax, abdomen) and the paler segment rings / thorax hair. */
  body: TuningVec3;
  bodyLight: TuningVec3;
  /** Height above the ground it cruises at (world units, min / max). */
  cruise: TuningRange;
  /** Wing beats per second in flight, and how often it glides with flat wings (0..1). */
  flapRate: number;
  glide: number;
  habitat: ButterflyHabitatTuning;
  shape: ButterflyWingShape;
  /** Wingspan in world units (enlarged for readability, like the birds). */
  size: number;
  /** Forward drift speed (world units per second). */
  speed: number;
  under: { style: ButterflyWingStyle };
  upper: { style: ButterflyWingStyle };
}

/** Tail outline: deeply forked (schooling fish), crescent (parrotfish) or a rounded fan. */
export type FishTail = "forked" | "lunate" | "round";

/**
 * Side markings painted into the vertex colours: none, a lateral stripe, soft bars, an eye band,
 * three white bands (clownfish-like) or a two-tone body (front back colour, rear accent).
 */
export type FishMarking = "bands" | "bars" | "eyeband" | "none" | "stripe" | "twotone";

/**
 * Model and motion tuning of a decorative reef or schooling fish (`fish:*`), `tuning/models/fish.json`.
 * Colours are vivid but naturalistic: a darker back, a light belly.
 */
export interface FishTuning {
  /** Accent: the stripe, bars, fins or edging colour. */
  accent: TuningVec3;
  back: TuningVec3;
  belly: TuningVec3;
  /** Half body height per station from tail (0) to snout (last), as shares of the length. */
  body: readonly number[];
  /** Burst speed after a scare (world units per second). */
  burst: number;
  /** Also lives around the cold, snowy islands (the reef fish do not). */
  coldWater: boolean;
  /** Cruising speed (world units per second). */
  cruise: number;
  /** Preferred water depth band (world units) of its home. */
  depth: TuningRange;
  /** Fin colour (tail, dorsal and anal fins). */
  fin: TuningVec3;
  /** Body length (world units; enlarged for gameplay distance, the leaping sea fish are 0.28). */
  length: number;
  marking: FishMarking;
  /** Members of one group (min, max): a school, a pair or a single fish. */
  school: TuningRange;
  /** Mirror-like silvery flash of the flank (0 matte .. 1 silver). */
  sheen: number;
  side: TuningVec3;
  /**
   * Body thickness relative to its height: widened over nature (the iso camera sees fish from above,
   * where a true laterally compressed body reads as a thin line); reef discs stay the thinnest.
   */
  thickness: number;
  tail: FishTail;
  /** Tail beats per second at cruising speed. */
  wag: number;
}

/**
 * A fin lofted from root to tip: airfoil rings `chord` long (along `chordDirection`), `thickness`
 * half thick, their centres `sweep` behind the straight span line (body lengths).
 */
export interface WhaleFinTuning {
  chord: TuningProfile;
  chordDirection: TuningVec3;
  root: TuningVec3;
  span: number;
  spanDirection: TuningVec3;
  sweep: TuningProfile;
  thickness: TuningProfile;
}

/**
 * Shape of a whale (`whale:*`), `tuning/models/whales.json`, in body lengths (the nose at x +0.5, the fluke
 * notch near x -0.5, up +y, left +z); the renderer scales it by `length`.
 */
export interface WhaleTuning {
  /** Body position of the blowhole(s): the blow rises there. */
  blowhole: number;
  /** Where the body tube ends inside the fluke root (body position 0 nose .. 1 fluke tips). */
  bodyEnd: number;
  /** Half height below / above the body axis and half width by body position. */
  bottom: TuningProfile;
  dorsal: WhaleFinTuning;
  fluke: WhaleFinTuning;
  /** World units nose to fluke notch. */
  length: number;
  pectoral: WhaleFinTuning;
  top: TuningProfile;
  width: TuningProfile;
}

export type RoadPlantForm = "bush" | "flower" | "column" | "tree" | "weeping" | "palm" | "bonsai" | "topiary";

/**
 * Ornamental plant model parameters per species (`decoration.plant.species`), `tuning/models/plants.json`;
 * names, items, prices and availability live in the `decoration:plant-*` entries.
 */
export interface RoadPlantTuning {
  blossom?: TuningVec3;
  crownRadius: number;
  foliage: TuningVec3;
  form: RoadPlantForm;
  height: number;
  leafLength: number;
  leafWidth: number;
}
