import type { OpenAPIComponents, OpenAPIOperations } from '../../src/index.ts';
import type { Exact as Equal } from '../fixtures/public-api-compatibility.d.ts';

type Assert<T extends true> = T;

// Hosting enforces which PEM fields each mode allows with `not` rules that
// openapi-typescript does not translate, so the generated shape stays flat.
interface CustomDomainTLSShape {
  mode: 'managed' | 'byoc';
  certificate_pem?: string;
  private_key_pem?: string;
  certificate_chain_pem?: string;
}
type _CustomDomainTLSMatchesHosting = Assert<
  Equal<OpenAPIComponents['schemas']['CreateFrontendCustomDomainRequest']['tls'], CustomDomainTLSShape>
>;
// The spec gives `mode` a `default: byoc` but also lists it as required, and
// generation runs with `--default-non-nullable false`. The default must not
// make `mode` optional: a request that leaves it out does not compile.
type _CustomDomainTLSDefaultKeepsModeRequired = Assert<
  {
    certificate_pem: string;
    private_key_pem: string;
  } extends OpenAPIComponents['schemas']['FrontendCustomDomainTLSConfig']
    ? false
    : true
>;

interface CustomDomainVerificationRecordShape {
  name: string;
  type: string;
  value: string;
}
interface CustomDomainRedirectShape {
  to: string;
  status: 301 | 302 | 307 | 308;
}
interface CustomDomainResponseShape {
  domain: string;
  tls_mode: 'managed' | 'byoc';
  domain_status: 'pending_verification' | 'provisioning' | 'active' | 'detaching' | 'failed' | 'deleted';
  verification_status: 'pending' | 'verified' | 'failed';
  serving_certificate?: 'uploaded' | 'managed';
  failure_reason?: string;
  verification_records?: CustomDomainVerificationRecordShape[];
  required_routing_record?: { record_type: 'CNAME'; name: string; value: string };
  routing_target_hostname?: string;
  effective_urls: string[];
  redirect: CustomDomainRedirectShape | null;
  created_at: string;
  updated_at: string;
}
type _CustomDomainResponseMatchesHosting = Assert<
  Equal<OpenAPIComponents['schemas']['FrontendCustomDomainResponse'], CustomDomainResponseShape>
>;
type CustomDomainConflict =
  OpenAPIOperations['createFrontendCustomDomain']['responses'][409]['content']['application/json'];
type _CustomDomainConflictCarriesRequiredRecord = Assert<
  Equal<
    CustomDomainConflict,
    OpenAPIComponents['schemas']['Error'] & {
      required_record?: CustomDomainVerificationRecordShape;
    }
  >
>;

type ProjectConfigCustomDomainTLS = NonNullable<OpenAPIComponents['schemas']['ProjectConfigCustomDomain']['tls']>;
type _ProjectConfigTLSMatchesHosting = Assert<
  Equal<
    ProjectConfigCustomDomainTLS,
    | { mode: 'managed' }
    | {
        mode?: 'byoc';
        certificate_pem?: string;
        private_key_pem?: string;
        certificate_chain_pem?: string;
      }
  >
>;
// Hosting reads a manifest TLS block without `mode` as BYOC and no longer
// declares a discriminator, so the union must resolve on `mode` alone.
type ManagedManifestTLS = OpenAPIComponents['schemas']['ManagedProjectConfigFrontendCustomDomainTLSConfig'];
type BYOCManifestTLS = OpenAPIComponents['schemas']['BYOCProjectConfigFrontendCustomDomainTLSConfig'];
type ManifestTLSMembersAccepting<Block> = ProjectConfigCustomDomainTLS extends infer Member
  ? Member extends unknown
    ? Block extends Member
      ? Member
      : never
    : never
  : never;
type _ProjectConfigTLSWithoutModeIsBYOC = Assert<
  Equal<ManifestTLSMembersAccepting<{ certificate_pem: string; private_key_pem: string }>, BYOCManifestTLS>
>;
type _ProjectConfigEmptyTLSIsBYOC = Assert<Equal<ManifestTLSMembersAccepting<Record<string, never>>, BYOCManifestTLS>>;
type _ProjectConfigManagedTLSStaysManaged = Assert<
  Equal<ManifestTLSMembersAccepting<{ mode: 'managed' }>, ManagedManifestTLS>
>;

export type OpenApiCustomDomainContractChecks = [
  _CustomDomainTLSMatchesHosting,
  _CustomDomainTLSDefaultKeepsModeRequired,
  _CustomDomainResponseMatchesHosting,
  _CustomDomainConflictCarriesRequiredRecord,
  _ProjectConfigTLSMatchesHosting,
  _ProjectConfigTLSWithoutModeIsBYOC,
  _ProjectConfigEmptyTLSIsBYOC,
  _ProjectConfigManagedTLSStaysManaged,
];

function manifestTLSMode(tls: ProjectConfigCustomDomainTLS): 'managed' | 'byoc' {
  if (tls.mode === 'managed') {
    const managed: ManagedManifestTLS = tls;
    return managed.mode;
  }
  const byoc: BYOCManifestTLS = tls;
  return byoc.mode ?? 'byoc';
}
manifestTLSMode({ certificate_pem: 'cert', private_key_pem: 'key' });
manifestTLSMode({ mode: 'managed' });
// @ts-expect-error A managed block cannot carry certificate fields.
manifestTLSMode({ mode: 'managed', certificate_pem: 'cert' });

export const customDomainContractOperations = { manifestTLSMode };
