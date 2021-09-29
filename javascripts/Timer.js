class Timer {
  constructor(callback, ticksToThrottle) {
    this.callback = callback;
    this.ticksToThrottle = ticksToThrottle;
    this.throttledTicks = 0;
    this.paused = false;
    this.run();
  }

  stop() {
    this.paused = true;
  }

  run() {
    if (this.ticksToThrottle == 0 || this.throttledTicks == this.ticksToThrottle) {
      this.callback();
      this.throttledTicks = 0;
    } else {
      this.throttledTicks += 1;
    }

    var captureThis = this;
    if (!this.paused) {
      window.requestAnimationFrame(function(e) {
        captureThis.run();
      });
    }
  }
}
