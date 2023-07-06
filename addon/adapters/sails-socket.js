import { debug, warn } from '@ember/debug';
import { bind, debounce } from '@ember/runloop';
import { inject as service } from '@ember/service';
import { camelize } from '@ember/string';
import { pluralize } from 'ember-inflector';
import SailsBaseAdapter from './sails-base';

/**
 * Adapter for SailsJS sockets
 *
 * @since 0.0.1
 * @class SailsSocketAdapter
 * @extends SailsBaseAdapter
 * @constructor
 */
export default class App extends SailsBaseAdapter {
  @service store;
  @service sailsSocket;
  /**
   * Holds the scheduled subscriptions
   * @since 0.0.11
   * @property _scheduledSubscriptions
   * @type Object
   */
  _scheduledSubscriptions = null;
  /**
   * The method used when sending a request over the socket to update/setup subscriptions
   * Set this or subscribeEndpoint to `null` will disable this feature
   * @since 0.0.11
   * @property subscribeMethod
   * @type String
   */
  subscribeMethod = 'POST';
  /**
   * The path to send a request over the socket to update/setup subscriptions
   * Set this or subscribeMethod to `null` will disable this feature
   * @since 0.0.11
   * @property subscribeEndpoint
   * @type String
   */
  subscribeEndpoint = '/socket/subscribe';

  /**
   * @since 1.0.0
   * @method constructor
   * @inheritDoc
   */
  constructor() {
    super(...arguments);
    this.sailsSocket.on('didConnect', this, 'fetchCSRFToken', true);
  }

  /**
   * Sends a request over the socket
   *
   * @since 0.0.11
   * @method _request
   * @param {Object} out
   * @param {String} url
   * @param {String} method
   * @param {Object} options
   * @returns {Ember.RSVP.Promise}
   * @private
   */
  _request(out, url, method, options) {
    out.protocol = 'socket';
    return this.sailsSocket.request(method, url, options.data);
  }

  /**
   * @since 0.0.11
   * @method buildURL
   * @inheritDoc
   */
  buildURL(type, id, record) {
    return super.buildURL(type, id, record);
  }

  /**
   * Whether we should subscribe to a given model or not
   * By default it subscribe to any model, tho it's better to optimize by setting up a filter here
   * so that it does not ask the server for subscription on unneeded stuff
   *
   * @since 0.0.11
   * @method shouldSubscribe
   * @param {subclass of Model} type The type of the record
   * @param {Object} recordJson The json of the record (DO NOT ALTER IT!)
   * @returns {Boolean} If `false` then the record isn't subscribed for, else it is
   */
  shouldSubscribe(/*type, recordJson*/) {
    return true;
  }

  /**
   * Fetches the CSRF token
   *
   * @since 0.0.4
   * @method _fetchCSRFToken
   * @return {Ember.RSVP.Promise} Returns the promise resolving the CSRF token
   * @private
   */
  _fetchCSRFToken() {
    return this.sailsSocket
      .request('get', this.csrfTokenPath.replace(/^\/?/, '/'))
      .then(function (tokenObject) {
        return tokenObject._csrf;
      });
  }

  /**
   * Handle a created record message
   *
   * @since 0.0.1
   * @method _handleSocketRecordCreated
   * @param {Store} store The store to be used
   * @param {subclass of Model} type The type to push
   * @param {Object} message The message received
   * @private
   */
  _handleSocketRecordCreated(store, type, message) {
    const record = message.data;
    const payload = {};
    if (!record.id && message.id) {
      record.id = message.id;
    }
    payload[pluralize(camelize(type.modelName))] = [record];
    store.pushPayload(type.modelName, payload);
  }

  /**
   * Handle a updated record message
   *
   * @since 0.0.1
   * @method _handleSocketRecordUpdated
   * @param {Store} store The store to be used
   * @param {subclass of Model} type The type to push
   * @param {Object} message The message received
   * @private
   */
  _handleSocketRecordUpdated() {
    this._handleSocketRecordCreated(...arguments);
  }

  /**
   * Handle a destroyed record message
   *
   * @since 0.0.1
   * @method _handleSocketRecordDeleted
   * @param {Store} store The store to be used
   * @param {subclass of Model} type The type to push
   * @param {Object} message The message received
   * @private
   */
  _handleSocketRecordDeleted(store, type, message) {
    const record = store.peekRecord(type.modelName, message.id);
    if (record && typeof record.get('dirtyType') === 'undefined') {
      record.unloadRecord();
    }
  }

  /**
   * Listen to socket message for a given model
   *
   * @since 0.0.1
   * @method _listenToSocket
   * @param {String} model The model name to listen for events
   * @private
   */
  _listenToSocket(model) {
    const eventName = camelize(model).toLowerCase();
    const socket = this.sailsSocket;
    if (socket.listenFor(eventName, true)) {
      this.notice(`setting up adapter to listen for ${model} messages`);
      const store = this.store;
      const type = store.modelFor(model);
      socket.on(
        eventName + '.created',
        bind(this, '_handleSocketRecordCreated', store, type),
      );
      socket.on(
        eventName + '.updated',
        bind(this, '_handleSocketRecordUpdated', store, type),
      );
      socket.on(
        eventName + '.destroyed',
        bind(this, '_handleSocketRecordDeleted', store, type),
      );
    }
  }

  /**
   * Schedule a record subscription
   *
   * @since 0.0.11
   * @method _scheduleSubscribe
   * @param {subclass of Model} type
   * @param {String|Number} id
   * @private
   */
  _scheduleSubscribe(type, id) {
    if (id && this.shouldSubscribe(type, id)) {
      if (!this._scheduledSubscriptions) {
        this._scheduledSubscriptions = {};
      }
      // use an object and keys so that we don't have duplicate IDs
      let key = camelize(type.modelName);
      if (!this._scheduledSubscriptions[key]) {
        this._scheduledSubscriptions[key] = {};
      }
      id = '' + id;
      if (!this._scheduledSubscriptions[key][id]) {
        this._scheduledSubscriptions[key][id] = 0;
        debounce(this, '_subscribeScheduled', 50);
      }
    }
  }

  /**
   * Ask the API to subscribe
   *
   * @since 0.0.11
   * @method _subscribeScheduled
   * @private
   */
  _subscribeScheduled() {
    if (this._scheduledSubscriptions) {
      // grab and delete our scheduled subscriptions
      let opt = {
        subscribeMethod: this.subscribeMethod,
        subscribeEndpoint: this.subscribeEndpoint,
      };
      let data = this._scheduledSubscriptions;
      this._scheduledSubscriptions = null;
      const payload = {};
      // the IDs are the keys so that set both the same will not duplicate them, we need to reduce them
      for (let k in data) {
        payload[k] = Object.keys(data[k]);
        this._listenToSocket(k);
      }

      if (opt.subscribeEndpoint && opt.subscribeMethod) {
        debug(
          `asking the API to subscribe to some records of type ${Object.keys(
            data,
          ).join(', ')}`,
        );
        // ask the API to subscribe to those records
        this.fetchCSRFToken().then(() => {
          this.checkCSRF(payload);
          this.sailsSocket
            .request(opt.subscribeMethod, opt.subscribeEndpoint, payload)
            .then((result) => {
              debug('subscription successful, result:', result);
            })
            .catch((/* jwr */) => {
              warn('error when trying to subscribe to some model(s)', false, {
                id: 'ember-data-sails.subscribe',
              });
            });
        });
      }
    }
  }
}
