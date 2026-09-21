# Property tests

fast-check runs 200 generated examples per property and shrinks failures. Jest's
failure report includes the seed, replay path, and smallest counterexample. CI
preserves `reports/unit.json` on failure.

Replay the named property with the pinned fast-check version:

```sh
VOLCANO_PROPERTY_SEED=12345 pnpm test --runInBand --runTestsByPath __tests__/database-properties.test.ts -t 'changing arbitrary user IDs'
```

Add the minimized counterexample as an explicit regression example when fixing
the bug. Invalid seeds fail instead of silently choosing new inputs.
