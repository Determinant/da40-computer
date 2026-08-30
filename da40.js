const getBounds = (path) => {
    let start = path.getPointAtLength(0);
    let end = path.getPointAtLength(path.getTotalLength());
    let o = {
        xmin: start.x,
        xmax: end.x,
        ymin: start.y,
        ymax: end.y
    };
    if (o.xmin > o.xmax) {
        [o.xmin, o.xmax] = [o.xmax, o.xmin];
    }
    if (o.ymin > o.ymax) {
        [o.ymin, o.ymax] = [o.ymax, o.ymin];
    }
    return o;
};
class Coordinate {
    constructor(x, y, flipY) {
        let ox = getBounds(x);
        let oy = getBounds(y);
        this.origin = {
            x: Math.min(oy.xmin, ox.xmin),
            y: Math.min(oy.ymin, ox.ymin),
        };
        this.xmax = Math.max(oy.xmax, ox.xmax);
        this.ymax = Math.max(oy.ymax, ox.ymax);
        this.flipY = !!flipY;
    }

    getCanvasX = (x, y) => (this.xmax - this.origin.x) * x + this.origin.x;
    getCanvasY(y) {
        if (this.flipY) {
            y = 1 - y;
        }
        return (this.ymax - this.origin.y) * y + this.origin.y;
    }

    getPointAtCanvasX(path, canvasX) {
        let l = 0;
        let r = path.getTotalLength();
        if (path.getPointAtLength(l).x > path.getPointAtLength(r).x) {
            let tmp = l;
            l = r;
            r = tmp;
        }
        while (Math.abs(l - r) > 1e-4) {
            let mid = (l + r) / 2.0;
            let midPoint = path.getPointAtLength(mid);
            if (midPoint.x < canvasX) {
                l = mid
            } else {
                r = mid
            }
        }
        return path.getPointAtLength(l);
    }

    getPointAtCanvasY(path, canvasY) {
        let l = 0;
        let r = path.getTotalLength();
        if (path.getPointAtLength(l).y > path.getPointAtLength(r).y) {
            let tmp = l;
            l = r;
            r = tmp;
        }
        while (Math.abs(l - r) > 1e-4) {
            let mid = (l + r) / 2.0;
            let midPoint = path.getPointAtLength(mid);
            if (midPoint.y < canvasY) {
                l = mid
            } else {
                r = mid
            }
        }
        return path.getPointAtLength(l);
    }

    getX = (canvasX) => (canvasX - this.origin.x) / (this.xmax - this.origin.x);
    getY = (canvasY) => (this.flipY ? (this.ymax - canvasY) : (canvasY - this.origin.y)) / (this.ymax - this.origin.y);
    getPointAtX = (path, x) => this.getPointAtCanvasX(path, this.getCanvasX(x));
    getPointAtY = (path, y) => this.getPointAtCanvasY(path, this.getCanvasY(y));
}

const createChartCalculator = (chart) => {
    const chartObject = document.getElementById(chart.doc);
    const svgDoc = chartObject && chartObject.contentDocument;
    const svg = svgDoc && svgDoc.getElementById(chart.svg);
    const canvas = svgDoc && svgDoc.getElementById(chart.canvas);
    let calcLines = [];

    if (!svgDoc || !svg || !canvas) {
        console.warn(`Chart unavailable: ${chart.doc}`);
        return () => NaN;
    }

    const prepareStep = (step) => {
        const xAxis = svgDoc.getElementById(step.x);
        const yAxis = svgDoc.getElementById(step.y);
        let curveIDs = step.curves;
        let curveMarks = [];
        let curves = [];
        let prev = 0;
        curves = curveIDs.map(id => svgDoc.getElementById(id));
        const paths = [xAxis, yAxis, ...curves];
        if (paths.some(path => !path || typeof path.getPointAtLength !== 'function' ||
            typeof path.getTotalLength !== 'function')) {
            console.warn(`Chart step unavailable: ${chart.doc}`);
            return null;
        }
        let coord = new Coordinate(xAxis, yAxis, chart.flipY);
        if (step.marks === undefined) {
            for (let i = 0; i < curveIDs.length; i++) {
                curveMarks.push(coord.getY(curves[i].getPointAtLength(0).y));
                if (curveMarks[i] < prev) {
                    console.log("invalid marks!");
                }
                prev = curveMarks[i];
            }
        } else {
            curveMarks = step.marks;
        }
        let up = document.createElementNS(svg.namespaceURI, "path");
        let right = document.createElementNS(svg.namespaceURI, "path");
        canvas.appendChild(up);
        canvas.appendChild(right);
        calcLines.push(up);
        calcLines.push(right);

        //step.coord = coord;

        return (output, input) => {
            if (output == null || isNaN(input)) {
                return null;
            }
            let x = step.getX(input);
            if (x == null) {
                return null;
            }
            let prevCurveIdx = 0;
            let curveIdx;
            for (let i = 0; i < curveMarks.length; i++) {
                if (output <= curveMarks[i]) {
                    curveIdx = i;
                    break;
                }
                prevCurveIdx = i;
            }
            if (curveIdx === undefined) {
                return null;
            }
            let canvasY1 = coord.getPointAtX(curves[curveIdx], x).y;
            let canvasY0 = coord.getPointAtX(curves[prevCurveIdx], x).y;
            let ratio = (output - curveMarks[prevCurveIdx]) / (curveMarks[curveIdx] - curveMarks[prevCurveIdx]);
            let canvasY = canvasY0 == canvasY1 ? canvasY0 : ((canvasY1 - canvasY0) * ratio + canvasY0);
            let strokeWidth = chart.lineWidth ? chart.lineWidth : '1px';
            up.setAttribute("d", `M ${coord.getCanvasX(x)},${coord.getCanvasY(0)} V ${canvasY}`);
            up.setAttribute("stroke", "red");
            up.setAttribute("stroke-width", strokeWidth);
            up.setAttribute("opacity", 1);
            up.setAttribute("fill", "none");

            right.setAttribute("d", `M ${coord.getCanvasX(x)},${canvasY} H ${coord.getCanvasX(1)}`);
            right.setAttribute("stroke", "red");
            right.setAttribute("stroke-width", strokeWidth);
            right.setAttribute("opacity", 1);
            right.setAttribute("fill", "none");
            return coord.getY(canvasY);
        }
    }

    let inputPress = prepareStep(chart.press);
    let inputMass = chart.mass ? prepareStep(chart.mass) : null;
    let inputWind = chart.wind ? prepareStep(chart.wind) : null;
    let inputObst = chart.obst ? prepareStep(chart.obst) : null;

    if (!inputPress || (chart.mass && !inputMass) || (chart.wind && !inputWind) ||
        (chart.obst && !inputObst)) {
        return () => NaN;
    }

    return (alt, oat, mass, wind, obst) => {
        for (let i = 0; i < calcLines.length; i++) {
            calcLines[i].setAttribute('d', '');
        }
        if (alt < 0) {
            alt = 0;
        }
        if (alt > 10000) {
            return NaN;
        }
        let out = inputPress(alt, oat);
        if (inputMass) {
            out = inputMass(out, mass);
        }
        if (inputWind) {
            out = inputWind(out, wind);
        }
        if (inputObst) {
            out = inputObst(out, obst);
        }
        if (out == null) {
            return NaN;
        }
        return chart.output(out);
    }
};

const setValue = (dom, v) => {
    dom.innerText = v;
}

const clearValue = (dom) => {
    dom.innerText = "";
}

const formatFloat = (v, prec) => Number.isFinite(v) ? v.toFixed(prec === undefined ? 2 : prec) : "";
const formatInt = (v) => Number.isFinite(v) ? v.toFixed(0) : "";
const rectifyDir = (v) => (v % 360 + 360) % 360;
const formatDir = (v) => Number.isFinite(v) ? padZero(rectifyDir(v) || 360, 3) : "";
const feetPerNauticalMile = (fpm, knots) =>
    Number.isFinite(fpm) && Number.isFinite(knots) && knots > 0 ? fpm * 60 / knots : NaN;

const withinDirRange = (d, from, to) => {
    from = rectifyDir(from);
    to = rectifyDir(to);
    d = rectifyDir(d);
    if (to < from) {
        to += 360;
    }
    if (d < from) {
        d += 360;
    }
    return d <= to;
}

const parseQNH = (e) => {
    const x = parseValue(e);
    return (20 <= x && x <= 40) ? x : NaN;
}

const parseValue = (e, d) => {
    const text = e.innerText.trim();
    if (text == "") {
        return d;
    }
    const x = Number(text);
    return Number.isFinite(x) ? x : NaN;
}

const parsePositiveValue = (e, d) => {
    const x = parseValue(e, d);
    return x === undefined || x === null || x >= 0 ? x : NaN;
}

const parseDirection = (e, d) => {
    const x = parseValue(e, d);
    return x === undefined || x === null || (0 <= x && x <= 360) ? x : NaN;
}

const parseRunway = (e, d) => {
    const x = parseValue(e, d);
    return x === undefined || x === null || (Number.isInteger(x) && 1 <= x && x <= 36) ? x : NaN;
}

const rad2deg = (r) => r / Math.PI * 180;
const deg2rad = (d) => d / 180 * Math.PI;
const padZero = (num, size) => {
    const s = "000000000" + num;
    return s.substr(s.length - size);
}

const arms = [
    90.6, // front left
    90.6, // front right
    128, // rear left
    128, // rear right
    143.7, // std baggage
    170.1, // baggage tube
    153.1, // ext baggage (forward)
    178.7, // ext baggage (aft)
];

const nauticalInFeet = 6076.12;
const fuelDensity = 6.01; // lb/gal
const fuelArm = 103.5;
const maxFuelVolumeStd = 40;
const maxFuelVolumeLong = 50;
const maxRearwardCGStd = 102;
const maxRearwardCGLong = 100.4;
const maxGrossWeight = 2535;
const maxGrossWeightAlt = 2646;

const weightSteps = [1874, 2205, 2535, 2646];
const vys = [54, 60, 66, 67];
const vclimbs = [60, 68, 73, 76];
const vgs = [60, 68, 73, 76];
const vappLdgs = [58, 63, 71, 73];
const vappTos = [59, 66, 72, 74];
const vappUp = [60, 68, 73, 76];
const vyGradientSpeed = 67;
const climbGradientSpeed = 76;

const massClasses = [
    '.front-left-mass',
    '.front-right-mass',
    '.rear-left-mass',
    '.rear-right-mass',
    '.baggage-std-mass',
    '.baggage-tube-mass',
    '.baggage-ext-forward-mass',
    '.baggage-ext-aft-mass',
];
const momentClasses = [
    '.front-left-moment',
    '.front-right-moment',
    '.rear-left-moment',
    '.rear-right-moment',
    '.baggage-std-moment',
    '.baggage-tube-moment',
    '.baggage-ext-forward-moment',
    '.baggage-ext-aft-moment',
];

const speedClasses = ['.vy', '.vclimb', '.vg'];

const takeoffChart = {
    doc: 'takeoff',
    svg: 'svg2',
    canvas: 'g10',
    press: {
        x: 'path1397',
        y: 'path1395',
        curves: ['path1427', 'path1540', 'path1558', 'path1577', 'path1597', 'path1620'],
        marks: [0, 2000, 4000, 6000, 8000, 10000],
        getX: (oat) => {
            const minOAT = -20;
            const maxOAT = 50;
            if (oat < minOAT || oat > maxOAT) {
                return null; // OAT out of range
            }
            return (oat - minOAT) / (maxOAT - minOAT);
        }
    },
    mass: {
        x: 'path1700',
        y: 'path1698',
        curves: ['path1708', 'path1706', 'path1704', 'path1702'],
        getX: (mass) => {
            const minMass = 1874;
            const maxMass = 2646;
            if (mass < minMass || mass > maxMass) {
                return null; // mass out of range
            }
            return (maxMass - mass) / (maxMass - minMass);
        }
    },
    wind: {
        x: 'path1816',
        y: 'path1814',
        curves: ['path1856', 'path1854', 'path1852', 'path1850', 'path1848', 'path1846'],
        getX: (wind) => {
            const minWind = 0;
            const maxWind = 20;
            if (wind < minWind || wind > maxWind) {
                return null; // wind out of range
            }
            return (wind - minWind) / (maxWind - minWind);
        }
    },
    obst: {
        x: 'path1962',
        y: 'path1960',
        curves: ['path2002', 'path2004', 'path2006', 'path2008', 'path2010', 'path2012', 'path2014', 'path2059', 'path2061'],
        getX: (obst) => {
            const minObst = 0;
            const maxObst = 50;
            if (obst < minObst || obst > maxObst) {
                return null;
            }
            return (obst - minObst) / (maxObst - minObst);
        }
    },
    output: (y) => Math.ceil((y * (1400 - 100) + 100) * 3.28084),
};

const landingChart = {
    doc: 'landing',
    svg: 'svg378',
    canvas: 'layer1',
    flipY: true,
    lineWidth: '0.35px',
    press: {
        x: 'path729',
        y: 'path727',
        curves: ['path1501', 'path1503', 'path1505', 'path1550', 'path1552', 'path1554'],
        marks: [0, 2000, 4000, 6000, 8000, 10000],
        getX: (oat) => {
            const minOAT = -20;
            const maxOAT = 50;
            if (oat < minOAT || oat > maxOAT) {
                return null; // OAT out of range
            }
            return (oat - minOAT) / (maxOAT - minOAT);
        }
    },
    mass: {
        x: 'path1317',
        y: 'path1315',
        curves: ['path1339', 'path1341', 'path1397', 'path1399', 'path1401', 'path1403'],
        getX: (mass) => {
            const minMass = 1874;
            const maxMass = 2646;
            if (mass < minMass || mass > maxMass) {
                return null; // mass out of range
            }
            return (maxMass - mass) / (maxMass - minMass);
        }
    },
    wind: {
        x: 'path1381',
        y: 'path1379',
        curves: ['path642', 'path1199', 'path1201', 'path1249', 'path1296', 'path1298', 'path1300'],
        getX: (wind) => {
            const minWind = 0;
            const maxWind = 20;
            if (wind < minWind || wind > maxWind) {
                return null; // wind out of range
            }
            return (wind - minWind) / (maxWind - minWind);
        }
    },
    obst: {
        x: 'path1433',
        y: 'path1431',
        curves: ['path1435', 'path1439', 'path1441', 'path1443', 'path1445', 'path1585', 'path1630', 'path1632', 'path1679', 'path1681', 'path1683', 'path1685'],
        getX: (obst) => {
            const minObst = 0;
            const maxObst = 50;
            if (obst < minObst || obst > maxObst) {
                return null;
            }
            return (maxObst - obst) / (maxObst - minObst);
        }
    },
    output: (y) => Math.ceil((y * (1400 - 100) + 100) * 3.28084),
};

const takeoffClimbChart = {
    doc: 'takeoff-climb',
    svg: 'svg471',
    canvas: 'layer1',
    flipY: true,
    lineWidth: '0.35px',
    press: {
        x: 'path718',
        y: 'path716',
        curves: ['path733', 'path735', 'path737', 'path753', 'path755', 'path757'],
        marks: [0, 2000, 4000, 6000, 8000, 10000],
        getX: (oat) => {
            const minOAT = -20;
            const maxOAT = 50;
            if (oat < minOAT || oat > maxOAT) {
                return null; // OAT out of range
            }
            return (oat - minOAT) / (maxOAT - minOAT);
        }
    },
    mass: {
        x: 'path1332',
        y: 'path1330',
        curves: ['path1353', 'path1355', 'path1357', 'path1359', 'path1361', 'path1363', 'path1365'],
        getX: (mass) => {
            const minMass = 2094;
            const maxMass = 2646;
            if (mass < minMass || mass > maxMass) {
                return null; // mass out of range
            }
            return (maxMass - mass) / (maxMass - minMass);
        }
    },
    output: (y) => Math.ceil((1 - y) * (1600 - 0) + 0),
};

const cruiseClimbChart = {
    doc: 'cruise-climb',
    svg: 'svg471',
    canvas: 'layer1',
    flipY: true,
    lineWidth: '0.35px',
    press: {
        x: 'path728',
        y: 'path726',
        curves: ['path741', 'path743', 'path745', 'path747', 'path764', 'path766'],
        marks: [0, 2000, 4000, 6000, 8000, 10000],
        getX: (oat) => {
            const minOAT = -20;
            const maxOAT = 50;
            if (oat < minOAT || oat > maxOAT) {
                return null; // OAT out of range
            }
            return (oat - minOAT) / (maxOAT - minOAT);
        }
    },
    mass: {
        x: 'path1375',
        y: 'path1377',
        curves: ['path1398', 'path1400', 'path1402', 'path1404', 'path1429', 'path1431', 'path1433'],
        getX: (mass) => {
            const minMass = 2094;
            const maxMass = 2646;
            if (mass < minMass || mass > maxMass) {
                return null; // mass out of range
            }
            return (maxMass - mass) / (maxMass - minMass);
        }
    },
    output: (y) => Math.ceil((1 - y) * (1600 - 0) + 0),
};

let takeoffCalc;
let landingCalc;
let takeoffClimbCalc;
let cruiseClimbCalc;
let fpmSource;

const interpolateAirspeed = (speeds, mass) => {
    let start = 0;
    let speed0 = 0;
    let speedMin = speeds[0];
    for (let i = 0; i < weightSteps.length; i++) {
        let end = weightSteps[i];
        if (mass <= end) {
            let ratio = (mass - start) / (end - start);
            return Math.ceil(Math.max((speeds[i] - speed0) * ratio + speed0, speedMin));
        }
        speed0 = speeds[i];
        start = end;
    }
}

const checkCG = (mass, cg, isLongRange) => {
    const minForwardCG = mass > 2161 ? ((97.6 - 94.5) / (2646 - 2161) * (mass - 2161) + 94.5) : 94.5;
    const maxRearwardCG = isLongRange ? maxRearwardCGLong : maxRearwardCGStd;
    if (cg > maxRearwardCG) {
        return 1;
    }
    if (cg < minForwardCG) {
        return -1;
    }
    return 0;
}

const checkMass = (mass, mam) =>
    Number.isFinite(mass) && mass <= (mam ? maxGrossWeightAlt : maxGrossWeight);

const refresh = () => {
    const weights = document.getElementById('weights');
    const outputs = document.getElementById('outputs');
    const env = document.getElementById('env');

    const qnh = env.querySelector('.qnh');
    const press = env.querySelector('.press-alt');
    const elev = parsePositiveValue(env.querySelector('.field-alt'));

    if (qnh.classList.contains('active')) {
        press.textContent = formatInt((29.92 - parseQNH(qnh)) * 1000 + elev);
    } else if (press.classList.contains('active')) {
        qnh.textContent = formatFloat(29.92 - (parseValue(press) - elev) / 1000, 2);
    } else {
        press.textContent = formatInt((29.92 - parseQNH(qnh)) * 1000 + elev);
    }

    let totalMass = parsePositiveValue(weights.querySelector('.empty-mass'));
    let totalMoment = parsePositiveValue(weights.querySelector('.empty-moment'));
    for (let i = 0; i < massClasses.length; i++) {
        const mass = parsePositiveValue(weights.querySelector(massClasses[i]), 0);
        const moment = mass * arms[i];
        setValue(weights.querySelector(momentClasses[i]), formatFloat(moment, 2));
        totalMass += mass;
        totalMoment += moment;
    }

    const isMAM = weights.querySelector('input[name="mam-40-227"]').checked;
    const isLongRange = weights.querySelector('input[name="longrange-tank"]').checked;
    const fuelVolume = parsePositiveValue(weights.querySelector('.fuel-vol'));
    const maxFuelVolume = isLongRange ? maxFuelVolumeLong : maxFuelVolumeStd;
    const fuelMass = Number.isFinite(fuelVolume) && fuelVolume <= maxFuelVolume ? fuelVolume * fuelDensity : NaN;
    const fuelMoment = fuelMass * fuelArm;
    setValue(weights.querySelector('.fuel-moment'), formatFloat(fuelMoment));
    totalMass += fuelMass;
    totalMoment += fuelMoment;

    setValue(weights.querySelector('.total-mass'), formatFloat(totalMass));
    setValue(weights.querySelector('.total-moment'), formatFloat(totalMoment));

    const cg = totalMoment / totalMass;
    const cgOut = checkCG(totalMass, cg, isLongRange);
    const massOk = checkMass(totalMass, isMAM);
    const wbOk = massOk && (cgOut == 0);

    const massOutput = outputs.querySelector('.total-mass');
    const cgOutput = outputs.querySelector('.cg');
    setValue(massOutput, formatFloat(totalMass));
    if (isNaN(totalMass)) {
        massOutput.parentNode.classList.remove('ok');
    } else {
        const classes = massOutput.parentNode.classList;
        if (massOk) {
            classes.add('ok');
        } else {
            classes.remove('ok');
        }
    }
    let cgMark = formatFloat(cg);
    if (cgOut > 0) {
        cgMark += ">>";
    } else if (cgOut < 0) {
        cgMark = "<<" + cgMark;
    }
    setValue(cgOutput, cgMark);
    if (isNaN(cg)) {
        cgOutput.parentNode.classList.remove('ok');
    } else {
        const classes = cgOutput.parentNode.classList;
        if (cgOut == 0) {
            classes.add('ok');
        } else {
            classes.remove('ok');
        }
    }

    const speeds = [vys, vclimbs, vgs];
    const oat = parseValue(env.querySelector('.oat'));
    const pressAlt = parseValue(env.querySelector('.press-alt'));

    if (wbOk) {
        for (let i = 0; i < speeds.length; i++) {
            setValue(outputs.querySelector(speedClasses[i]), formatInt(interpolateAirspeed(speeds[i], totalMass)));
        }
        setValue(outputs.querySelector('.vapp'),
            formatInt(interpolateAirspeed(vappLdgs, totalMass)) + ',' +
            formatInt(interpolateAirspeed(vappTos, totalMass)) + ',' +
            formatInt(interpolateAirspeed(vappUp, totalMass)));

        let va = 94;
        if (isMAM) {
            if (totalMass > 2284) {
                va = 111;
            }
        } else {
            if (totalMass > 2161) {
                va = 108;
            }
        }
        setValue(outputs.querySelector('.va'), formatInt(va));

        const wind = parseValue(env.querySelector('.headwind'));
        const vyGroundSpeed = vyGradientSpeed - wind;
        const climbGroundSpeed = climbGradientSpeed - wind;
        const obst = parsePositiveValue(env.querySelector('.obst'));
        if (takeoffCalc !== undefined) {
            setValue(outputs.querySelector('.takeoff'), formatInt(takeoffCalc(pressAlt, oat, totalMass, wind, obst)));
            setValue(outputs.querySelector('.landing'), formatInt(landingCalc(pressAlt, oat, totalMass, wind, obst)));
            const takeoffClimb = takeoffClimbCalc(pressAlt, oat, totalMass);
            const cruiseClimb = cruiseClimbCalc(pressAlt, oat, totalMass);
            setValue(outputs.querySelector('.takeoff-climb'), formatInt(takeoffClimb));
            setValue(outputs.querySelector('.takeoff-climb-gradient'), formatInt(feetPerNauticalMile(takeoffClimb, vyGroundSpeed)));
            setValue(outputs.querySelector('.cruise-climb'), formatInt(cruiseClimb));
            setValue(outputs.querySelector('.cruise-climb-gradient'), formatInt(feetPerNauticalMile(cruiseClimb, climbGroundSpeed)));
        }
    } else {
        for (let i = 0; i < speeds.length; i++) {
            clearValue(outputs.querySelector(speedClasses[i]));
        }
        clearValue(outputs.querySelector('.vapp'));
        clearValue(outputs.querySelector('.va'));
        clearValue(outputs.querySelector('.takeoff'));
        clearValue(outputs.querySelector('.landing'));
        clearValue(outputs.querySelector('.takeoff-climb'));
        clearValue(outputs.querySelector('.takeoff-climb-gradient'));
        clearValue(outputs.querySelector('.cruise-climb'));
        clearValue(outputs.querySelector('.cruise-climb-gradient'));
    }

    const isa = 15 - 1.98 * (pressAlt / 1000);
    const densityAlt = pressAlt + 118.8 * (oat - isa);
    setValue(env.querySelector('.density-alt'), formatInt(densityAlt));
}

const refreshTools = () => {
    const tools = document.getElementById('tools');

    const wcdir = parseDirection(tools.querySelector('.wc-dir'));
    const wcvel = parsePositiveValue(tools.querySelector('.wc-vel'));
    const wcrwy = parseRunway(tools.querySelector('.wc-rwy')) * 10;
    const wcd = deg2rad(wcrwy - wcdir);
    const xwind = Math.round(Math.sin(wcd) * wcvel);
    setValue(tools.querySelector('.wc-cross'),
        isNaN(xwind) ? '' :
            (xwind == 0 ? '0' :
                (xwind > 0 ? `${formatInt(xwind)} →` : `← ${formatInt(-xwind)}`)));
    setValue(tools.querySelector('.wc-head'), formatInt(Math.round(Math.cos(wcd) * wcvel)));

    const inbound = tools.querySelector('.h-in');
    const outbound = tools.querySelector('.h-out');
    if (inbound.classList.contains('active')) {
        outbound.textContent = formatDir((parseDirection(inbound) + 180) % 360);
    } else if (outbound.classList.contains('active')) {
        inbound.textContent = formatDir((parseDirection(outbound) + 180) % 360);
    }
    const hHdg = parseDirection(tools.querySelector('.h-hdg'));
    let holdingType = "";
    let ob = parseDirection(outbound);
    if (!isNaN(ob) && !isNaN(hHdg)) {
        if (tools.querySelector('.h-left').checked) {
            holdingType = withinDirRange(ob, hHdg + 110, hHdg - 70) ? "D" :
                (withinDirRange(ob, hHdg + 1, hHdg + 110) ? "P" : "T");
        } else {
            holdingType = withinDirRange(ob, hHdg + 70, hHdg - 110) ? "D" :
                (withinDirRange(ob, hHdg, hHdg + 70) ? "T" : "P");
        }
    }
    setValue(tools.querySelector('.h-type'), holdingType);

    const vr = parseValue(tools.querySelector('.vr'), 0);
    const mc = parseDirection(tools.querySelector('.tc')) + vr;
    let windir = parseDirection(tools.querySelector('.windir'));
    let winvel = parsePositiveValue(tools.querySelector('.winvel'));
    if (winvel == undefined) winvel = 0;
    if (windir == undefined) windir = 0;
    const tas = parsePositiveValue(tools.querySelector('.tas'));
    const windAngle = deg2rad(windir - mc);
    // Positive crosswind means correction to the right.
    const crosswind = Math.sin(windAngle) * winvel;
    // Positive headwind, negative tailwind.
    const headwind = Math.cos(windAngle) * winvel;
    const wcaRatio = crosswind / tas;
    if (Math.abs(wcaRatio) > 1 || isNaN(wcaRatio)) {
        // Wind too strong to maintain the selected course.
        clearValue(tools.querySelector('.hdg'));
        clearValue(tools.querySelector('.gs'));
    } else {
        // Exact wind correction angle.
        const wcaRad = Math.asin(wcaRatio);
        const wca = rad2deg(wcaRad);
        // Round only for heading display.
        const wcaDisplay = Math.round(wca);
        const e6bHdg = `${formatDir(mc + wcaDisplay)}M,${formatDir(mc + wcaDisplay - vr)}T`;
        if (!isNaN(mc) && !isNaN(wca) && !isNaN(vr)) {
            setValue(tools.querySelector('.hdg'), e6bHdg);
        }
        // Exact ground speed along the course.
        const gs = tas * Math.cos(wcaRad) - headwind;
        setValue(tools.querySelector('.gs'), formatInt(gs > 0 ? gs : NaN));
    }
    let slope = parsePositiveValue(tools.querySelector('.d-slope'));
    if (slope >= 90) {
        slope = NaN;
    }
    const slopeRad = deg2rad(slope);
    const dgs = parsePositiveValue(tools.querySelector('.d-gs'));
    const dh = parsePositiveValue(tools.querySelector('.d-alt'));
    setValue(tools.querySelector('.d-dist'), formatInt(Math.ceil(dh / (nauticalInFeet * Math.tan(slopeRad)))));
    setValue(tools.querySelector('.d-rate'), formatInt(Math.ceil(dgs * nauticalInFeet / 60 * Math.tan(slopeRad))));

    const ttas = parsePositiveValue(tools.querySelector('.t-tas'));
    setValue(tools.querySelector('.t-bank'), formatInt(Math.round(rad2deg(Math.atan(ttas / 364)))));

    const ccel = tools.querySelector('.c-cel');
    const cfah = tools.querySelector('.c-fah');
    if (ccel.classList.contains('active')) {
        cfah.textContent = formatFloat(parseValue(ccel) * 1.8 + 32);
    } else if (cfah.classList.contains('active')) {
        ccel.textContent = formatFloat((parseValue(cfah) - 32) * 5 / 9);
    }

    const cnm = tools.querySelector('.c-nm');
    const csm = tools.querySelector('.c-sm');
    if (cnm.classList.contains('active')) {
        csm.textContent = formatFloat(parseValue(cnm) * 1.15078);
    } else if (csm.classList.contains('active')) {
        cnm.textContent = formatFloat(parseValue(csm) * 0.868976);
    }

    const cft = tools.querySelector('.c-ft');
    const cm = tools.querySelector('.c-m');
    if (cft.classList.contains('active')) {
        cm.textContent = formatInt(parseValue(cft) * 0.3048);
    } else if (cm.classList.contains('active')) {
        cft.textContent = formatInt(parseValue(cm) / 0.3048);
    }

    const clb = tools.querySelector('.c-lb');
    const ckg = tools.querySelector('.c-kg');
    if (clb.classList.contains('active')) {
        ckg.textContent = formatInt(parseValue(clb) * 0.45359237);
    } else if (ckg.classList.contains('active')) {
        clb.textContent = formatInt(parseValue(ckg) / 0.45359237);
    }

    const fpmGs = parsePositiveValue(tools.querySelector('.fpm-gs'));
    const fpmRate = tools.querySelector('.fpm-rate');
    const fpmGradient = tools.querySelector('.fpm-gradient');
    if (fpmSource === 'rate') {
        setValue(fpmGradient, formatInt(feetPerNauticalMile(parseValue(fpmRate), fpmGs)));
    } else if (fpmSource === 'gradient') {
        const gradient = parseValue(fpmGradient);
        setValue(fpmRate,
            formatInt(Number.isFinite(gradient) && Number.isFinite(fpmGs) && fpmGs > 0 ?
                gradient * fpmGs / 60 : NaN));
    }
}

const regUpdatable = (updatable, func) => {
    for (let i = 0; i < updatable.length; i++) {
        updatable[i].addEventListener('input', () => func());
    }
}

const genLimitChars = (elem, n) => {
    return (e) => {
        if (e.which == 13 || (e.which != 8 && elem.innerText.length >= n)) {
            e.preventDefault();
        }
    }
}

const regCharLimit = (s, n) => {
    let limit = document.querySelectorAll(s);
    for (let i = 0; i < limit.length; i++) {
        let elem = limit[i];
        elem.addEventListener("keypress", genLimitChars(elem, n));
        elem.addEventListener("paste", (e) => {
            let pastedText;
            if (window.clipboardData && window.clipboardData.getData) { // IE
                pastedText = window.clipboardData.getData('Text');
            } else if (e.clipboardData && e.clipboardData.getData) {
                pastedText = e.clipboardData.getData('text/plain');
            }
            if (typeof pastedText !== 'string') {
                return;
            }
            e.preventDefault();
            elem.textContent = pastedText.slice(0, n);
            elem.dispatchEvent(new Event('input', { bubbles: true }));
        });
    }
}
const jurl = JsonUrl('lzma');
const getUserData = () => {
    const getText = (dom, classes, res) => {
        for (let i = 0; i < classes.length; i++) {
            const c = classes[i];
            res[c] = dom.querySelector('.' + c).innerText;
        }
    }
    let res = {};
    const weights = document.getElementById('weights');
    const env = document.getElementById('env');
    getText(weights, [
        'empty-mass',
        'empty-moment',
        'front-left-mass',
        'front-right-mass',
        'rear-left-mass',
        'rear-right-mass',
        'baggage-std-mass',
        'baggage-tube-mass',
        'baggage-ext-forward-mass',
        'baggage-ext-aft-mass',
        'fuel-vol'
    ], res);
    getText(env, [
        'oat',
        'qnh',
        'press-alt',
        'field-alt',
        'headwind',
        'obst',
    ], res);
    const isMAM = weights.querySelector('input[name="mam-40-227"]').checked;
    const isLongRange = weights.querySelector('input[name="longrange-tank"]').checked;
    res['mam-40-227'] = isMAM;
    res['longrange-tank'] = isLongRange;
    return jurl.compress(res);
}

const setText = (dom, classes, res) => {
    for (let i = 0; i < classes.length; i++) {
        const c = classes[i];
        if (res[c] !== undefined) {
            dom.querySelector('.' + c).innerText = res[c];
        }
    }
}

const setUserData = (data) => {
    jurl.decompress(data).then(json => {
        document.cookie = `da40-state=${encodeURIComponent(data)}; Max-Age=31536000; Path=/; Secure; SameSite=Lax`;
        const weights = document.getElementById('weights');
        const env = document.getElementById('env');
        setText(weights, [
            'empty-mass',
            'empty-moment',
            'front-left-mass',
            'front-right-mass',
            'rear-left-mass',
            'rear-right-mass',
            'baggage-std-mass',
            'baggage-tube-mass',
            'baggage-ext-forward-mass',
            'baggage-ext-aft-mass',
            'fuel-vol'
        ], json);
        setText(env, [
            'oat',
            'qnh',
            'press-alt',
            'field-alt',
            'headwind',
            'obst',
        ], json);
        weights.querySelector('input[name="mam-40-227"]').checked = json['mam-40-227'];
        weights.querySelector('input[name="longrange-tank"]').checked = json['longrange-tank'];
        refresh();
        refreshTools();
    }).catch(_ => {
        refresh();
        refreshTools();
    });
}
const saveChanges = () => getUserData().then(u => {
    document.cookie = `da40-state=${encodeURIComponent(u)}; Max-Age=31536000; Path=/; Secure; SameSite=Lax`;
    const url = new URL(window.location.href);
    url.search = '';
    url.searchParams.set('s', u);
    url.hash = '';
    window.history.replaceState(null, '', url.href);
    const savedUrl = window.location.href;
    navigator.clipboard.writeText(savedUrl);
    document.getElementById('url').innerHTML = `Saved and copied to clipboard: <textarea>${savedUrl}</textarea>`;
});

const recover = () => {
    const query = new URLSearchParams(window.location.search).get('s');
    const cookie = document.cookie.match(/(?:^|;\s*)da40-state=([^;]*)/);
    setUserData(query || (cookie ? decodeURIComponent(cookie[1]) : ''));
};

const regTandemInput = (container, a, b) => {
    const ea = container.querySelector(a);
    const eb = container.querySelector(b);
    ea.addEventListener('focus', () => {
        ea.classList.toggle('active');
        if (eb.classList.contains('active')) {
            eb.innerText = '';
            eb.classList.toggle('active');
        }
    });
    ea.addEventListener('blur', () => {
        ea.classList.toggle('active');
    });
    eb.addEventListener('focus', () => {
        eb.classList.toggle('active');
        if (ea.classList.contains('active')) {
            ea.innerText = '';
            ea.classList.toggle('active');
        }
    });
    eb.addEventListener('blur', () => {
        eb.classList.toggle('active');
    });
}

const tools = document.getElementById('tools');
const env = document.getElementById('env');

const initHoldingDiagram = () => {
    console.log("hey");
    const holdingDiagram = tools.querySelector('.h-diagram');
    const strokeWidth = '2px';
    const ob = 45;
    const polarX = (r, deg) => Math.sin(deg2rad(deg)) * r + 100;
    const polarY = (r, deg) => 100 - Math.cos(deg2rad(deg)) * r;
    const polardX = (r, deg) => Math.sin(deg2rad(deg)) * r;
    const polardY = (r, deg) => Math.cos(deg2rad(deg)) * r;
    const ibPath = document.createElementNS(holdingDiagram.namespaceURI, "path");
    const obPath = document.createElementNS(holdingDiagram.namespaceURI, "path");
    const left = true;
    holdingDiagram.appendChild(ibPath);
    holdingDiagram.appendChild(obPath);

    const ibx0 = polarX(0, ob);
    const iby0 = polarY(0, ob);
    const ibx1 = polarX(60, ob);
    const iby1 = polarY(60, ob);

    const obx0 = ibx0 + polardX(50, ob + 90);
    const oby0 = iby0 - polardY(50, ob + 90);
    const obx1 = ibx1 + polardX(50, ob + 90);
    const oby1 = iby1 - polardY(50, ob + 90);

    ibPath.classList = "inbound";
    ibPath.setAttribute("d", `M ${ibx0},${iby0} L ${ibx1},${iby1}`);
    ibPath.setAttribute("stroke", "red");
    ibPath.setAttribute("stroke-width", strokeWidth);
    ibPath.setAttribute("opacity", 1);
    ibPath.setAttribute("fill", "none");

    obPath.classList = "outbound";
    obPath.setAttribute("d", `M ${obx0},${oby0} L ${obx1},${oby1}`);
    obPath.setAttribute("stroke", "red");
    obPath.setAttribute("stroke-width", strokeWidth);
    obPath.setAttribute("opacity", 1);
    obPath.setAttribute("fill", "none");

};

window.addEventListener('load', () => {
    takeoffCalc = createChartCalculator(takeoffChart);
    landingCalc = createChartCalculator(landingChart);
    takeoffClimbCalc = createChartCalculator(takeoffClimbChart);
    cruiseClimbCalc = createChartCalculator(cruiseClimbChart);
    recover();
    initHoldingDiagram();
});
const editable = document.querySelectorAll('table.main td div');
for (let i = 0; i < editable.length; i++) {
    const e = editable[i];
    e.setAttribute('contenteditable', 'true');
    const disabler = (event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'none';
    };
    e.addEventListener('dragenter', disabler);
    e.addEventListener('dragover', disabler);
}

regTandemInput(tools, '.h-in', '.h-out');
regTandemInput(tools, '.c-cel', '.c-fah');
regTandemInput(tools, '.c-nm', '.c-sm');
regTandemInput(tools, '.c-ft', '.c-m');
regTandemInput(tools, '.c-lb', '.c-kg');
regTandemInput(tools, '.fpm-rate', '.fpm-gradient');
tools.querySelector('.fpm-rate').addEventListener('input', () => fpmSource = 'rate');
tools.querySelector('.fpm-gradient').addEventListener('input', () => fpmSource = 'gradient');
regTandemInput(env, '.qnh', '.press-alt');

regUpdatable(document.querySelectorAll('#weights td .update'), refresh);
regUpdatable(document.querySelectorAll('#env td .update'), refresh);
regUpdatable(document.querySelectorAll('#tools td .update'), refreshTools);

regCharLimit('table.main .max2', 2);
regCharLimit('table.main .max3', 3);
regCharLimit('table.main .max4', 4);
regCharLimit('table.main .max6', 6);
regCharLimit('table.main .max8', 8);
