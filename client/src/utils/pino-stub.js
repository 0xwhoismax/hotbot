// Stub for pino/thread-stream to prevent bundling server logging code.
const noop = () => {};

const levels = {
  values: {
    trace: 10,
    debug: 20,
    info: 30,
    warn: 40,
    error: 50,
    fatal: 60,
  },
  labels: {
    10: "trace",
    20: "debug",
    30: "info",
    40: "warn",
    50: "error",
    60: "fatal",
  },
};

function createLogger() {
  return {
    level: "silent",
    levels,
    info: noop,
    warn: noop,
    error: noop,
    debug: noop,
    trace: noop,
    fatal: noop,
    child: createLogger,
  };
}

createLogger.levels = levels;
createLogger.stdSerializers = {};
createLogger.stdTimeFunctions = {};
createLogger.destination = () => ({ write: noop, end: noop, on: noop });
createLogger.transport = () => ({ write: noop, end: noop, on: noop });

module.exports = createLogger;
module.exports.default = createLogger;
module.exports.pino = createLogger;
module.exports.levels = levels;
