Object.defineProperty(String.prototype, "camelize", {
    value: function camelize() {
        return this.replace(/(?:^\w|[A-Z]|\b\w|\s+)/g, function(match, index) {
            if (+match === 0) return ""; // or if (/\s+/.test(match)) for white spaces
        return index === 0 ? match.toLowerCase() : match.toUpperCase();
      });
    },
    writable: true,
    configurable: true
});

Object.defineProperty(String.prototype, "hexToRgb", {
    value: function hexToRgb() {
        var bigint = parseInt(this.replace(/[^0-9A-F]/gi, ''), 16);
        var r = (bigint >> 16) & 255;
        var g = (bigint >> 8) & 255;
        var b = bigint & 255;

        return [r / 256, g / 256, b / 256, 1.0];
    },
    writable: true,
    configurable: true
});

Object.defineProperty(String.prototype, "base64ToArray", {
    value: function base64ToArray() {
      var binary_string = window.atob(this);
      var len = binary_string.length;
      var bytes = new Uint8Array(len);
      for (var i = 0; i < len; i++) {
          bytes[i] = binary_string.charCodeAt(i);
      }
      return bytes;
    },
    writable: true,
    configurable: true
});

Object.defineProperty(Uint8Array.prototype, "toBase64String", {
    value: function toBase64String() {
      var binary = '';
      var len = this.byteLength;
      for (var i = 0; i < len; i++) {
          binary += String.fromCharCode(this[i]);
      }
      return window.btoa(binary);
    },
    writable: true,
    configurable: true
});

Object.defineProperty(Array.prototype, "equals", {
  value: function equals(array) {
    if (!array)
        return false;

    // compare lengths - can save a lot of time
    if (this.length != array.length)
        return false;

    for (var i = 0, l=this.length; i < l; i++) {
        // Check if we have nested arrays
        if (this[i] instanceof Array && array[i] instanceof Array) {
            // recurse into the nested arrays
            if (!this[i].equals(array[i]))
                return false;
        }
        else if (this[i] != array[i]) {
            // Warning - two different object instances will never be equal: {x:20} != {x:20}
            return false;
        }
    }
    return true;
  },
  enumerable: false
});
