type Branch = (context: unknown) => unknown;
interface NamedBranch {
  name: unknown;
  func: Branch;
}

/** Adapt Volcano's branch callbacks to the durable engine's batch shape. */
export function parallelBranches(
  branches: unknown,
  contextFor: (engineContext: unknown) => unknown,
): (Branch | NamedBranch)[] {
  if (!Array.isArray(branches)) {
    throw new TypeError('ctx.parallel() requires an array of branches');
  }
  return branches.map((branch: unknown): Branch | NamedBranch => adaptBranch(branch, contextFor));
}

function adaptBranch(
  branch: unknown,
  contextFor: (engineContext: unknown) => unknown,
): Branch | NamedBranch {
  if (typeof branch === 'function') {
    return (engineContext: unknown): unknown =>
      Reflect.apply(branch, undefined, [contextFor(engineContext)]);
  }
  if (typeof branch !== 'object' || branch === null) {
    throw new TypeError('a parallel branch is a function, or { name, run }');
  }
  const run: unknown = Reflect.get(branch, 'run');
  if (typeof run !== 'function') {
    throw new TypeError('a parallel branch is a function, or { name, run }');
  }
  const name: unknown = Reflect.get(branch, 'name');
  return {
    name,
    func: (engineContext: unknown): unknown =>
      Reflect.apply(run, branch, [contextFor(engineContext)]),
  };
}
