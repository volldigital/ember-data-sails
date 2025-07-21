export function initialize(application) {
  application.inject('adapter', 'sailsSocket', 'service:sails-socket');
  application.inject('serializer', 'config', 'config:ember-data-sails');
  application.inject('route', 'sailsSocket', 'service:sails-socket');
  application.inject('controller', 'sailsSocket', 'service:sails-socket');
}

export default {
  name: 'ember-data-sails',
  before: 'ember-data',

  initialize: initialize,
};
