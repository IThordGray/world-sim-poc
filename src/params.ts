// Every tuning number lives here. All are starting values for play-testing.
// Units: pressure hPa, wind m/s, distance in climate-grid cells, time in game hours.
//
// Scale: the map is about 6,100 nm wide, so a ship at 120–150 nm a day crosses it in 40–50 days.
// At this size latitude is only mildly compressed and storm sizes, lifespans and speeds are close to
// real ones. Changing cellNm means rescaling lifespans, spawn rates, drift and moisture rates together.

type Range = [number, number];
type PerMonth = [number, number, number, number, number, number, number, number, number, number, number, number];

export const P = {
  seed: 1,
  grid: { w: 256, h: 128 },
  // Row 0 is the north edge. One hemisphere, latitude compressed so every belt fits.
  latitude: { north: 70, south: 0 },
  cellNm: 24,

  startDay: 225, // mid-August: storm season is under way when play starts
  spinUpTicks: 168, // a week headless, so systems are already in flight on the first frame
  maxTicksPerFrame: 12, // over budget the clock lags; a tick is never skipped

  terrain: { landFraction: 0.35, baseFrequency: 1 / 30, octaves: 5, highLand: 0.3 },

  belts: {
    // [|latitude|, pressure offset], smoothly interpolated between points
    profile: [[0, -6], [30, 8], [60, -10], [90, 2]] as Range[],
    baseHPa: 1013,
    seasonalShiftDeg: 8,
    monsoonHPa: 6,
    continentalityCells: 20,
  },

  temperature: {
    equatorC: 28,
    dropPerDegLatSq: 0.0064, // 22 °C at 30°, 5 °C at 60°
    swingPerDegLat: 0.25,
    lapseCPerElev: 18, // elevation runs 0..1
    maritimeCells: 6,
    seaSwing: 0.5,
    coastSwing: 0.6,
    inlandSwing: 1.4,
  },

  wind: {
    msPerHpaPerCell: 20,
    maxMs: 40,
    deflectSeaDeg: 70,
    deflectLandDeg: 40,
    deflectRampDeg: 12, // deflection falls to 0 at the equator over this many degrees
    landFriction: 0.6,
    leeCells: 2,
    leeFactor: 0.65,
    baseGust: 0.15,
    landGust: 0.1,
    leeGust: 0.4,
  },

  systems: {
    steer: 1,
    // Systems follow the flow aloft, which runs along the isobars: the surface wind turned further.
    steerVeerDeg: 20,
    // Fraction of lifespan at which Forming, Deepening and Mature end.
    lifecycle: { forming: 0.15, deepening: 0.4, mature: 0.75 },
    formingStrength: 0.4,
    tropicalLandDecay: 3,
    high: { latDeg: 30, peakHPa: [8, 14] as Range, radius: 28, minBasinCells: 30 },
    depression: {
      band: [40, 60] as Range,
      peakHPa: [-10, -30] as Range,
      radius: [14, 22] as Range,
      lifespanH: [72, 168] as Range,
      moisture: 0.4,
      polewardMs: 1.5,
      cap: 8,
      rate: [0.1, 0.1, 0.08, 0.06, 0.05, 0.04, 0.04, 0.04, 0.06, 0.08, 0.09, 0.1] as PerMonth,
    },
    tropical: {
      band: [8, 20] as Range,
      minSeaC: 26,
      peakHPa: [-20, -60] as Range,
      radius: [5, 8] as Range,
      lifespanH: [120, 288] as Range,
      moisture: 1.5,
      polewardMs: 2.5,
      recurvePolewardMs: 4,
      recurveEastMs: 4,
      recurveMarginDeg: 2,
      westerliesDeg: 35,
      toDepression: { radius: 2, strength: 0.7 },
      cap: 4,
      rate: [0, 0, 0, 0, 0, 0, 0.006, 0.022, 0.03, 0.018, 0.005, 0] as PerMonth,
    },
    squall: {
      minRelHumidity: 0.9,
      peakHPa: [-1.5, -3] as Range,
      radius: [2.5, 4] as Range,
      lifespanH: [1, 6] as Range,
      moisture: 1,
      cap: 10,
      rate: 0.12,
      afternoon: { from: 12, to: 18, factor: 2.5, otherwise: 0.5 },
    },
  },

  moisture: {
    evapRate: 0.03, // per hour, times the deficit below capacity
    evapWind: 0.05,
    capBase: 4,
    capPerC: 0.06,
    lowLift: 0.3, // inside a low, rising air lowers capacity by up to this share
    rainThreshold: 1,
    rainRate: 0.5,
    uplift: 2,
    convergence: 0.6,
    cooling: 0.03,
    background: 0.02,
    cloudReturn: 0.1, // cloud re-evaporates per hour when the air below has room
    landReturn: 0.15,
    initialRelHumidity: 0.7,
  },

  // cloudFull and rainFull: the amounts drawn at full strength on the weather layer.
  view: { particles: 2500, visualHoursPerSecond: 12, speeds: [1, 6, 24, 72], cloudFull: 6, rainFull: 1.2, maxZoom: 8 },
};
