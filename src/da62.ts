namespace DA62 {
    export type TakeoffResult = {
        vrKias: number;
        v50Kias: number;
        groundRoll: number;
        over50ft: number;
    };

    export type LandingResult = {
        vrefKias: number;
        groundRoll: number;
        over50ft: number;
    };

    export type ClimbResult = {
        kias: number;
        ktas: number;
        rateFpm: number;
        gradientPercent: number;
    };

    const weightSteps = [
        3968, 4189, 4407, 4630, 4850, 5071,
    ] as const satisfies readonly Da62PerformanceWeight[];
    const minimumFlightMass = 3527;
    const fieldAltitudeSteps = [
        0, 1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000,
    ] as const;
    const climbAltitudeSteps = [
        0, 2000, 4000, 6000, 8000, 10000, 12000, 14000, 16000, 18000, 20000,
    ] as const;
    const fieldTemperatureSteps = [0, 10, 20, 30, 40, 50] as const;
    const climbTemperatureSteps = [-20, -10, 0, 10, 20, 30, 40, 50] as const;
    const goAroundAltitudeSteps = [0, 2000, 4000, 6000, 8000, 10000] as const;
    const climbSpeeds = {
        takeoff: {
            TO: [83, 83, 83, 86, 86, 86],
            UP: [87, 87, 87, 89, 89, 89],
        },
        cruise: [93, 93, 93, 96, 96, 96],
        oei: [87, 87, 87, 89, 89, 89],
    } as const;
    const takeoffSpeeds = {
        TO: {
            vr: [76, 76, 76, 78, 78, 78],
            v50: [83, 83, 83, 86, 86, 86],
        },
        UP: {
            vr: [80, 80, 80, 80, 80, 80],
            v50: [87, 87, 87, 89, 89, 89],
        },
    } as const;
    const landingSpeeds = {
        LDG: [84, 84, 84, 89, 89, 89],
        TO: [88, 88, 88, 91, 91, 91],
        UP: [91, 91, 91, 95, 95, 95],
    } as const;
    const airspeedCalibration: readonly PerformanceCommon.InterpolationPoint[] = [
        [75, 74], [80, 79], [85, 84], [90, 89], [95, 94],
        [100, 99], [105, 104], [110, 109], [115, 114], [120, 119],
        [125, 124], [130, 129], [135, 134], [140, 138], [150, 148],
        [160, 158], [170, 167], [180, 177], [190, 186], [200, 196],
        [205, 201],
    ];
    const fuelFlowPerEngine: readonly PerformanceCommon.InterpolationPoint[] = [
        [30, 3.3], [35, 3.7], [40, 4.1], [45, 4.5], [50, 4.9],
        [55, 5.4], [60, 5.9], [65, 6.4], [70, 6.9], [75, 7.4],
        [80, 7.8], [85, 8.3], [90, 9.0], [95, 9.7], [100, 10.3],
    ];

    const buildTakeoffGrid = (
        flap: Da62TakeoffFlap,
        field: keyof Da62DistanceRow,
    ) => weightSteps.map(weight =>
        da62TakeoffTables[flap][weight].map(row => row[field]));

    const buildClimbGrid = (table: Da62ClimbTables) =>
        weightSteps.map(weight => table[weight]);
    const buildClimbIsaGrid = (table: Da62WeightTable<Da62ValueRow>) =>
        weightSteps.map(weight => table[weight]);

    const buildLandingGrid = (
        configuration: Da62LandingConfiguration,
        field: keyof Da62DistanceRow,
    ) => weightSteps.map(weight =>
        da62LandingTables[configuration][weight].map(row => row[field]));

    const buildDistanceIsaGrid = <Configuration extends string>(
        table: Da62DistanceIsaTables<Configuration>,
        configuration: Configuration,
        field: keyof Da62DistanceRow,
    ) => weightSteps.map(weight => table[configuration][weight][field]);

    const takeoffGrids = {
        TO: {
            groundRoll: buildTakeoffGrid('TO', 'groundRoll'),
            over50ft: buildTakeoffGrid('TO', 'over50ft'),
        },
        UP: {
            groundRoll: buildTakeoffGrid('UP', 'groundRoll'),
            over50ft: buildTakeoffGrid('UP', 'over50ft'),
        },
    };
    const landingGrids = {
        LDG: {
            groundRoll: buildLandingGrid('LDG', 'groundRoll'),
            over50ft: buildLandingGrid('LDG', 'over50ft'),
        },
        ABNORMAL: {
            groundRoll: buildLandingGrid('ABNORMAL', 'groundRoll'),
            over50ft: buildLandingGrid('ABNORMAL', 'over50ft'),
        },
    };
    const takeoffIsaGrids = {
        TO: {
            groundRoll: buildDistanceIsaGrid(da62TakeoffIsaTables, 'TO', 'groundRoll'),
            over50ft: buildDistanceIsaGrid(da62TakeoffIsaTables, 'TO', 'over50ft'),
        },
        UP: {
            groundRoll: buildDistanceIsaGrid(da62TakeoffIsaTables, 'UP', 'groundRoll'),
            over50ft: buildDistanceIsaGrid(da62TakeoffIsaTables, 'UP', 'over50ft'),
        },
    };
    const landingIsaGrids = {
        LDG: {
            groundRoll: buildDistanceIsaGrid(da62LandingIsaTables, 'LDG', 'groundRoll'),
            over50ft: buildDistanceIsaGrid(da62LandingIsaTables, 'LDG', 'over50ft'),
        },
        ABNORMAL: {
            groundRoll: buildDistanceIsaGrid(
                da62LandingIsaTables,
                'ABNORMAL',
                'groundRoll',
            ),
            over50ft: buildDistanceIsaGrid(
                da62LandingIsaTables,
                'ABNORMAL',
                'over50ft',
            ),
        },
    };

    const takeoffClimbGrids = {
        TO: buildClimbGrid(da62TakeoffClimbTables.TO),
        UP: buildClimbGrid(da62TakeoffClimbTables.UP),
    };
    const cruiseClimbGrid = buildClimbGrid(da62CruiseClimbTables);
    const oeiClimbGrid = buildClimbGrid(da62OeiClimbTables);
    const goAroundClimbGrid = buildClimbGrid(da62GoAroundClimbTables);
    const takeoffClimbIsaGrids = {
        TO: buildClimbIsaGrid(da62ClimbIsaTables.TO),
        UP: buildClimbIsaGrid(da62ClimbIsaTables.UP),
    };
    const cruiseClimbIsaGrid = buildClimbIsaGrid(da62ClimbIsaTables.cruise);
    const oeiClimbIsaGrid = buildClimbIsaGrid(da62ClimbIsaTables.oei);
    const goAroundClimbIsaGrid = buildClimbIsaGrid(da62ClimbIsaTables.goAround);

    const standardTemperature = (pressureAltitudeFeet: number) =>
        15 - 1.98 * pressureAltitudeFeet / 1000;

    const normalizePerformanceWeight = (weightPounds: number) =>
        Number.isFinite(weightPounds) && minimumFlightMass <= weightPounds &&
            weightPounds < weightSteps[0]
            ? weightSteps[0]
            : weightPounds;

    const interpolatePerformanceTable = (
        table: readonly Da62ValueGrid[],
        isaTable: Da62ValueGrid,
        altitudeSteps: readonly number[],
        temperatureSteps: readonly number[],
        normalizedWeightPounds: number,
        pressureAltitudeFeet: number,
        oatCelsius: number,
    ) => {
        const weightBracket = PerformanceCommon.bracketAxis(
            weightSteps,
            normalizedWeightPounds,
        );
        const altitudeBracket = PerformanceCommon.bracketAxis(
            altitudeSteps,
            pressureAltitudeFeet,
        );
        if (!weightBracket || !altitudeBracket || !Number.isFinite(oatCelsius)) {
            return NaN;
        }

        const rowValue = (weightIndex: number, altitudeIndex: number) => {
            const points: PerformanceCommon.InterpolationPoint[] = [];
            for (let index = 0; index < temperatureSteps.length; index++) {
                const value = table[weightIndex]?.[altitudeIndex]?.[index];
                if (Number.isFinite(value)) {
                    points.push([temperatureSteps[index], value]);
                }
            }
            const isaValue = isaTable[weightIndex]?.[altitudeIndex];
            if (Number.isFinite(isaValue)) {
                points.push([
                    standardTemperature(altitudeSteps[altitudeIndex]),
                    isaValue,
                ]);
            }
            if (points.length === 0) {
                return NaN;
            }
            const lowestTemperature = Math.min(...points.map(([temperature]) => temperature));
            const boundedTemperature = Math.max(oatCelsius, lowestTemperature);
            return PerformanceCommon.interpolatePoints(points, boundedTemperature);
        };

        const values = [weightBracket[0], weightBracket[1]].map(weightIndex =>
            [altitudeBracket[0], altitudeBracket[1]].map(altitudeIndex =>
                rowValue(weightIndex, altitudeIndex)));
        if (values.flat().some(value => !Number.isFinite(value))) {
            return NaN;
        }
        const lower = PerformanceCommon.interpolateLinear(
            values[0][0],
            values[0][1],
            altitudeBracket[2],
        );
        const upper = PerformanceCommon.interpolateLinear(
            values[1][0],
            values[1][1],
            altitudeBracket[2],
        );
        return PerformanceCommon.interpolateLinear(
            lower,
            upper,
            weightBracket[2],
        );
    };

    export const takeoffWindFactor = (headwindKnots: number) => {
        if (!Number.isFinite(headwindKnots)) {
            return NaN;
        }
        const factor = headwindKnots >= 0
            ? 1 - 0.1 * headwindKnots / 12
            : 1 + 0.1 * -headwindKnots / 3;
        return factor > 0 ? factor : NaN;
    };

    export const calculateTakeoff = (
        weightPounds: number,
        pressureAltitudeFeet: number,
        oatCelsius: number,
        headwindKnots: number,
        flap: Da62TakeoffFlap,
    ): TakeoffResult => {
        const normalizedWeight = normalizePerformanceWeight(weightPounds);
        const factor = takeoffWindFactor(headwindKnots);
        const speed = (values: readonly number[]) => PerformanceCommon.interpolatePoints(
            weightSteps.map((weight, index) => [weight, values[index]] as const),
            normalizedWeight,
        );
        return {
            vrKias: speed(takeoffSpeeds[flap].vr),
            v50Kias: speed(takeoffSpeeds[flap].v50),
            groundRoll: interpolatePerformanceTable(
                takeoffGrids[flap].groundRoll,
                takeoffIsaGrids[flap].groundRoll,
                fieldAltitudeSteps,
                fieldTemperatureSteps,
                normalizedWeight,
                pressureAltitudeFeet,
                oatCelsius,
            ) * factor,
            over50ft: interpolatePerformanceTable(
                takeoffGrids[flap].over50ft,
                takeoffIsaGrids[flap].over50ft,
                fieldAltitudeSteps,
                fieldTemperatureSteps,
                normalizedWeight,
                pressureAltitudeFeet,
                oatCelsius,
            ) * factor,
        };
    };

    export const landingWindFactor = (headwindKnots: number) => {
        if (!Number.isFinite(headwindKnots)) {
            return NaN;
        }
        const factor = headwindKnots >= 0
            ? 1 - 0.1 * headwindKnots / 20
            : 1 + 0.1 * -headwindKnots / 3;
        return factor > 0 ? factor : NaN;
    };

    export const indicatedToCalibratedAirspeed = (kias: number) =>
        PerformanceCommon.interpolatePoints(airspeedCalibration, kias);

    export const calculateFuelFlow = (powerPercent: number) => {
        const perEngineGph = PerformanceCommon.interpolatePoints(
            fuelFlowPerEngine,
            powerPercent,
        );
        return {
            perEngineGph,
            totalGph: perEngineGph * 2,
        };
    };

    export const calculateLanding = (
        weightPounds: number,
        pressureAltitudeFeet: number,
        oatCelsius: number,
        headwindKnots: number,
        flap: Da62LandingFlap,
    ): LandingResult => {
        const configuration = flap === 'LDG' ? 'LDG' : 'ABNORMAL';
        const normalizedWeight = normalizePerformanceWeight(weightPounds);
        const factor = landingWindFactor(headwindKnots);
        const vrefKias = PerformanceCommon.interpolatePoints(
            weightSteps.map((weight, index) =>
                [weight, landingSpeeds[flap][index]] as const),
            normalizedWeight,
        );
        return {
            vrefKias,
            groundRoll: interpolatePerformanceTable(
                landingGrids[configuration].groundRoll,
                landingIsaGrids[configuration].groundRoll,
                fieldAltitudeSteps,
                fieldTemperatureSteps,
                normalizedWeight,
                pressureAltitudeFeet,
                oatCelsius,
            ) * factor,
            over50ft: interpolatePerformanceTable(
                landingGrids[configuration].over50ft,
                landingIsaGrids[configuration].over50ft,
                fieldAltitudeSteps,
                fieldTemperatureSteps,
                normalizedWeight,
                pressureAltitudeFeet,
                oatCelsius,
            ) * factor,
        };
    };

    const speedForClimb = (
        mode: Da62ClimbMode,
        flap: Da62TakeoffFlap,
        normalizedWeightPounds: number,
    ) => {
        const speeds = mode === 'takeoff'
            ? climbSpeeds.takeoff[flap]
            : mode === 'goAround'
                ? landingSpeeds.LDG
                : climbSpeeds[mode];
        return PerformanceCommon.interpolatePoints(
            weightSteps.map((weight, index) => [weight, speeds[index]] as const),
            normalizedWeightPounds,
        );
    };

    const selectClimbTables = (mode: Da62ClimbMode, flap: Da62TakeoffFlap) => {
        switch (mode) {
            case 'takeoff':
                return {
                    table: takeoffClimbGrids[flap],
                    isaTable: takeoffClimbIsaGrids[flap],
                    altitudeSteps: climbAltitudeSteps,
                };
            case 'cruise':
                return {
                    table: cruiseClimbGrid,
                    isaTable: cruiseClimbIsaGrid,
                    altitudeSteps: climbAltitudeSteps,
                };
            case 'oei':
                return {
                    table: oeiClimbGrid,
                    isaTable: oeiClimbIsaGrid,
                    altitudeSteps: climbAltitudeSteps,
                };
            case 'goAround':
                return {
                    table: goAroundClimbGrid,
                    isaTable: goAroundClimbIsaGrid,
                    altitudeSteps: goAroundAltitudeSteps,
                };
        }
    };

    export const calculateClimb = (
        mode: Da62ClimbMode,
        weightPounds: number,
        pressureAltitudeFeet: number,
        oatCelsius: number,
        flap: Da62TakeoffFlap = 'UP',
    ): ClimbResult => {
        const normalizedWeight = normalizePerformanceWeight(weightPounds);
        const { table, isaTable, altitudeSteps } = selectClimbTables(mode, flap);
        const rateFpm = interpolatePerformanceTable(
            table,
            isaTable,
            altitudeSteps,
            climbTemperatureSteps,
            normalizedWeight,
            pressureAltitudeFeet,
            oatCelsius,
        );
        const kias = speedForClimb(mode, flap, normalizedWeight);
        const kcas = indicatedToCalibratedAirspeed(kias);
        const ktas = PerformanceCommon.calibratedToTrueAirspeed(
            kcas,
            pressureAltitudeFeet,
            oatCelsius,
        );
        return {
            kias,
            ktas,
            rateFpm,
            gradientPercent: Number.isFinite(rateFpm) && Number.isFinite(ktas) && ktas > 0
                ? rateFpm / ktas * 0.98
                : NaN,
        };
    };

    export const pressureAltitude = (fieldElevationFeet: number, qnhInHg: number) =>
        [fieldElevationFeet, qnhInHg].every(Number.isFinite) && 20 <= qnhInHg && qnhInHg <= 40
            ? (29.92 - qnhInHg) * 1000 + fieldElevationFeet
            : NaN;

    export const densityAltitude = (
        pressureAltitudeFeet: number,
        oatCelsius: number,
    ) => {
        if (![pressureAltitudeFeet, oatCelsius].every(Number.isFinite)) {
            return NaN;
        }
        const isaCelsius = 15 - 1.98 * pressureAltitudeFeet / 1000;
        return pressureAltitudeFeet + 118.8 * (oatCelsius - isaCelsius);
    };

    export type LoadingConfiguration = {
        mtom2300: boolean;
        mzfm2200: boolean;
        sevenSeat: boolean;
        auxiliaryTanks: boolean;
        deicingSystem: boolean;
    };

    // DA 62 AFM 11.01.05-E Rev. 2, Sections 2.7, 2.8, and 6.4.
    // All loading calculations use the published US/Imperial arms and limits.
    export const loadingStations = [
        { key: 'front-left', arm: 90.6 },
        { key: 'front-right', arm: 90.6 },
        { key: 'row-one-left', arm: 128.0 },
        { key: 'row-one-right', arm: 128.0 },
        { key: 'row-two-left', arm: 163.4 },
        { key: 'row-two-right', arm: 163.4 },
        { key: 'nose-left', arm: 18.5 },
        { key: 'nose-right', arm: 2.0 },
        { key: 'rear-a', arm: 159.8 },
        { key: 'rear-b', arm: 164.4 },
        { key: 'rear-c', arm: 164.4 },
        { key: 'rear-d', arm: 164.4 },
        { key: 'rear-e', arm: 173.6 },
        { key: 'rear-f', arm: 164.4 },
        { key: 'deicing-fluid', arm: 35.4 },
    ] as const;

    export type LoadingStationKey = typeof loadingStations[number]['key'];

    const fiveSeatRearBaggageKeys = [
        'rear-a', 'rear-b', 'rear-c', 'rear-d',
    ] as const satisfies readonly LoadingStationKey[];
    const sevenSeatRearBaggageKeys = [
        'rear-e', 'rear-f',
    ] as const satisfies readonly LoadingStationKey[];

    const rearBaggageKeys = (configuration: LoadingConfiguration) =>
        configuration.sevenSeat ? sevenSeatRearBaggageKeys : fiveSeatRearBaggageKeys;

    export type LoadingInput = {
        emptyMass: number;
        emptyMoment: number;
        stationMasses: Partial<Record<LoadingStationKey, number>>;
        mainFuelGallons: number;
        auxiliaryFuelGallons: number;
        configuration: LoadingConfiguration;
    };

    export type LoadingResult = {
        stationMoments: Record<LoadingStationKey, number>;
        zeroFuelMass: number;
        zeroFuelMoment: number;
        zeroFuelCg: number;
        totalMass: number;
        totalMoment: number;
        cg: number;
        maximumTakeoffMass: number;
        maximumZeroFuelMass: number;
        cgCases: ReadonlyArray<{
            fuel: 'loaded' | 'empty';
            deicingFluid: 'loaded' | 'empty';
            mass: number;
            moment: number;
            cg: number;
            withinLimits: boolean;
        }>;
        loadingWithinLimits: boolean;
        cgWithinLimits: boolean;
        valid: boolean;
    };

    const fuelDensityPoundsPerGallon = 7.01;
    const mainFuelArm = 103.5;
    const auxiliaryFuelArm = 126.0;
    // Diamond publishes a 3.9 US gal TKS capacity; the AFM specifies 9.02 lb/US gal.
    const maximumDeicingFluidMass = 35.2;
    const stationIsActive = (key: LoadingStationKey, configuration: LoadingConfiguration) => {
        if (key === 'row-two-left' || key === 'row-two-right' ||
            key === 'rear-e' || key === 'rear-f') {
            return configuration.sevenSeat;
        }
        if (key === 'rear-a' || key === 'rear-b' || key === 'rear-c' || key === 'rear-d') {
            return !configuration.sevenSeat;
        }
        if (key === 'deicing-fluid') {
            return configuration.deicingSystem;
        }
        return true;
    };

    export const cgLimits = (
        massPounds: number,
        maximumTakeoffMass: number,
    ): readonly [number, number] | null => {
        if (!Number.isFinite(massPounds) || !Number.isFinite(maximumTakeoffMass) ||
            massPounds < minimumFlightMass || massPounds > maximumTakeoffMass) {
            return null;
        }
        const forward = massPounds <= 3968
            ? 92.13
            : PerformanceCommon.interpolatePoints(
                [[3968, 92.13], [maximumTakeoffMass, 96.85]],
                massPounds,
            );
        let rearward: number;
        if (massPounds <= 4189) {
            rearward = PerformanceCommon.interpolatePoints(
                [[3527, 96.85], [4189, 98.82]],
                massPounds,
            );
        } else if (massPounds <= 4407 || maximumTakeoffMass <= 4407) {
            rearward = 98.82;
        } else {
            rearward = PerformanceCommon.interpolatePoints(
                [[4407, 98.82], [5071, 99.61]],
                massPounds,
            );
        }
        return [forward, rearward];
    };

    export const checkCG = (
        massPounds: number,
        cgInches: number,
        maximumTakeoffMass: number,
    ) => {
        const limits = cgLimits(massPounds, maximumTakeoffMass);
        if (!limits || !Number.isFinite(cgInches)) {
            return NaN;
        }
        if (cgInches < limits[0]) {
            return -1;
        }
        if (cgInches > limits[1]) {
            return 1;
        }
        return 0;
    };

    export const calculateLoading = (input: LoadingInput): LoadingResult => {
        const configuration = input.configuration;
        const maximumTakeoffMass = configuration.mtom2300 ? 5071 : 4407;
        const maximumZeroFuelMass = configuration.mzfm2200 ? 4850 : 4489;
        const stationMoments = {} as Record<LoadingStationKey, number>;
        let zeroFuelMass = input.emptyMass;
        let zeroFuelMoment = input.emptyMoment;
        let valuesValid = [input.emptyMass, input.emptyMoment].every(Number.isFinite) &&
            input.emptyMass > 0 && input.emptyMoment > 0;

        const masses = {} as Record<LoadingStationKey, number>;
        for (const station of loadingStations) {
            const mass = stationIsActive(station.key, configuration)
                ? input.stationMasses[station.key] ?? 0
                : 0;
            masses[station.key] = mass;
            stationMoments[station.key] = mass * station.arm;
            valuesValid = valuesValid && Number.isFinite(mass) && mass >= 0;
            zeroFuelMass += mass;
            zeroFuelMoment += stationMoments[station.key];
        }

        const mainFuelValid = Number.isFinite(input.mainFuelGallons) &&
            0 <= input.mainFuelGallons && input.mainFuelGallons <= 50;
        const auxiliaryFuelGallons = configuration.auxiliaryTanks
            ? input.auxiliaryFuelGallons
            : 0;
        const auxiliaryFuelValid = Number.isFinite(auxiliaryFuelGallons) &&
            0 <= auxiliaryFuelGallons && auxiliaryFuelGallons <= 36.4;
        const mainFuelMass = input.mainFuelGallons * fuelDensityPoundsPerGallon;
        const auxiliaryFuelMass = auxiliaryFuelGallons * fuelDensityPoundsPerGallon;
        const totalMass = zeroFuelMass + mainFuelMass + auxiliaryFuelMass;
        const totalMoment = zeroFuelMoment + mainFuelMass * mainFuelArm +
            auxiliaryFuelMass * auxiliaryFuelArm;
        const zeroFuelCg = zeroFuelMoment / zeroFuelMass;
        const cg = totalMoment / totalMass;

        const baggageValid = masses['nose-left'] <= 66 && masses['nose-right'] <= 66 &&
            (configuration.sevenSeat
                ? masses['rear-e'] <= 13 && masses['rear-f'] <= 88 &&
                    masses['rear-e'] + masses['rear-f'] <= 101
                : masses['rear-a'] <= 13 && masses['rear-b'] <= 13 &&
                    masses['rear-c'] <= 150 && masses['rear-d'] <= 88 &&
                    masses['rear-a'] + masses['rear-b'] + masses['rear-c'] +
                        masses['rear-d'] <= 265);
        const deicingFluidValid = !configuration.deicingSystem ||
            masses['deicing-fluid'] <= maximumDeicingFluidMass;
        const massValid = valuesValid && mainFuelValid && auxiliaryFuelValid && baggageValid &&
            deicingFluidValid &&
            minimumFlightMass <= zeroFuelMass && zeroFuelMass <= maximumZeroFuelMass &&
            minimumFlightMass <= totalMass && totalMass <= maximumTakeoffMass;
        const deicingFluidMass = masses['deicing-fluid'];
        const deicingFluidMoment = stationMoments['deicing-fluid'];
        const fuelMass = mainFuelMass + auxiliaryFuelMass;
        const fuelMoment = mainFuelMass * mainFuelArm + auxiliaryFuelMass * auxiliaryFuelArm;
        const withoutFluidMass = zeroFuelMass - deicingFluidMass;
        const withoutFluidMoment = zeroFuelMoment - deicingFluidMoment;
        const cgCases = [
            {
                fuel: 'empty' as const,
                deicingFluid: 'loaded' as const,
                mass: zeroFuelMass,
                moment: zeroFuelMoment,
            },
            {
                fuel: 'loaded' as const,
                deicingFluid: 'loaded' as const,
                mass: totalMass,
                moment: totalMoment,
            },
            {
                fuel: 'empty' as const,
                deicingFluid: 'empty' as const,
                mass: withoutFluidMass,
                moment: withoutFluidMoment,
            },
            {
                fuel: 'loaded' as const,
                deicingFluid: 'empty' as const,
                mass: withoutFluidMass + fuelMass,
                moment: withoutFluidMoment + fuelMoment,
            },
        ].map(loadingCase => {
            const caseCg = loadingCase.moment / loadingCase.mass;
            return {
                ...loadingCase,
                cg: caseCg,
                withinLimits: checkCG(
                    loadingCase.mass,
                    caseCg,
                    maximumTakeoffMass,
                ) === 0,
            };
        });
        const requiredCgCases = configuration.deicingSystem ? cgCases : cgCases.slice(0, 2);
        const cgWithinLimits = requiredCgCases.every(loadingCase => loadingCase.withinLimits);
        return {
            stationMoments,
            zeroFuelMass,
            zeroFuelMoment,
            zeroFuelCg,
            totalMass,
            totalMoment,
            cg,
            maximumTakeoffMass,
            maximumZeroFuelMass,
            cgCases,
            loadingWithinLimits: massValid,
            cgWithinLimits,
            valid: massValid && cgWithinLimits,
        };
    };

    const calculator = document.getElementById('da62-calculator');
    if (calculator) {
        const query = <T extends Element>(selector: string): T => {
            const element = calculator.querySelector<T>(selector);
            if (!element) {
                throw new Error(`Missing required DA62 element: ${selector}`);
            }
            return element;
        };
        const getValue = (selector: string) =>
            query<HTMLInputElement>(selector).value.trim();
        const numberValue = (selector: string, defaultValue = NaN) => {
            const text = getValue(selector);
            if (text === '') {
                return defaultValue;
            }
            const value = Number(text);
            return Number.isFinite(value) ? value : NaN;
        };
        const setInput = (selector: string, value: number, precision = 0) => {
            query<HTMLInputElement>(selector).value = Number.isFinite(value)
                ? value.toFixed(precision)
                : '';
        };
        const setOutput = (selector: string, value: string) => {
            for (const output of calculator.querySelectorAll<HTMLElement>(selector)) {
                output.textContent = value;
            }
        };
        const formatNumber = (value: number, precision = 0) =>
            Number.isFinite(value) ? value.toFixed(precision) : '';
        const formatWeight = (value: number) =>
            formatNumber(value, Number.isInteger(value) ? 0 : 1);
        const formatSpeed = (speed: number) =>
            Number.isFinite(speed) ? speed.toFixed(Number.isInteger(speed) ? 0 : 1) : '';
        const formatSpeeds = (...speeds: number[]) => speeds.every(Number.isFinite)
            ? speeds.map(formatSpeed).join(' / ')
            : '';
        const formatDistance = (distance: number) =>
            Number.isFinite(distance) ? Math.ceil(distance - 1e-9).toFixed(0) : '';
        const formatRate = (rate: number) =>
            Number.isFinite(rate) ? Math.floor(rate + 1e-9).toFixed(0) : '';
        const formatGradient = (gradient: number) =>
            Number.isFinite(gradient) ? `${gradient.toFixed(1)}%` : '';

        const refreshFuelFlow = () => {
            const fuelFlow = calculateFuelFlow(numberValue('.ff-power'));
            setOutput('.ff-per-engine', formatNumber(fuelFlow.perEngineGph, 1));
            setOutput('.ff-total', formatNumber(fuelFlow.totalGph, 1));
        };

        const configuration = (): LoadingConfiguration => ({
            mtom2300: query<HTMLInputElement>('[name="mam-62-001"]').checked,
            mzfm2200: query<HTMLInputElement>('[name="mam-62-063"]').checked,
            sevenSeat: query<HTMLInputElement>('[name="oam-62-019"]').checked,
            auxiliaryTanks: query<HTMLInputElement>('[name="oam-62-001"]').checked,
            deicingSystem: query<HTMLInputElement>('[name="oam-62-002"]').checked,
        });

        const toggleStationInputs = (current: LoadingConfiguration) => {
            for (const station of loadingStations) {
                const input = query<HTMLInputElement>(`.${station.key}-mass`);
                input.disabled = !stationIsActive(station.key, current);
            }
            query<HTMLInputElement>('.aux-fuel-vol').disabled = !current.auxiliaryTanks;
            query<HTMLElement>('.rear-baggage-five-seat').hidden = current.sevenSeat;
            query<HTMLElement>('.rear-baggage-seven-seat').hidden = !current.sevenSeat;
            setOutput('.rear-baggage-layout', current.sevenSeat
                ? '7-seat layout · areas E–F'
                : '5-seat layout · areas A–D');
        };

        const readLoading = (): LoadingInput => {
            const current = configuration();
            toggleStationInputs(current);
            const stationMasses: Partial<Record<LoadingStationKey, number>> = {};
            for (const station of loadingStations) {
                stationMasses[station.key] = stationIsActive(station.key, current)
                    ? numberValue(`.${station.key}-mass`, 0)
                    : 0;
            }
            return {
                emptyMass: numberValue('.empty-mass'),
                emptyMoment: numberValue('.empty-moment'),
                stationMasses,
                mainFuelGallons: numberValue('.main-fuel-vol', 0),
                auxiliaryFuelGallons: current.auxiliaryTanks
                    ? numberValue('.aux-fuel-vol', 0)
                    : 0,
                configuration: current,
            };
        };

        const refresh = () => {
            const qnhInput = query<HTMLInputElement>('.qnh');
            const pressureAltitudeInput = query<HTMLInputElement>('.press-alt');
            const fieldElevation = numberValue('.field-alt');
            if (pressureAltitudeInput.classList.contains('active')) {
                const altitude = numberValue('.press-alt');
                setInput('.qnh', 29.92 - (altitude - fieldElevation) / 1000, 2);
            } else {
                setInput('.press-alt', pressureAltitude(fieldElevation, numberValue('.qnh')));
            }

            const loadingInput = readLoading();
            const loading = calculateLoading(loadingInput);
            for (const station of loadingStations) {
                const value = stationIsActive(station.key, loadingInput.configuration)
                    ? loading.stationMoments[station.key]
                    : NaN;
                setOutput(`.${station.key}-moment`, formatNumber(value, 1));
            }
            const activeRearBaggage = rearBaggageKeys(loadingInput.configuration);
            const rearBaggageMass = activeRearBaggage.reduce(
                (total, key) => total + (loadingInput.stationMasses[key] ?? 0),
                0,
            );
            const rearBaggageMoment = activeRearBaggage.reduce(
                (total, key) => total + loading.stationMoments[key],
                0,
            );
            const rearBaggageLimit = loadingInput.configuration.sevenSeat ? 101 : 265;
            setOutput('.rear-baggage-total', formatWeight(rearBaggageMass));
            setOutput('.rear-baggage-moment', formatNumber(rearBaggageMoment, 1));
            setOutput('.rear-baggage-limit', String(rearBaggageLimit));
            setOutput(
                '.rear-baggage-remaining',
                formatWeight(rearBaggageLimit - rearBaggageMass),
            );
            const mainFuelMass = loadingInput.mainFuelGallons * fuelDensityPoundsPerGallon;
            const auxiliaryFuelMass = loadingInput.auxiliaryFuelGallons *
                fuelDensityPoundsPerGallon;
            setOutput('.main-fuel-moment', formatNumber(mainFuelMass * mainFuelArm, 1));
            setOutput('.aux-fuel-moment', loadingInput.configuration.auxiliaryTanks
                ? formatNumber(auxiliaryFuelMass * auxiliaryFuelArm, 1)
                : '');
            setOutput('.zero-fuel-mass', formatNumber(loading.zeroFuelMass, 1));
            setOutput('.zero-fuel-moment', formatNumber(loading.zeroFuelMoment, 1));
            setOutput('.total-mass', formatNumber(loading.totalMass, 1));
            setOutput('.total-moment', formatNumber(loading.totalMoment, 1));
            const cgDirection = checkCG(
                loading.totalMass,
                loading.cg,
                loading.maximumTakeoffMass,
            );
            const cgMark = Number.isFinite(loading.cg)
                ? `${cgDirection === -1 ? '<<' : ''}${loading.cg.toFixed(2)}` +
                    `${cgDirection === 1 ? '>>' : ''}`
                : '';
            setOutput('.cg', cgMark);
            query<HTMLElement>('.mass-wrapper').classList.toggle(
                'ok',
                loading.loadingWithinLimits,
            );
            query<HTMLElement>('.cg-wrapper').classList.toggle('ok', loading.cgWithinLimits);

            const weight = loading.valid ? loading.totalMass : NaN;
            const oat = numberValue('.oat');
            const altitude = numberValue('.press-alt');
            const headwind = numberValue('.headwind', 0);
            setOutput('.density-alt', formatNumber(densityAltitude(altitude, oat)));
            const takeoffTO = calculateTakeoff(weight, altitude, oat, headwind, 'TO');
            const takeoffUP = calculateTakeoff(weight, altitude, oat, headwind, 'UP');
            const landingLDG = calculateLanding(weight, altitude, oat, headwind, 'LDG');
            const landingTO = calculateLanding(weight, altitude, oat, headwind, 'TO');
            const landingUP = calculateLanding(weight, altitude, oat, headwind, 'UP');
            const climbs = [
                ['.climb-to', calculateClimb('takeoff', weight, altitude, oat, 'TO')],
                ['.climb-up', calculateClimb('takeoff', weight, altitude, oat, 'UP')],
                ['.climb-cruise', calculateClimb('cruise', weight, altitude, oat)],
                ['.climb-oei', calculateClimb('oei', weight, altitude, oat)],
                ['.climb-go-around', calculateClimb('goAround', weight, altitude, oat)],
            ] as const;

            setOutput('.takeoff-to-ground', formatDistance(takeoffTO.groundRoll));
            setOutput('.takeoff-to-50', formatDistance(takeoffTO.over50ft));
            setOutput('.takeoff-to-speed', formatSpeeds(takeoffTO.vrKias, takeoffTO.v50Kias));
            setOutput('.takeoff-up-ground', formatDistance(takeoffUP.groundRoll));
            setOutput('.takeoff-up-50', formatDistance(takeoffUP.over50ft));
            setOutput('.takeoff-up-speed', formatSpeeds(takeoffUP.vrKias, takeoffUP.v50Kias));
            setOutput('.landing-ldg-speed', formatSpeed(landingLDG.vrefKias));
            setOutput('.landing-ldg-ground', formatDistance(landingLDG.groundRoll));
            setOutput('.landing-ldg-50', formatDistance(landingLDG.over50ft));
            setOutput(
                '.landing-abnormal-speed',
                formatSpeeds(landingTO.vrefKias, landingUP.vrefKias),
            );
            setOutput('.landing-abnormal-ground', formatDistance(landingTO.groundRoll));
            setOutput('.landing-abnormal-50', formatDistance(landingTO.over50ft));
            for (const [prefix, result] of climbs) {
                setOutput(`${prefix}-speed`, formatSpeed(result.kias));
                setOutput(`${prefix}-rate`, formatRate(result.rateFpm));
                setOutput(`${prefix}-gradient`, formatGradient(result.gradientPercent));
            }
            const oeiGradient = climbs[3][1].gradientPercent;
            const oeiOutput = query<HTMLElement>('.climb-oei-gradient');
            const belowRecommended = Number.isFinite(oeiGradient) && oeiGradient < 3.3;
            oeiOutput.classList.toggle('below-recommended', belowRecommended);
            oeiOutput.setAttribute(
                'title',
                belowRecommended
                    ? 'Below 3.3%: continued takeoff is not recommended by the AFM.'
                    : '',
            );
            refreshFuelFlow();

            const qnh = numberValue('.qnh');
            qnhInput.setAttribute('aria-invalid', String(!(20 <= qnh && qnh <= 40)));
        };

        const stateClasses = [
            'empty-mass', 'empty-moment',
            ...loadingStations.map(station => `${station.key}-mass`),
            'main-fuel-vol', 'aux-fuel-vol',
            'oat', 'qnh', 'field-alt', 'press-alt', 'headwind', 'ff-power',
        ] as const;
        const stateCheckboxes = [
            'mam-62-001', 'mam-62-063',
            'oam-62-019', 'oam-62-001', 'oam-62-002', 'oam-62-009',
        ] as const;
        const codec = JsonUrl('lzma');
        const stateCookieName = 'da62-state';
        const supportsStateCookie = () => {
            const protocol = new URL(window.location.href).protocol;
            return protocol === 'http:' || protocol === 'https:';
        };

        const collectState = () => ({
            ...Object.fromEntries(
                stateClasses.map(className => [className, getValue(`.${className}`)]),
            ),
            ...Object.fromEntries(stateCheckboxes.map(name => [
                name,
                query<HTMLInputElement>(`[name="${name}"]`).checked,
            ])),
        });

        const writeStateCookie = (data: string) => {
            if (!supportsStateCookie()) {
                return;
            }
            document.cookie = `${stateCookieName}=${encodeURIComponent(data)}; ` +
                'Max-Age=31536000; Path=/; Secure; SameSite=Lax';
        };

        const restore = async (data: string) => {
            if (data) {
                try {
                    const state = await codec.decompress(data);
                    if (state === null || typeof state !== 'object' || Array.isArray(state)) {
                        throw new TypeError('Saved state must be an object.');
                    }
                    for (const className of stateClasses) {
                        const value = state[className];
                        if (typeof value === 'string' || typeof value === 'number') {
                            const input = query<HTMLInputElement>(`.${className}`);
                            input.value = String(value).slice(0, input.maxLength);
                        }
                    }
                    for (const name of stateCheckboxes) {
                        if (typeof state[name] === 'boolean') {
                            query<HTMLInputElement>(`[name="${name}"]`).checked = state[name];
                        }
                    }
                    writeStateCookie(data);
                } catch (error) {
                    console.warn('Ignoring invalid DA62 saved state.', error);
                }
            }
            refresh();
        };

        const showSavedUrl = (savedUrl: string, copied: boolean) => {
            const output = query<HTMLElement>('#url');
            const message = document.createElement('span');
            const textarea = document.createElement('textarea');
            message.textContent = copied ? 'Saved and copied to clipboard:' : 'Saved. Copy this link:';
            textarea.value = savedUrl;
            textarea.readOnly = true;
            output.replaceChildren(message, textarea);
            if (!copied) {
                textarea.focus();
                textarea.select();
            }
        };

        const save = async () => {
            const output = query<HTMLElement>('#url');
            try {
                const state = await codec.compress(collectState());
                writeStateCookie(state);
                const url = new URL(window.location.href);
                url.search = '';
                url.searchParams.set('s', state);
                url.hash = '';
                window.history.replaceState(null, '', url.href);
                let copied = false;
                try {
                    if (navigator.clipboard?.writeText) {
                        await navigator.clipboard.writeText(url.href);
                        copied = true;
                    }
                } catch {
                    // The URL remains selectable when clipboard access is unavailable.
                }
                showSavedUrl(url.href, copied);
            } catch (error) {
                console.error('Could not save the DA62 state.', error);
                output.textContent = 'Could not save the current state.';
            }
        };

        const registerActiveInput = (input: HTMLInputElement) => {
            input.addEventListener('focus', () => input.classList.add('active'));
            input.addEventListener('blur', () => input.classList.remove('active'));
        };
        const initializeDialog = (
            dialog: HTMLDialogElement,
            openButton: HTMLButtonElement,
            closeButton: HTMLButtonElement,
        ) => {
            openButton.addEventListener('click', () => {
                if (!dialog.open) {
                    dialog.showModal();
                    openButton.setAttribute('aria-expanded', 'true');
                }
            });
            closeButton.addEventListener('click', () => dialog.close());
            dialog.addEventListener('click', event => {
                const bounds = dialog.getBoundingClientRect();
                const outside = event.clientX < bounds.left || event.clientX > bounds.right ||
                    event.clientY < bounds.top || event.clientY > bounds.bottom;
                if (event.target === dialog && outside) {
                    dialog.close();
                }
            });
            dialog.addEventListener('close', () => {
                openButton.setAttribute('aria-expanded', 'false');
                openButton.focus();
            });
        };

        registerActiveInput(query<HTMLInputElement>('.qnh'));
        registerActiveInput(query<HTMLInputElement>('.press-alt'));
        for (const input of calculator.querySelectorAll<HTMLInputElement>(
            '#weights input.update, #rear-baggage-dialog input.update, #env input.update',
        )) {
            input.addEventListener('input', refresh);
        }
        query<HTMLButtonElement>('#save').addEventListener('click', () => void save());

        const baggageDialog = query<HTMLDialogElement>('#rear-baggage-dialog');
        const baggageEdit = query<HTMLButtonElement>('#rear-baggage-edit');
        const baggageClose = query<HTMLButtonElement>('#rear-baggage-close');
        initializeDialog(baggageDialog, baggageEdit, baggageClose);

        const toolsDrawer = calculator.querySelector<HTMLDialogElement>('#tools-drawer');
        const toolsToggle = calculator.querySelector<HTMLButtonElement>('#tools-toggle');
        const toolsClose = calculator.querySelector<HTMLButtonElement>('#tools-close');
        if (toolsDrawer && toolsToggle && toolsClose) {
            initializeDialog(toolsDrawer, toolsToggle, toolsClose);
        }

        const urlState = new URLSearchParams(window.location.search).get('s');
        let cookieState = '';
        if (!urlState && supportsStateCookie()) {
            const cookie = document.cookie.match(
                new RegExp(`(?:^|;\\s*)${stateCookieName}=([^;]*)`),
            );
            if (cookie) {
                try {
                    cookieState = decodeURIComponent(cookie[1]);
                } catch {
                    console.warn('Ignoring malformed DA62 saved-state cookie.');
                }
            }
        }
        void restore(urlState || cookieState);

        const tools = calculator.querySelector<HTMLElement>('#tools');
        if (tools) {
            try {
                FlightTools.initialize(tools, refreshFuelFlow);
            } catch (error) {
                // Loading and AFM performance are the primary application.
                // A side-tool failure must not prevent their initial calculation.
                console.error('Could not initialize General Tools.', error);
            }
        }
    }
}
