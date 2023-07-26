import SailsSocketAdapter from '@voll/ember-data-sails/adapters/sails-socket';

export default class SailsApplicationAdapter extends SailsSocketAdapter {
  defaultSerializer = '-rest';
  namespace = 'api/v1';
  useCSRF = true;
}
