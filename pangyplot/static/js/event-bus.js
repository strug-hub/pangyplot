const eventBus = {
  events: {},
  subscribe(event, callback) {
    if (!this.events[event]) this.events[event] = [];
    this.events[event].push(callback);
    return () => {
      const arr = this.events[event];
      if (!arr) return;
      const idx = arr.indexOf(callback);
      if (idx !== -1) arr.splice(idx, 1);
    };
  },
  publish(event, data) {
    (this.events[event] || []).forEach(cb => cb(data));
  }
};

export default eventBus;
