export const knownFunctions = {

  and: function (x, y) {
    return x && y;
  },

  or: function (x, y) {
    return x || y;
  },

  isDefined: function (x, y, appState) {
    const tmpVal = !x ? y : x;
    if (!isNaN(tmpVal)) {
      return tmpVal;
    }

    return appState.findResponseValue(tmpVal) ?? y;
  },

  isNotDefined: function (x) {
    return !x;
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
    y = y.replace(/\"/g, ""); //handle string comparison
    if (y === 'true') {    //handles truthy comparison
      y = true;
    }
    if (y === 'false') {
      y = false;
    }
    if (y === '_TODAY_') {
      var date = new Date();
      var dateString = new Date(date.getTime() - (date.getTimezoneOffset() * 60000))
        .toISOString()
        .split("T")[0];
      y = dateString;
    }
    return Array.isArray(x) ? x.includes(y) : x == y;
  },

  doesNotEqual: function (x, y) {
    if (x == undefined && y == "undefined") {
      return false;
    }
    y = y.replace(/\"/g, ""); //handle string comparison
    if (y === 'true') {    //handles truthy comparison
      y = true;
    }
    if (y === 'false') {
      y = false;
    }
    if (y === '_TODAY_') {
      var date = new Date();
      var dateString = new Date(date.getTime() - (date.getTimezoneOffset() * 60000))
        .toISOString()
        .split("T")[0];
      y = dateString;
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
    return parseInt(x) - parseInt(y);
  },

  sum: function (x, y) {
    return parseInt(x) + parseInt(y);
  },

  percentDiff: function (x, y) {
    if (!x || typeof x !== 'string' || !y || typeof y !== 'string') return NaN;
    return this.difference(x, y) / x;
  },

  numberOfChoicesSelected: function (x) {
    return x == undefined ? 0 : x.length;
  },
};
