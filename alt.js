var g = 9.80665;
var R = 101325 / (1.225 * 288.15);
var Bb = [-0.0065, 0, 0.001, 0.0028, 0, -0.0028, -0.002];
var Tb = [288.15, 216.65, 216.65, 228.65, 270.65, 270.65, 214.65];
var Hb = [0, 11000, 20000, 32000, 47000, 51000, 71000];

var Pb = [];
Pb[0] = 101325;
for (var i = 1; i < Hb.length; ++i) {
    Pb[i] = calcPressure(i - 1, Hb[i]);
}

var HFloor = -5000;
var HCeiling = 80000;
var PFloor = calcPressure(0, HFloor);
var PCeiling = parseFloat(calcPressure(6, HCeiling).toPrecision(9));

function assignLayerIndex_Pb(P) {
    if (P <= PFloor && P > Pb[1]) {
        var b = 0;
    } else if (P <= Pb[1] && P > Pb[2]) {
        var b = 1;
    } else if (P <= Pb[2] && P > Pb[3]) {
        var b = 2;
    } else if (P <= Pb[3] && P > Pb[4]) {
        var b = 3;
    } else if (P <= Pb[4] && P > Pb[5]) {
        var b = 4;
    } else if (P <= Pb[5] && P > Pb[6]) {
        var b = 5;
    } else if (P <= Pb[6] && P >= PCeiling) {
        var b = 6;
    }
    return b;
}

function assignLayerIndex_Hb(H) {
    if (H >= HFloor && H < Hb[1]) {
        var b = 0;
    } else if (H >= Hb[1] && H < Hb[2]) {
        var b = 1;
    } else if (H >= Hb[2] && H < Hb[3]) {
        var b = 2;
    } else if (H >= Hb[3] && H < Hb[4]) {
        var b = 3;
    } else if (H >= Hb[4] && H < Hb[5]) {
        var b = 4;
    } else if (H >= Hb[5] && H < Hb[6]) {
        var b = 5;
    } else if (H >= Hb[6] && H <= HCeiling) {
        var b = 6;
    }
    return b;
}

function calcAltitude(b, P) {
    if (Bb[b] != 0) {
        return (((Math.pow(P / Pb[b], -Bb[b] * R / g) - 1) / Bb[b]) * Tb[b]) + Hb[b];
    } else {
        return (Math.log(P / Pb[b]) * R * Tb[b] / -g) + Hb[b];
    }
}

function calcPressure(b, H) {
    if (Bb[b] != 0) {
        return Pb[b] * Math.pow(1 + (Bb[b] * (H - Hb[b]) / Tb[b]), -g / (Bb[b] * R));
    } else {
        return Pb[b] * Math.exp(-g * (H - Hb[b]) / (R * Tb[b]));
    }
}

function calc_H(P) {
    var b = assignLayerIndex_Pb(P);
    return calcAltitude(b, P);
}

function calc_P(H) {
    var b = assignLayerIndex_Hb(H);
    return calcPressure(b, H);
}

function calc_dP(H1, H2) {
    var b1 = assignLayerIndex_Hb(H1);
    var P1 = calcPressure(b1, H1);
    var b2 = assignLayerIndex_Hb(H2);
    var P2 = calcPressure(b2, H2);
    return P2 - P1;
}

function calc_dH(P1, P2) {
    var b1 = assignLayerIndex_Pb(P1);
    var H1 = calcAltitude(b1, P1);
    var b2 = assignLayerIndex_Pb(P2);
    var H2 = calcAltitude(b2, P2);
    return H2 - H1;
}

function to_feet(m) {
    return m * 3.28084;
}

function from_inhg(i) {
    return i * 3386.388640341;
}

function toInHg(i) {
    return i / 3386.388640341;
}

function getQNH(H, P) {
    return toInHg(Pb[0] + calc_dP(calc_H(P), H));
}

console.log(parseInt(Math.round(to_feet(calc_dH(from_inhg(30.01), from_inhg(10))))));
console.log(parseInt(Math.round(to_feet(calc_H(from_inhg(29.62))))));
