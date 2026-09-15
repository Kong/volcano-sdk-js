# @volcano.dev/durable-runtime

The runtime a [Volcano durable function](https://volcano.dev/platform/functions/durable-functions) executes on.

Install it alongside the SDK in the function you deploy:

```bash
npm install @volcano.dev/sdk @volcano.dev/durable-runtime
```

You do not import it. Write the handler against `@volcano.dev/sdk/durable`:

```javascript
const { durable } = require('@volcano.dev/sdk/durable');

exports.handler = durable(async (input, ctx) => {
  const charge = await ctx.step('charge', () => chargeCard(input.order_id));
  return { charged: charge.id };
});
```

## What this is

A re-export of
[`@aws/durable-execution-sdk-js`](https://www.npmjs.com/package/@aws/durable-execution-sdk-js),
which is its only dependency and which it installs for you. Nothing is wrapped
or renamed: this package exists so a durable function's dependencies name only
Volcano, and so the runtime resolves under a strict `node_modules` layout, where
`@volcano.dev/sdk` cannot reach a package it does not declare.

`@volcano.dev/sdk` does not depend on this package, so a browser bundle or a
standard function never pulls it in. See the
[durable functions guide](https://github.com/Kong/volcano-sdk-js/blob/main/docs/durable-functions.md)
for the full authoring API.
