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
