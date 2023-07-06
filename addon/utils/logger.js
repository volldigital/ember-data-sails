import ENV from "@volldigital/ember-data-sails/config/environment";

const {
  APP: { SAILS_LOG_LEVEL },
} = ENV;

export const LEVELS = "debug info notice warn error".split(" ");

const levelMap = { notice: "log" };

console.log("SAILS_LOG_LEVEL", SAILS_LOG_LEVEL);

const methods = {};
let shouldLog = false;
const minLevel = SAILS_LOG_LEVEL;
LEVELS.forEach(function (level) {
  if (level === minLevel) shouldLog = true;

  if (shouldLog) {
    methods[level] = console.log.bind(levelMap[level] || level, "[ed-sails]");
  } else {
    methods[level] = () => {};
  }
});

export default methods;
