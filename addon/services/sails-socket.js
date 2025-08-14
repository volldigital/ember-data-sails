/* global io */
import { debug, warn } from '@ember/debug';
import { action, set, setProperties } from '@ember/object';
import {
  addListener,
  hasListeners,
  removeListener,
  sendEvent,
} from '@ember/object/events';
import { bind, later, next } from '@ember/runloop';
import Service from '@ember/service';
import { tracked } from '@glimmer/tracking';

/**
 * Shortcut to know if an object is alive or not
 *
 * @since 0.0.4
 * @param {Ember.Object} obj The object to test
 * @returns {Boolean} Returns `true` if the object is still alive, else `false`
 * @private
 */
function isAlive(obj) {
  return !(!obj || obj.isDestroying || obj.isDestroyed);
}

/**
 * Layer on top of io.socket from Sails to play well with Ember
 *
 * @since 0.0.4
 * @class SailsSocketService
 * @extends Service
 * @uses WithLoggerMixin
 * @constructor
 */
export default class SailsSocketService extends Service {
  /**
   * Holds our sails socket
   * @since 0.0.4
   * @property _sailsSocket
   * @type SailsSocket
   * @private
   */
  _sailsSocket = null;

  /**
   * Holds the events we are listening on the socket for later re-binding
   * @since 0.0.4
   * @property _listeners
   * @type Object<Object>
   * @private
   */
  _listeners = null;

  /**
   * The URL to the sails socket
   * @since 0.0.13
   * @property socketUrl
   * @type String
   */
  get socketUrl() {
    const script = document.getElementById('eds-sails-io-script');
    return script.src.replace(/^([^:]+:\/\/[^/]+).*$/g, '$1');
  }

  /**
   * Whether the socket core object is initialized or not
   * @since 0.0.4
   * @property isInitialized
   * @type Boolean
   */
  @tracked isInitialized = null;

  /**
   * Whether the socket is connected or not
   * @since 0.0.4
   * @property isConnected
   * @type Boolean
   */
  isConnected = null;

  /**
   * The number of currently pending operations
   * @since 0.0.4
   * @property pendingOperationCount
   * @type Number
   */
  @tracked pendingOperationCount = null;

  /**
   * Whether the service is busy or not
   * @since 0.0.4
   * @property isBusy
   * @type Boolean
   */
  get isBusy() {
    return !this.isInitialized || this.pendingOperationCount > 0;
  }

  /**
   * @since 0.0.1
   * @method constructor
   * @inheritDoc
   */
  constructor() {
    super(...arguments);

    this._listeners = {};
    this._sailsSocket = null;
    setProperties(this, {
      pendingOperationCount: 0,
      isInitialized: false,
      isConnected: false,
    });
  }

  /**
   * @since 0.0.4
   * @method destroy
   * @inheritDoc
   */
  @action
  willDestroy() {
    if (this.isConnected) {
      this._sailsSocket.disconnect();
    }
    super.willDestroy();
  }

  /**
   * Enable/disable listening for a given socket event
   *
   * @since 0.0.4
   * @method listenFor
   * @param {String} event The event to start/stop listening for
   * @param {Boolean} [listen=true] If `true`, it'll listen for these events, else it'll stop listening
   * @return {Boolean} Returns `true` if the some change has been triggered or scheduled, else `false`
   */
  @action
  listenFor(event, listen) {
    listen = listen == null ? true : !!listen;
    let meta = {};
    let sockMethod;
    if (listen && !this._listeners[event]) {
      meta = {
        method: bind(this, '_handleSocketMessage', event),
        isListening: false,
      };
      this._listeners[event] = meta;
      sockMethod = 'add';
    } else if (!listen && (meta = this._listeners[event])) {
      sockMethod = 'remove';
    }
    if (sockMethod) {
      if (this.isConnected) {
        if (listen) {
          meta.isListening = true;
        } else {
          delete this._listeners[event];
        }
        this._sailsSocket._raw[sockMethod + 'EventListener'](
          event,
          meta.method,
        );
      } else if (!listen) {
        delete this._listeners[event];
      }
    }
    return !!sockMethod;
  }

  /**
   * Call a method on the socket object with the given parameters once the socket is ready and
   * connected. Returns a promise which will resolve to the result of the method call, assuming the
   * method is accepting as last parameter (which would not be given) a function to call once the
   * process is done (as a NodeJS callback).
   *
   * @since 0.0.11
   * @method request
   * @param {String} method The name of the method to call
   * @param {mixed} [arg]* Any argument to give to the method
   * @returns {Promise}
   */
  @action
  request(method /*, arg*/) {
    const args = [].slice.call(arguments, 1);
    const incPending = bind(this, 'incrementProperty', 'pendingOperationCount');
    method = method.toLowerCase();
    incPending(1);
    // getting the connected Sails socket for ${method} request on ${args[0]}
    return new Promise((resolve, reject) => {
      this._connectedSocket((error, socket) => {
        if (isAlive(this) && !error) {
          args.push((data, jwr) => {
            incPending(-1);
            if (!jwr || Math.round(jwr.statusCode / 100) !== 2) {
              reject(jwr || data);
            } else {
              resolve(data);
            }
          });
          socket[method].apply(socket, args);
        } else {
          incPending(-1);
          reject(error ? error : new Error('Sails socket service destroyed'));
        }
      });
    });
  }

  /**
   * @since 0.0.4
   * @method trigger
   * @inheritDoc
   */
  @action
  trigger(event, ...args) {
    debug(`triggering event ${event}`);
    return sendEvent(this, event, args);
  }

  @action
  on(name, target, method) {
    addListener(this, name, target, method);
    return this;
  }

  @action
  one(name, target, method) {
    addListener(this, name, target, method, true);
    return this;
  }

  @action
  off(name, target, method) {
    removeListener(this, name, target, method);
    return this;
  }

  @action
  has(name) {
    return hasListeners(this, name);
  }

  /**
   * Get the socket ready and connected and then pass it as parameter of the given callback
   *
   * @since 0.0.4
   * @method _connectedSocket
   * @param {Function} callback The method to call with the socket or the error
   * @private
   */
  @action
  _connectedSocket(callback) {
    if (!isAlive(this)) {
      warn('cannot get socket, service destroyed', false, {
        id: 'ember-data-sails.socket',
      });
      next(this, callback, new Error('Sails socket service destroyed'));
    } else if (this.isConnected) {
      debug('socket connected, giving it in next run loop');
      next(this, callback, null, this._sailsSocket);
    } else {
      debug(
        'socket not connected, listening for connect event before giving it',
      );
      if (!this._waitingForSockets) {
        this._waitingForSockets = [];
      }
      this._waitingForSockets.push(callback);
      if (this._waitingForSockets.length > 1) {
        return;
      }
      this.one(
        'didConnect',
        bind(this, function () {
          const callbacks = this._waitingForSockets;
          delete this._waitingForSockets;
          for (let i = 0; i < callbacks.length; i++) {
            callbacks[i].call(this, null, this._sailsSocket);
          }
        }),
      );
      if (this.isInitialized) {
        debug(
          'looks like we are initialized but not connected, reconnecting socket',
        );
        this._reconnect();
      } else {
        this._load();
      }
    }
  }

  /**
   * Force the reconnection of the socket
   * The way how the `io.socket` is checked for readiness is a hack, since listening to `connect`
   * event was doing a lot of garbage listeners for each subsequent call to `on`. Maybe a bug in
   * `sails` socket code...
   * @since 0.0.4
   * @method _reconnect
   */
  @action
  _reconnect() {
    if (
      this._sailsSocket._raw &&
      !this._sailsSocket._raw.connected &&
      !this._sailsSocket._raw.connecting
    ) {
      this._sailsSocket.reconnect();

      // Need to re-do this since this._sailsSocket._raw is replaced during reconnect,
      // and these events will never fire unless they are (hackishly) re-bound
      const waitObject = bind(this, function () {
        if (this._sailsSocket._raw) {
          this._sailsSocket._raw.addEventListener(
            'connect',
            bind(this, '_handleSocketConnect'),
          );
          this._sailsSocket._raw.addEventListener(
            'disconnect',
            bind(this, '_handleSocketDisconnect'),
          );
          if (this._sailsSocket._raw.connected) {
            next(this, '_handleSocketConnect');
          }
        } else {
          later(waitObject, 10);
        }
      });
      waitObject();
    }
  }

  /**
   * Bind event listeners that have been waiting to be attached
   *
   * @since 0.0.11
   * @method _bindListeners
   * @chainable
   * @private
   */
  @action
  _bindListeners() {
    for (let event in this._listeners) {
      const meta = this._listeners[event];
      if (!meta.isListening) {
        this._sailsSocket._raw.addEventListener(event, meta.method);
        meta.isListening = true;
        debug(`attached event ${event} on socket`);
      }
    }
    return this;
  }

  /**
   * Unbind all listeners (does not remove them from the known listeners)
   *
   * @since 0.0.11
   * @method _unbindListeners
   * @chainable
   * @private
   */
  @action
  _unbindListeners() {
    for (let event in this._listeners) {
      const meta = this._listeners[event];
      if (meta.isListening) {
        this._sailsSocket._raw.removeEventListener(event, meta.method);
        meta.isListening = false;
        debug(`detached event ${event} from socket`);
      }
    }
    return this;
  }

  /**
   * Handles a message received by the socket and dispatch our own event
   *
   * @since 0.0.4
   * @method _handleSocketMessage
   * @param {String} event The event name
   * @param {Object} message The message received
   * @private
   */
  @action
  _handleSocketMessage(event, message) {
    if (!isAlive(this)) {
      return;
    }
    this.trigger(
      event + (message && message.verb ? '.' + message.verb : ''),
      message,
    );
  }

  /**
   * Handles the readiness of the socket, initializing listeners etc. once the `io.socket` is ready
   * The way how the `io.socket` is checked for readiness is a hack, since listening to `connect`
   * event was doing a lot of garbage listeners for each subsequent call to `on`. Maybe a bug in
   * `sails` socket code...
   *
   * @since 0.0.4
   * @method _handleSocketReady
   * @private
   */
  @action
  _handleSocketReady() {
    if (!isAlive(this)) {
      return;
    }
    debug('socket core object ready');
    set(this, 'isInitialized', true);
    this.trigger('didInitialize');
    this._sailsSocket = io.sails.connect(this.socketUrl);
    const waitObject = bind(this, function () {
      if (this._sailsSocket._raw) {
        this._sailsSocket._raw.addEventListener(
          'connect',
          bind(this, '_handleSocketConnect'),
        );
        this._sailsSocket._raw.addEventListener(
          'disconnect',
          bind(this, '_handleSocketDisconnect'),
        );
        if (this._sailsSocket._raw.connected) {
          next(this, '_handleSocketConnect');
        }
      } else {
        later(waitObject, 10);
      }
    });
    waitObject();
  }

  /**
   * Handles the connected event of the socket
   *
   * @since 0.0.4
   * @method _handleSocketConnect
   * @private
   */
  @action
  _handleSocketConnect() {
    if (!isAlive(this)) {
      return;
    }
    this._bindListeners();
    set(this, 'isConnected', true);
    this.trigger('didConnect');
  }

  /**
   * Handles the disconnected event of the socket
   *
   * @since 0.0.4
   * @method _handleSocketDisconnect
   * @private
   */
  @action
  _handleSocketDisconnect() {
    if (!isAlive(this)) {
      return;
    }
    set(this, 'isConnected', false);
    this.trigger('didDisconnect');
    this._unbindListeners();
  }

  /**
   * Loads the sails.io.js script and wait for the connection and io object to be ready
   *
   * @since 0.0.13
   * @method _load
   * @private
   */
  @action
  _load() {
    if (!this._loaded) {
      if (window.io && io.sails && io.sails.emberDataSailsReady) {
        next(this, '_handleSocketReady');
      } else {
        later(this, '_load', 10);
      }
    }
  }
}
