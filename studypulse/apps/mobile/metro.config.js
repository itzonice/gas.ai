// Sentry's Expo Metro config adds debug IDs so production stack traces symbolicate.
const { getSentryExpoConfig } = require("@sentry/react-native/metro");

module.exports = getSentryExpoConfig(__dirname);
