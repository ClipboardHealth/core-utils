import { createHash } from "node:crypto";

import type {
  NetworkBody,
  NetworkGroup,
  NetworkInstance,
  NetworkReport,
  NetworkSummary,
  NetworkTimingBreakdown,
} from "../types";
import {
  BODIES_CAP,
  DUPLICATE_SAMPLE_STRIDE,
  DUPLICATE_SAMPLE_THRESHOLD,
  GROUPS_CAP,
  INSTANCES_CAP,
} from "./constants";
import { priorityScore, type PriorityShape } from "./networkPriority";
import { isLowSignalStaticAsset } from "./signalFiltering";

export interface NetworkObservationShape {
  method: string;
  url: string;
  status: number;
  resourceType?: string;
  failureText?: string;
  wasAborted?: boolean;
}

export interface NetworkObservationInstance {
  offsetMs?: number;
  durationMs?: number;
  timings?: NetworkTimingBreakdown;
  traceId?: string;
  spanId?: string;
  requestId?: string;
  correlationId?: string;
  redirectToUrl?: string;
}

export interface NetworkObservationBody {
  content: string;
  contentType?: string;
  truncated: boolean;
  fingerprint: string;
}

export interface NetworkObservation {
  shape: NetworkObservationShape;
  instance: NetworkObservationInstance;
  requestBody?: NetworkObservationBody;
  responseBody?: NetworkObservationBody;
}

export function hashShape(shape: NetworkObservationShape): string {
  // Serialize as a JSON array so each field is unambiguously delimited by quotes. Any literal
  // delimiter (pipes, NULs, whitespace) inside a URL or failureText becomes an ordinary character
  // inside a quoted string, so two different shapes can never collide on the concatenation.
  const canonical = JSON.stringify([
    shape.method,
    shape.url,
    shape.status,
    shape.resourceType ?? null,
    shape.failureText ?? null,
    shape.wasAborted ?? null,
  ]);
  return createHash("sha1").update(canonical).digest("hex");
}

export function hashBody(content: string): string {
  return createHash("sha1").update(content).digest("hex");
}

interface ShapeMetadata {
  firstOffsetMs?: number;
  lastOffsetMs?: number;
  totalPostFilterObservations: number;
}

function toPriorityShape(group: NetworkGroup): PriorityShape {
  const shape: PriorityShape = { status: group.status };
  if (group.resourceType !== undefined) {
    shape.resourceType = group.resourceType;
  }
  if (group.failureText !== undefined) {
    shape.failureText = group.failureText;
  }
  if (group.wasAborted !== undefined) {
    shape.wasAborted = group.wasAborted;
  }
  return shape;
}

export class NetworkBuilder {
  private nextGroupCounter = 0;
  private nextInstanceCounter = 0;
  private nextBodyCounter = 0;
  private sequenceCounter = 0;

  private readonly instancesById = new Map<string, NetworkInstance>();
  private readonly groupsById = new Map<string, NetworkGroup>();
  private readonly bodiesById = new Map<string, NetworkBody>();

  private readonly fingerprintToGroupId = new Map<string, string>();
  private readonly bodyHashToBodyId = new Map<string, string>();
  private readonly shapeMetadata = new Map<string, ShapeMetadata>();
  private readonly bodyRefCounts = new Map<string, number>();
  private readonly groupInstanceIndex = new Map<string, Set<string>>();

  private readonly instanceSequenceById = new Map<string, number>();
  private readonly instanceRedirectToUrl = new Map<string, string>();

  private readonly summary: NetworkSummary = {
    observedInstances: 0,
    retainedInstances: 0,
    retainedGroups: 0,
    retainedBodies: 0,
    instancesDroppedByFilter: 0,
    instancesDroppedByGroupCap: 0,
    instancesDroppedByInstanceCap: 0,
    instancesSuppressedAsDuplicate: 0,
    instancesEvictedAfterAdmission: 0,
    bodiesOmittedByBodyCap: 0,
    bodiesTruncated: 0,
    bodiesCanonicalized: 0,
  };

  public admit(observation: NetworkObservation): void {
    this.summary.observedInstances += 1;

    const { shape, instance } = observation;
    if (isLowSignalStaticAsset(shape)) {
      this.summary.instancesDroppedByFilter += 1;
      return;
    }

    const fingerprint = hashShape(shape);
    const existingGroupId = this.fingerprintToGroupId.get(fingerprint);

    if (existingGroupId !== undefined) {
      const metadata = this.shapeMetadata.get(fingerprint);
      if (metadata) {
        if (instance.offsetMs !== undefined) {
          metadata.lastOffsetMs = instance.offsetMs;
          metadata.firstOffsetMs ??= instance.offsetMs;
        }
        metadata.totalPostFilterObservations += 1;
      }

      const k = metadata?.totalPostFilterObservations ?? 1;
      if (
        k > DUPLICATE_SAMPLE_THRESHOLD &&
        (k - DUPLICATE_SAMPLE_THRESHOLD) % DUPLICATE_SAMPLE_STRIDE !== 0
      ) {
        const group = this.groupsById.get(existingGroupId);
        if (group) {
          group.suppressedInstanceCount += 1;
          group.occurrenceCount += 1;
        }
        this.summary.instancesSuppressedAsDuplicate += 1;
        return;
      }
    } else if (this.groupsById.size >= GROUPS_CAP) {
      const evicted = this.evictLowestPriorityGroup(shape);
      if (!evicted) {
        this.summary.instancesDroppedByGroupCap += 1;
        return;
      }
    }

    if (this.instancesById.size >= INSTANCES_CAP) {
      const evicted = this.evictLowestPriorityInstance(shape);
      if (!evicted) {
        this.summary.instancesDroppedByInstanceCap += 1;
        return;
      }
    }

    const groupId = existingGroupId ?? this.commitGroup(fingerprint, shape, instance.offsetMs);
    const instanceId = this.commitInstance(groupId, shape, instance);
    this.commitBodies(instanceId, observation);
  }

  public finalize(): NetworkReport {
    this.annotateRedirects();
    this.sortInstances();

    this.summary.retainedInstances = this.instancesById.size;
    this.summary.retainedGroups = this.groupsById.size;
    this.summary.retainedBodies = this.bodiesById.size;

    const groupRetainedCounts = new Map<string, number>();
    for (const instance of this.instancesById.values()) {
      groupRetainedCounts.set(
        instance.groupId,
        (groupRetainedCounts.get(instance.groupId) ?? 0) + 1,
      );
    }
    for (const group of this.groupsById.values()) {
      group.retainedInstanceCount = groupRetainedCounts.get(group.id) ?? 0;
      const metadata = this.shapeMetadata.get(group.fingerprint);
      if (metadata?.firstOffsetMs !== undefined) {
        group.firstOffsetMs = metadata.firstOffsetMs;
      }
      if (metadata?.lastOffsetMs !== undefined) {
        group.lastOffsetMs = metadata.lastOffsetMs;
      }
    }

    this.assertInvariants();

    return {
      summary: { ...this.summary },
      instances: [...this.instancesById.values()],
      groups: Object.fromEntries(this.groupsById),
      bodies: Object.fromEntries(this.bodiesById),
    };
  }

  private evictLowestPriorityGroup(incoming: PriorityShape): boolean {
    const incomingScore = priorityScore(incoming);
    let lowestScore = Number.POSITIVE_INFINITY;
    let lowestGroupId: string | undefined;
    let lowestOffset = Number.POSITIVE_INFINITY;

    for (const [groupId, group] of this.groupsById) {
      const score = priorityScore(toPriorityShape(group));
      // group.firstOffsetMs is only populated during finalize(); read live tiebreak data from
      // shapeMetadata so admission-time eviction actually picks the oldest group.
      const firstOffset =
        this.shapeMetadata.get(group.fingerprint)?.firstOffsetMs ?? Number.POSITIVE_INFINITY;
      if (score < lowestScore || (score === lowestScore && firstOffset < lowestOffset)) {
        lowestScore = score;
        lowestOffset = firstOffset;
        lowestGroupId = groupId;
      }
    }

    if (lowestGroupId === undefined || lowestScore >= incomingScore) {
      return false;
    }

    this.removeGroup(lowestGroupId, { countCascadedEvictions: true });
    return true;
  }

  private evictLowestPriorityInstance(incoming: PriorityShape): boolean {
    const incomingScore = priorityScore(incoming);
    let lowestScore = Number.POSITIVE_INFINITY;
    let lowestInstanceId: string | undefined;
    let lowestOffset = Number.POSITIVE_INFINITY;
    let lowestSequence = Number.POSITIVE_INFINITY;

    for (const [instanceId, inst] of this.instancesById) {
      const group = this.groupsById.get(inst.groupId);
      if (!group) {
        continue;
      }
      const score = priorityScore(toPriorityShape(group));
      const offset = inst.offsetMs ?? Number.POSITIVE_INFINITY;
      const sequence = this.instanceSequenceById.get(instanceId) ?? Number.POSITIVE_INFINITY;
      if (
        score < lowestScore ||
        (score === lowestScore && offset < lowestOffset) ||
        (score === lowestScore && offset === lowestOffset && sequence < lowestSequence)
      ) {
        lowestScore = score;
        lowestOffset = offset;
        lowestSequence = sequence;
        lowestInstanceId = instanceId;
      }
    }

    if (lowestInstanceId === undefined || lowestScore >= incomingScore) {
      return false;
    }

    this.removeInstance(lowestInstanceId, { countAsEviction: true });
    return true;
  }

  private removeGroup(groupId: string, options: { countCascadedEvictions: boolean }): void {
    const group = this.groupsById.get(groupId);
    if (!group) {
      return;
    }

    const instanceIds = this.groupInstanceIndex.get(groupId) ?? new Set();
    for (const instanceId of instanceIds) {
      this.removeInstance(instanceId, {
        countAsEviction: options.countCascadedEvictions,
        skipEmptyGroupCleanup: true,
      });
    }

    this.groupsById.delete(groupId);
    this.fingerprintToGroupId.delete(group.fingerprint);
    this.shapeMetadata.delete(group.fingerprint);
    this.groupInstanceIndex.delete(groupId);
  }

  private removeInstance(
    instanceId: string,
    options: { countAsEviction: boolean; skipEmptyGroupCleanup?: boolean },
  ): void {
    const instance = this.instancesById.get(instanceId);
    if (!instance) {
      return;
    }

    const group = this.groupsById.get(instance.groupId);
    if (group && options.countAsEviction) {
      group.evictedInstanceCount += 1;
    }
    if (options.countAsEviction) {
      this.summary.instancesEvictedAfterAdmission += 1;
    }

    this.instancesById.delete(instanceId);
    this.instanceSequenceById.delete(instanceId);
    this.instanceRedirectToUrl.delete(instanceId);

    const indexEntry = this.groupInstanceIndex.get(instance.groupId);
    indexEntry?.delete(instanceId);

    this.decrementBodyRef(instance.requestBodyRef);
    this.decrementBodyRef(instance.responseBodyRef);

    if (!options.skipEmptyGroupCleanup && indexEntry?.size === 0) {
      const emptyGroup = this.groupsById.get(instance.groupId);
      if (emptyGroup) {
        this.groupsById.delete(instance.groupId);
        this.fingerprintToGroupId.delete(emptyGroup.fingerprint);
        this.shapeMetadata.delete(emptyGroup.fingerprint);
      }
      this.groupInstanceIndex.delete(instance.groupId);
    }
  }

  private decrementBodyRef(bodyId: string | undefined): void {
    if (bodyId === undefined) {
      return;
    }
    const count = this.bodyRefCounts.get(bodyId) ?? 0;
    const next = count - 1;
    if (next <= 0) {
      const body = this.bodiesById.get(bodyId);
      this.bodyRefCounts.delete(bodyId);
      this.bodiesById.delete(bodyId);
      if (body) {
        this.bodyHashToBodyId.delete(body.fingerprint);
      }
    } else {
      this.bodyRefCounts.set(bodyId, next);
    }
  }

  private commitGroup(
    fingerprint: string,
    shape: NetworkObservationShape,
    offsetMs: number | undefined,
  ): string {
    const groupId = `g${this.nextGroupCounter}`;
    this.nextGroupCounter += 1;

    const group: NetworkGroup = {
      id: groupId,
      method: shape.method,
      url: shape.url,
      status: shape.status,
      occurrenceCount: 0,
      retainedInstanceCount: 0,
      suppressedInstanceCount: 0,
      evictedInstanceCount: 0,
      fingerprint,
    };
    if (shape.resourceType !== undefined) {
      group.resourceType = shape.resourceType;
    }
    if (shape.failureText !== undefined) {
      group.failureText = shape.failureText;
    }
    if (shape.wasAborted !== undefined) {
      group.wasAborted = shape.wasAborted;
    }

    this.groupsById.set(groupId, group);
    this.fingerprintToGroupId.set(fingerprint, groupId);
    this.groupInstanceIndex.set(groupId, new Set());
    const metadata: ShapeMetadata = { totalPostFilterObservations: 1 };
    if (offsetMs !== undefined) {
      metadata.firstOffsetMs = offsetMs;
      metadata.lastOffsetMs = offsetMs;
    }
    this.shapeMetadata.set(fingerprint, metadata);

    return groupId;
  }

  private commitInstance(
    groupId: string,
    shape: NetworkObservationShape,
    instance: NetworkObservationInstance,
  ): string {
    const instanceId = `n${this.nextInstanceCounter}`;
    this.nextInstanceCounter += 1;
    this.sequenceCounter += 1;

    const networkInstance: NetworkInstance = {
      id: instanceId,
      groupId,
      method: shape.method,
      url: shape.url,
      status: shape.status,
    };
    if (instance.offsetMs !== undefined) {
      networkInstance.offsetMs = instance.offsetMs;
    }
    if (instance.durationMs !== undefined) {
      networkInstance.durationMs = instance.durationMs;
    }
    if (instance.timings) {
      networkInstance.timings = instance.timings;
    }
    if (instance.traceId !== undefined) {
      networkInstance.traceId = instance.traceId;
    }
    if (instance.spanId !== undefined) {
      networkInstance.spanId = instance.spanId;
    }
    if (instance.requestId !== undefined) {
      networkInstance.requestId = instance.requestId;
    }
    if (instance.correlationId !== undefined) {
      networkInstance.correlationId = instance.correlationId;
    }

    this.instancesById.set(instanceId, networkInstance);
    this.instanceSequenceById.set(instanceId, this.sequenceCounter);

    if (instance.redirectToUrl !== undefined) {
      this.instanceRedirectToUrl.set(instanceId, instance.redirectToUrl);
    }

    let indexEntry = this.groupInstanceIndex.get(groupId);
    if (!indexEntry) {
      indexEntry = new Set();
      this.groupInstanceIndex.set(groupId, indexEntry);
    }
    indexEntry.add(instanceId);

    const group = this.groupsById.get(groupId);
    if (group) {
      group.occurrenceCount += 1;
    }

    return instanceId;
  }

  private commitBodies(instanceId: string, observation: NetworkObservation): void {
    const instance = this.instancesById.get(instanceId);
    if (!instance) {
      return;
    }

    if (observation.requestBody) {
      const bodyId = this.resolveOrAdmitBody(observation.requestBody);
      if (bodyId !== undefined) {
        instance.requestBodyRef = bodyId;
      }
    }
    if (observation.responseBody) {
      const bodyId = this.resolveOrAdmitBody(observation.responseBody);
      if (bodyId !== undefined) {
        instance.responseBodyRef = bodyId;
      }
    }
  }

  private resolveOrAdmitBody(body: NetworkObservationBody): string | undefined {
    const existing = this.bodyHashToBodyId.get(body.fingerprint);
    if (existing !== undefined) {
      this.bodyRefCounts.set(existing, (this.bodyRefCounts.get(existing) ?? 0) + 1);
      return existing;
    }

    if (this.bodiesById.size >= BODIES_CAP) {
      this.summary.bodiesOmittedByBodyCap += 1;
      return undefined;
    }

    const bodyId = `b${this.nextBodyCounter}`;
    this.nextBodyCounter += 1;

    const record: NetworkBody = {
      id: bodyId,
      content: body.content,
      truncated: body.truncated,
      canonicalized: false,
      fingerprint: body.fingerprint,
    };
    if (body.contentType !== undefined) {
      record.contentType = body.contentType;
    }

    this.bodiesById.set(bodyId, record);
    this.bodyHashToBodyId.set(body.fingerprint, bodyId);
    this.bodyRefCounts.set(bodyId, 1);
    if (body.truncated) {
      this.summary.bodiesTruncated += 1;
    }

    return bodyId;
  }

  private annotateRedirects(): void {
    // Called before sortInstances(), so this array is in insertion order.
    const instances = [...this.instancesById.values()];
    for (const [index, instance] of instances.entries()) {
      const redirectToUrl = this.instanceRedirectToUrl.get(instance.id);
      if (!redirectToUrl) {
        continue;
      }
      // Only match a target that was admitted AFTER the redirecting instance — otherwise the
      // same URL appearing before the redirect can be linked backward, corrupting chains.
      let target: NetworkInstance | undefined;
      for (let candidateIndex = index + 1; candidateIndex < instances.length; candidateIndex += 1) {
        const candidate = instances[candidateIndex];
        if (candidate?.url === redirectToUrl && candidate.redirectFromId === undefined) {
          target = candidate;
          break;
        }
      }
      if (target) {
        instance.redirectToId = target.id;
        target.redirectFromId = instance.id;
      }
    }
  }

  private sortInstances(): void {
    // eslint-disable-next-line no-use-extend-native/no-use-extend-native
    const sorted = [...this.instancesById.entries()].toSorted(([idA, a], [idB, b]) => {
      const offsetA = a.offsetMs ?? Number.POSITIVE_INFINITY;
      const offsetB = b.offsetMs ?? Number.POSITIVE_INFINITY;
      if (offsetA !== offsetB) {
        return offsetA - offsetB;
      }
      const sequenceA = this.instanceSequenceById.get(idA) ?? 0;
      const sequenceB = this.instanceSequenceById.get(idB) ?? 0;
      return sequenceA - sequenceB;
    });

    this.instancesById.clear();
    for (const [id, inst] of sorted) {
      this.instancesById.set(id, inst);
    }
  }

  private assertInvariants(): void {
    const {
      observedInstances,
      retainedInstances,
      instancesDroppedByFilter,
      instancesDroppedByGroupCap,
      instancesDroppedByInstanceCap,
      instancesSuppressedAsDuplicate,
      instancesEvictedAfterAdmission,
    } = this.summary;

    const totalAccounted =
      retainedInstances +
      instancesDroppedByFilter +
      instancesDroppedByGroupCap +
      instancesDroppedByInstanceCap +
      instancesSuppressedAsDuplicate +
      instancesEvictedAfterAdmission;
    if (totalAccounted !== observedInstances) {
      throw new Error(
        `NetworkBuilder invariant: observedInstances ${observedInstances} !== sum of terminal buckets ${totalAccounted}`,
      );
    }

    for (const group of this.groupsById.values()) {
      const expected =
        group.retainedInstanceCount + group.suppressedInstanceCount + group.evictedInstanceCount;
      if (expected !== group.occurrenceCount) {
        throw new Error(
          `NetworkBuilder invariant: group ${group.id} occurrenceCount ${group.occurrenceCount} !== retained+suppressed+evicted ${expected}`,
        );
      }
    }
  }
}
