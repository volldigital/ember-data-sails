import Store from "@ember-data/store";
import { typeOf } from "@ember/utils";
import SailsSocketAdapter from "../adapters/sails-socket";

export default class NewStore extends Store {
  /**
   * @since 0.0.11
   * @inheritDoc
   * @method pushPayload
   * @param {String|subclass of Model} [type]
   * @param {Object} payload
   * @param {Boolean} [subscribe] Whether to subscribe to pushed models or not (Sails socket)
   */
  pushPayload(/*type, payload, subscribe*/) {
    let sub = false;
    const args = [].slice.call(arguments);
    const old = this._pushSubscribes;
    if (typeOf(args[args.length - 1]) === "boolean") {
      sub = args.pop();
    }
    this._pushSubscribes = sub;
    super.pushPayload.apply(this, args);
    this._pushSubscribes = old;
  }

  /**
   * @since 0.0.11
   * @method push
   * @inheritDoc
   */
  push(/*results, data, _partial*/) {
    const res = super.push.apply(this, arguments);
    const resArray = Array.isArray(res) ? res : [res];
    let id;

    resArray.forEach((res) => {
      if (res && (id = res.get("id"))) {
        const type = this.modelFor(res.constructor.modelName);
        const adapter = this.adapterFor(res.constructor.modelName);
        if (adapter instanceof SailsSocketAdapter) {
          adapter._scheduleSubscribe(type, id);
        }
      }
    });

    return res;
  }

  /**
   * Schedule a subscription to the given model
   *
   * @since 0.0.11
   * @method subscribe
   * @param {String|subclass of Model} type
   * @param {Array<String|Number>|String|Number} ids
   */
  subscribe(type, ids) {
    if (typeOf(ids) !== "array") {
      ids = [ids];
    }
    type = this.modelFor(type);
    const adapter = this.adapterFor(type);
    for (let i = 0; i < ids.length; i++) {
      adapter._scheduleSubscribe(type, ids[i]);
    }
  }
}
