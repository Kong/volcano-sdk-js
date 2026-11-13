import type { GitRepositoryResource, GitRepositoryList, GitRevision as WireRevision } from './generated/model/index.ts';
import type {
  GitReadOptions,
  GitRepository,
  GitRepositoryPage,
  GitRevision,
  GitRevisionSelector,
} from './management-types.ts';

function requiredString(value: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error('Invalid Git response string');
  }
  return value;
}

function nullableString(value: string | null): string | null {
  if (value !== null && typeof value !== 'string') {
    throw new Error('Invalid Git response string');
  }
  return value;
}

function requiredBoolean(value: boolean): boolean {
  if (typeof value !== 'boolean') {
    throw new TypeError('Invalid Git response boolean');
  }
  return value;
}

export function repositoryFromWire(wire: GitRepositoryResource): GitRepository {
  return {
    id: requiredString(wire.id),
    projectId: requiredString(wire.project_id),
    name: requiredString(wire.name),
    provider: requiredString(wire.provider),
    createdAt: requiredString(wire.created_at),
    binding:
      wire.binding === null
        ? null
        : {
            rootDirectory: nullableString(wire.binding.root_directory) ?? invalidRootDirectory(),
            productionBranch: nullableString(wire.binding.production_branch),
          },
    capabilities: wire.capabilities.map((capability) => ({
      operation: requiredString(capability.operation),
      available: requiredBoolean(capability.available),
      unavailableReason: nullableString(capability.unavailable_reason),
    })),
  };
}

function invalidRootDirectory(): never {
  throw new Error('Invalid Git repository root directory');
}

export function pageFromWire(wire: GitRepositoryList): GitRepositoryPage {
  if (!Number.isInteger(wire.limit) || wire.limit < 1 || wire.limit > 100) {
    throw new Error('Invalid Git repository page limit');
  }
  return {
    repositories: wire.data.map(repositoryFromWire),
    limit: wire.limit,
    hasMore: requiredBoolean(wire.has_more),
    ...(wire.next_cursor === undefined ? {} : { nextCursor: requiredString(wire.next_cursor) }),
    ...(wire.prev_cursor === undefined ? {} : { prevCursor: requiredString(wire.prev_cursor) }),
  };
}

export function revisionFromWire(wire: WireRevision): GitRevision {
  if (wire.resource.type !== 'repository') {
    throw new Error('Invalid Git revision resource type');
  }
  return {
    id: requiredString(wire.id),
    projectId: requiredString(wire.project_id),
    resource: { type: 'repository', id: requiredString(wire.resource.id), name: requiredString(wire.resource.name) },
    commitOid: objectOid(wire.commit_oid),
    treeOid: objectOid(wire.tree_oid),
  };
}

export function uuidParameter(value: string): string {
  if (typeof value !== 'string' || !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/iu.test(value)) {
    throw new Error('A Git project or repository ID must be a UUID');
  }
  return value;
}

function objectOid(value: string): string {
  if (typeof value !== 'string' || !/^[\da-f]{40}$/u.test(value) || value === '0'.repeat(40)) {
    throw new Error('A Git object ID must be a complete lowercase SHA-1 OID');
  }
  return value;
}

export function selectorParameters(selector: GitRevisionSelector): {
  selector_type: 'branch' | 'tag' | 'commit';
  selector: string;
  witness_ref?: string;
} {
  if (selector.type === 'commit') {
    if (selector.witness.type !== 'branch' && selector.witness.type !== 'tag') {
      throw new Error('A commit selection requires a branch or tag witness');
    }
    return {
      selector_type: 'commit',
      selector: objectOid(selector.oid),
      witness_ref: `refs/${selector.witness.type === 'branch' ? 'heads' : 'tags'}/${requiredString(selector.witness.name)}`,
    };
  }
  if ((selector.type !== 'branch' && selector.type !== 'tag') || 'witness' in selector) {
    throw new Error('Branch or tag selections cannot include a witness');
  }
  return { selector_type: selector.type, selector: requiredString(selector.name) };
}

export function contextSegment(value: string): string {
  if (typeof value !== 'string' || value === '' || value === '.' || value === '..') {
    throw new Error('A nonempty opaque revision context is required');
  }
  return encodeURIComponent(value);
}

export function projectParameters(options: GitReadOptions): { project_id?: string } {
  return options.projectId === undefined ? {} : { project_id: uuidParameter(options.projectId) };
}
