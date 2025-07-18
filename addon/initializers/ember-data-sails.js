import SailsSocketService from '../services/sails-socket';

export function initialize(application) {
  application.register('service:sails-socket', SailsSocketService);
  application.register(
    'config:ember-data-sails',
    application.emberDataSails || {},
    { instantiate: false },
  );
}

export default {
  name: 'ember-data-sails',
  before: 'ember-data',

  initialize: initialize,
};
