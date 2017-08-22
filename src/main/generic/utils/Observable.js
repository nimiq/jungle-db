/**
 * A class, which inherits from Observable, can notify interested parties
 * on occurrence of specified events.
 */
class Observable {
    /**
     * A special event matching every other event.
     * @type {string}
     * @constant
     */
    static get WILDCARD() {
        return '*';
    }

    constructor() {
        /** @type {Map.<string, Array.<Function>>} */
        this._listeners = new Map();
    }

    /**
     * Registers a handler for a given event.
     * @param {string} type The event to observe.
     * @param {Function} callback The handler to be called on occurrence of the event.
     * @return {number} The handle for this handler. Can be used to unregister it again.
     */
    on(type, callback) {
        if (!this._listeners.has(type)) {
            this._listeners.set(type, [callback]);
            return 0;
        } else {
            return this._listeners.get(type).push(callback) - 1;
        }
    }

    /**
     * Unregisters a handler for a given event.
     * @param {string} type The event to unregister from.
     * @param {number} id The handle received upon calling the on function.
     */
    off(type, id) {
        if (!this._listeners.has(type) || !this._listeners.get(type)[id]) return;
        delete this._listeners.get(type)[id];
    }

    /**
     * Fires an event and notifies all observers.
     * @param {string} type The type of event.
     * @param {...*} args Arguments to pass to the observers.
     */
    fire(type, ...args) {
        // Notify listeners for this event type.
        if (this._listeners.has(type)) {
            for (const i in this._listeners.get(type)) {
                const listener = this._listeners.get(type)[i];
                listener.apply(null, args);
            }
        }

        // Notify wildcard listeners. Pass event type as first argument
        if (this._listeners.has(Observable.WILDCARD)) {
            for (const i in this._listeners.get(Observable.WILDCARD)) {
                const listener = this._listeners.get(Observable.WILDCARD)[i];
                listener.apply(null, arguments);
            }
        }
    }

    /**
     * Registers handlers on another observable, bubbling its events up to the own observers.
     * @param {Observable} observable The observable, whose events should bubble up.
     * @param {...string} types The events to bubble up.
     */
    bubble(observable, ...types) {
        for (const type of types) {
            let callback;
            if (type == Observable.WILDCARD) {
                callback = function() {
                    this.fire.apply(this, arguments);
                };
            } else {
                callback = function() {
                    this.fire.apply(this, [type, ...arguments]);
                };
            }
            observable.on(type, callback.bind(this));
        }
    }
}
Class.register(Observable);
