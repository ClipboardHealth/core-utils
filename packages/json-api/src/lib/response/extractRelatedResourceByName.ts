  import { JsonApiResource } from "../types";
  /**
   * Extracts a related resource from the included array of a JSON:API response
   * based on the relationship name.
   *
   * @param resource - The main resource containing the relationships.
   * @param included - The included array from a JSON:API response.
   * @param relationshipName - The name of the relationship to extract.
   * @returns The related resource if found, otherwise undefined.
   */
  export function extractRelatedResourceByName(
    resource: JsonApiResource,
    included: JsonApiResource[] | undefined,
    relationshipName: string
  ): JsonApiResource | JsonApiResource[] | undefined {
    if (!resource.relationships || !included) {
      return undefined;
    }
  
    const relationship = resource.relationships[relationshipName];
    if (!relationship?.data) {
      return undefined;
    }
  
    if (Array.isArray(relationship.data)) {
      return relationship.data
        .map((data) =>
          included?.find(
            (includedResource) =>
              includedResource.type === data.type && includedResource.id === data.id
          )
        )
        .filter((element) => !!element);
    }
  
    const { type, id } = relationship.data;
  
    return included.find(
      (includedResource) => includedResource.type === type && includedResource.id === id
    );
  }