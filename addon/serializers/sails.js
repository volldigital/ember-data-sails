import RESTSerializer from "@ember-data/serializer/rest";
import { debug, warn } from "@ember/debug";
import { readOnly } from "@ember/object/computed";
import { typeOf } from "@ember/utils";
import SailsSocketAdapter from "@volldigital/ember-data-sails/adapters/sails-socket";
import { pluralize } from "ember-inflector";
import _ from "lodash";

function blueprintsWrapMethod(superMethod, method) {
  return function () {
    return (this.useSailsEmberBlueprints ? superMethod : method).apply(
      this,
      arguments
    );
  };
}

/**
 * @class SailsSerializer
 * @extends RESTSerializer
 */
export default class SailsSerializer extends RESTSerializer {
  /**
   * The config of the addon will be set here by the initializer
   * @since 0.0.17
   * @property config
   * @type Object
   */
  config = {};

  /**
   * Whether to use `sails-generate-ember-blueprints` or not
   * @since 0.0.15
   * @property useSailsEmberBlueprints
   * @type Boolean
   */
  @readOnly("config.useSailsEmberBlueprints") useSailsEmberBlueprints;

  /**
   * @since 0.0.11
   * @method extractArray
   * @inheritDoc
   */
  normalizeArrayResponse() {
    const superMethod = super.normalizeArrayResponse;

    return blueprintsWrapMethod(
      superMethod,
      function (store, primaryType, payload) {
        let newPayload = {};
        newPayload[pluralize(primaryType.modelName)] = payload;
        return superMethod(...arguments);
      }
    );
  }

  /**
   * @since 0.0.11
   * @method extractSingle
   * @inheritDoc
   */
  normalizeSingleResponse() {
    const superMethod = super.normalizeSingleResponse;

    return blueprintsWrapMethod(
      superMethod,
      function (store, primaryType, payload) {
        if (payload === null) {
          return superMethod.apply(this, arguments);
        }
        let newPayload = {};
        newPayload[pluralize(primaryType.modelName)] = [payload];
        return superMethod(...arguments);
      }
    );
  }

  /**
   * @since 0.0.11
   * @method serializeIntoHash
   * @inheritDoc
   */
  serializeIntoHash() {
    const superMethod = super.serializeIntoHash;

    return blueprintsWrapMethod(
      superMethod,
      function (data, type, record, options) {
        if (Object.keys(data).length > 0) {
          this.error(
            `trying to serialize multiple records in one hash for type ${type.modelName}`,
            data
          );
          throw new Error(
            "Sails does not accept putting multiple records in one hash"
          );
        }
        const json = this.serialize(record, options);
        _.merge(data, json);
      }
    );
  }

  /**
   * @since 0.0.11
   * @method normalize
   * @inheritDoc
   */
  normalize() {
    const superMethod = super.normalize;

    return blueprintsWrapMethod(superMethod, function (type) {
      const normalized = superMethod(...arguments);
      return this._extractEmbeddedRecords(this, this.store, type, normalized);
    });
  }

  /**
   * @since 0.0.15
   * @method extract
   * @inheritDoc
   */
  normalizeResponse(store, primaryModelClass /*, payload, id, requestType*/) {
    // this is the only place we have access to the store, so that we can get the adapter and check
    // if it is an instance of sails socket adapter, and so register for events if necessary on that
    // model. We keep a cache here to avoid too many calls
    if (!this._modelsUsingSailsSocketAdapter) {
      this._modelsUsingSailsSocketAdapter = Object.create(null);
    }
    const modelName = primaryModelClass.modelName;
    if (this._modelsUsingSailsSocketAdapter[modelName] === undefined) {
      const adapter = store.adapterFor(modelName);
      this._modelsUsingSailsSocketAdapter[modelName] =
        adapter instanceof SailsSocketAdapter;
      adapter._listenToSocket(modelName);
    }
    return super.normalizeResponse.apply(this, arguments);
  }

  /**
   * Extract the embedded records and create them
   *
   * @since 0.0.11
   * @method _extractEmbeddedRecords
   * @param {subclass of Model} type
   * @param {Object} hash
   * @returns {Object}
   * @private
   */
  _extractEmbeddedRecords(serializer, store, type, hash) {
    type.eachRelationship((key, rel) => {
      const modelName = rel.type.modelName;
      const data = hash[key];
      const serializer = store.serializerFor(modelName);
      if (data) {
        if (rel.kind === "belongsTo") {
          if (typeOf(hash[key]) === "object") {
            debug(`found 1 embedded ${modelName} record:`, hash[key]);
            delete hash[key];
            store.push(rel.type, serializer.normalize(rel.type, data, null));
            hash[key] = data.id;
          }
        } else if (rel.kind === "hasMany") {
          hash[key] = data.map(function (item) {
            if (typeOf(item) === "object") {
              debug(`found 1 embedded ${modelName} record:`, item);
              store.push(rel.type, serializer.normalize(rel.type, item, null));
              return item.id;
            }
            return item;
          });
        } else {
          warn(`unknown relationship kind ${rel.kind}: ${rel}`, false, {
            id: "ember-data-sails.relationship",
          });
          throw new Error("Unknown relationship kind " + rel.kind);
        }
      }
    });
    return hash;
  }
}
