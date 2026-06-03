cordova.define('cordova/plugin_list', function(require, exports, module) {
  module.exports = [
    {
      "id": "@red-mobile/nodejs-mobile-cordova.nodejs",
      "file": "plugins/@red-mobile/nodejs-mobile-cordova/www/nodejs_apis.js",
      "pluginId": "@red-mobile/nodejs-mobile-cordova",
      "clobbers": [
        "nodejs"
      ]
    },
    {
      "id": "@red-mobile/nodejs-mobile-cordova.nodejs_events",
      "file": "plugins/@red-mobile/nodejs-mobile-cordova/www/nodejs_events.js",
      "pluginId": "@red-mobile/nodejs-mobile-cordova",
      "clobbers": [
        "nodejs_events"
      ]
    }
  ];
  module.exports.metadata = {
    "@red-mobile/nodejs-mobile-cordova": "3.4.1",
    "cordova-plugin-console": "1.1.0"
  };
});