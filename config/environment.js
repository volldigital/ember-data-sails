module.exports = function (environment, appConfig) {
  let level = environment === 'production' ? 'error' : 'warn';
  if (appConfig.SAILS_LOG_LEVEL) {
    level = appConfig.SAILS_LOG_LEVEL;
  }
  return {
    modulePrefix: '@voll/ember-data-sails',
    LOG_LEVEL: level,
  };
};
