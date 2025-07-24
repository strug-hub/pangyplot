const eventBus = {
  events: {},
  subscribe(event, callback) {
    if (!this.events[event]) this.events[event] = [];
    this.events[event].push(callback);
  },
  publish(event, data) {
    (this.events[event] || []).forEach(cb => cb(data));
  }
};

export default eventBus;
