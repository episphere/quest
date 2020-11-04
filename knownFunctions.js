import { getSelected } from "./questionnaire.js";

export const knownFunctions = {
  and: function (x, y) {
    return x && y;
  },
  or: function (x, y) {
    return x || y;
  },
  isDefined: function (x, y) {
    let tmpVal = !x ? y : x;
    let isnum = /^[\d\.]+$/.test(tmpVal);
    if (isnum) {
      return tmpVal;
    }
    let tmpVal2 = document.getElementById(tmpVal);
    return tmpVal2 ? tmpVal2.value : tmpVal;
  },
  min: function (x, y) {
    if (!x && !y) {
      return "";
    }
    x = !isNaN(x) ? x : Number.POSITIVE_INFINITY;
    y = !isNaN(y) ? y : Number.POSITIVE_INFINITY;
    return Math.min(parseFloat(x), parseFloat(y));
  },
  max: function (x, y) {
    if (!x && !y) {
      return "";
    }
    x = !isNaN(x) ? x : Number.NEGATIVE_INFINITY;
    y = !isNaN(y) ? y : Number.NEGATIVE_INFINITY;
    return Math.max(parseFloat(x), parseFloat(y));
  },
  equals: function (x, y) {
    if (x == undefined && y == "undefined") {
      return true;
    }
    if (x==='' && (y==='\'\''||y==='\"\"')){ //handle empty string comparison
        return true;
    }
    return Array.isArray(x) ? x.includes(y) : x == y;
  },
  doesNotEqual: function (x, y) {
    if (x == undefined && y == "undefined") {
      return false;
    }
    if (x==='' &&  (y==='\'\''||y==='\"\"')){ //handle empty string comparison
      return false;
  }
    return Array.isArray(x) ? !x.includes(y) : x != y;
  },
  lessThan: function (x, y) {
    return parseFloat(x) < parseFloat(y);
  },
  lessThanOrEqual: function (x, y) {
    return parseFloat(x) <= parseFloat(y);
  },
  greaterThan: function (x, y) {
    return parseFloat(x) > parseFloat(y);
  },
  greaterThanOrEqual: function (x, y) {
    return parseFloat(x) >= parseFloat(y);
  },
  setFalse: function (x, y) {
    return false;
  },
  difference: function (x, y) {
    if (typeof y == "string" && document.getElementById(y)) {
      y = document.getElementById(y).value;
    }
    return x - y;
  },
  percentDiff: function (x, y) {
    if (x == "" || y == "") {
      return false;
    }
    if (typeof y == "string" && document.getElementById(y)) {
      y = document.getElementById(y).value;
    }
    return knownFunctions.difference(x, y) / x;
  },
  numberOfChoicesSelected: function (x) {
    return x == undefined ? 0 : x.length;
  },
};
