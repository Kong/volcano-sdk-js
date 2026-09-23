const config = require('./stryker.config.json');

// The scheduled full-repo run reports existing mutants; PR scope stays at 100%.
module.exports = { ...config, thresholds: { high: 100, low: 100, break: null } };
