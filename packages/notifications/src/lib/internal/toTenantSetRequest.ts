import { type Knock } from "@knocklabs/node";

import type { UpsertWorkplaceRequest } from "../types";
import { toInlineIdentifyUserRequestWithoutUserId } from "./toInlineIdentifyUserRequestWithoutUserId";

export function toTenantSetRequest(
  request: Omit<UpsertWorkplaceRequest, "workplaceId">,
): Knock.Tenants.TenantSetParams {
  // Use the same type as user inline identify so provider field names are consistent.
  return toInlineIdentifyUserRequestWithoutUserId(request);
}
