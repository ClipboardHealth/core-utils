import { extractRelatedResourceByName } from "./jsonApiHelpers";

describe("extractRelatedResourceByName", () => {
  it("should return undefined if relationships are undefined", () => {
    const apiResponse = {
      data: {
        type: "book",
        id: "1",
      },
    };
    const result = extractRelatedResourceByName(apiResponse.data, undefined, "author");
    expect(result).toBeUndefined();
  });

  it("should return undefined if included array is undefined", () => {
    const apiResponse = {
      data: {
        type: "book",
        id: "1",
        relationships: {
          author: { data: { type: "person", id: "1" } },
          editor: { data: { type: "person", id: "2" } },
        },
      },
    };
    const result = extractRelatedResourceByName(apiResponse.data, undefined, "author");
    expect(result).toBeUndefined();
  });

  it("should return the related resource when relationship data is a single object", () => {
    const apiResponse = {
      data: {
        type: "book",
        id: "1",
        relationships: {
          author: { data: { type: "person", id: "1" } },
          editor: { data: { type: "person", id: "2" } },
        },
      },
      included: [
        { type: "person", id: "1", attributes: { name: "John Doe" } },
        { type: "person", id: "2", attributes: { name: "Jane Doe 2" } },
      ],
    };
    const result = extractRelatedResourceByName(apiResponse.data, apiResponse.included, "author");
    expect(result).toEqual({ type: "person", id: "1", attributes: { name: "John Doe" } });

    const result2 = extractRelatedResourceByName(apiResponse.data, apiResponse.included, "editor");
    expect(result2).toEqual({ type: "person", id: "2", attributes: { name: "Jane Doe 2" } });
  });

  it("should return an array of related resources when relationship data is an array", () => {
    const apiResponse = {
      data: {
        type: "post",
        id: "1",
        relationships: {
          comments: {
            data: [
              { type: "comment", id: "1" },
              { type: "comment", id: "2" },
            ],
          },
        },
      },
      included: [
        { type: "comment", id: "1", attributes: { text: "Great post!" } },
        { type: "comment", id: "2", attributes: { text: "Thanks for sharing!" } },
      ],
    };
    const result = extractRelatedResourceByName(apiResponse.data, apiResponse.included, "comments");
    expect(result).toEqual([
      { type: "comment", id: "1", attributes: { text: "Great post!" } },
      { type: "comment", id: "2", attributes: { text: "Thanks for sharing!" } },
    ]);
  });

  it("should return undefined if the relationship name does not exist", () => {
    const apiResponse = {
      data: {
        type: "book",
        id: "1",
        relationships: {
          author: { data: { type: "person", id: "1" } },
        },
      },
      included: [{ type: "person", id: "1", attributes: { name: "John Doe" } }],
    };
    const result = extractRelatedResourceByName(apiResponse.data, apiResponse.included, "editor");
    expect(result).toBeUndefined();
  });

  // Ideally this is server error and responsibility of the server to return the correct data, but it's good to have a test for it
  it("should return undefined if no matching included resource is found", () => {
    const apiResponse = {
      data: {
        type: "book",
        id: "1",
        relationships: { author: { data: { type: "person", id: "2" } } },
      },
      included: [{ type: "person", id: "1", attributes: { name: "John Doe" } }],
    };
    const result = extractRelatedResourceByName(apiResponse.data, apiResponse.included, "author");
    expect(result).toBeUndefined();
  });
});
