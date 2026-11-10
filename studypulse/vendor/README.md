# Vendored packages

## decode-uri-component

`expo-router` depends on `query-string@7`, which loads `decode-uri-component` with
`require()` and accepts only `^0.2.2`. Versions up to 0.5.0 have a high-severity
denial-of-service advisory (quadratic replacement of percent-encoded runs), and the fixed
0.5.1 is published only as an ES module, so `require()` can't load it in Metro.

`decode-uri-component/index.js` is 0.5.1's `index.js` unchanged except for the last
function, which is exported with `module.exports` instead of `export default`. The
override in `pnpm-workspace.yaml` installs it in place of the registry package. One
behavior differs from 0.2.x: it no longer turns `+` into a space, but `query-string`
already does that itself before it decodes.

Remove the override and this folder once `expo-router` moves to a `query-string` without
this dependency.
