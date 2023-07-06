"use strict";

const getChannelURL = require("ember-source-channel-url");

module.exports = async function () {
  return {
    scenarios: [
      {
        name: 'ember-lts-4.4',
        npm: {
          devDependencies: {
            'ember-source': '~4.4.0',
          },
        },
      },
      {
        name: 'ember-lts-4.8',
        npm: {
          devDependencies: {
            'ember-source': '~4.8.0',
          },
        },
        {
          name: "ember-lts-3.24",
          npm: {
            devDependencies: {
              "ember-source": "~3.24.0",
            },
          },
        },
        {
          name: "ember-lts-4.0",
          npm: {
            devDependencies: {
              "ember-source": "~4.0.1",
            },
          },
        },
        {
          name: "ember-release",
          npm: {
            devDependencies: {
              "ember-source": urls[0],
            },
          },
        },
      },
      embroiderSafe(),
      embroiderOptimized(),
    ],
  };
};
