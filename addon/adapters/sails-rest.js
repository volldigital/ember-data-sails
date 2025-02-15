import { A } from "@ember/array";
import RESTAdapter from "@ember-data/adapter/rest";
// eslint-disable-next-line ember/no-computed-properties-in-native-classes
import { computed } from "@ember/object";
import SailsBaseAdapter from "./sails-base";

/**
 * Adapter for SailsJS HTTP REST API
 *
 * @since 0.0.8
 * @class SailsRESTAdapter
 * @extends SailsBaseAdapter
 * @constructor
 */
export default class SailsRest extends SailsBaseAdapter {
  /**
   * The full URL to the CSRF token
   * @since 0.0.15
   * @property csrfTokenUrl
   * @type String
   */
  @computed("host", "namespace", "csrfTokenPath")
  csrfTokenUrl(key, value) {
    let csrfTokenUrl, csrfTokenPath;
    if (arguments.length > 1) {
      this._csrfTokenUrl = csrfTokenUrl = value;
    } else if (this._csrfTokenUrl !== undefined) {
      csrfTokenUrl = this._csrfTokenUrl;
    } else {
      csrfTokenPath = this.csrfTokenPath;
      csrfTokenUrl = A([
        this.host,
        csrfTokenPath.charAt(0) === "/" ? null : this.namespace,
        csrfTokenPath.replace(/^\//, ""),
      ])
        .filter(Boolean)
        .join("/");
      if (!/^(https?:)?\/\//.test(csrfTokenUrl)) {
        csrfTokenUrl = "/" + csrfTokenUrl;
      }
    }
    return csrfTokenUrl;
  }

  /**
   * Sends a request over HTTP
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
    out.protocol = "http";
    return this._restAdapter_ajax.call(this, url, method, options);
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
    return this._restAdapter_ajax
      .call(this, this.csrfTokenUrl, "get")
      .then(function (tokenObject) {
        return tokenObject._csrf;
      });
  }

  /**
   * We need to copy the original `ajax` method to be able to use it inside our own `_request`
   *
   * @since 0.0.8
   * @method _restAdapter_ajax
   * @private
   * @param {String} url
   * @param {String} type The request type GET, POST, PUT, DELETE etc.
   * @param {Object} hash
   * @return {Ember.RSVP.Promise} promise
   */
  _restAdapter_ajax = RESTAdapter.proto().ajax;
}
