export const knownFunctions = {
  and: function (x, y) {
    return x && y;
  },
  or: function (x, y) {
    return x || y;
  },
  equals: function (x, y) {
    return Array.isArray(x) ? x.includes(y) : x == y;
  },
  doesNotEqual: function (x, y) {
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
    if (typeof y == "string" && document.getElementById(y)) {
      y = document.getElementById(y).value;
    }
    return knownFunctions.difference(x, y) / x;
  },
};
