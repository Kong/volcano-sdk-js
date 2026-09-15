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

The SDK does not depend on this package, so a browser bundle or a standard
function never pulls it in. See the
[durable functions guide](https://github.com/Kong/volcano-sdk-js/blob/main/docs/durable-functions.md)
for the full authoring API.
