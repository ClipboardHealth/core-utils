import { parseJson } from "./parseJson";

describe("parse", () => {
  describe("parseJson", () => {
    it("parses valid JSON string", () => {
      const jsonString = '{"name": "John", "age": 30}';

      const result = parseJson<{ name: string; age: number }>(jsonString);

      expect(result).toEqual({ name: "John", age: 30 });
      expect(result.name).toBe("John");
      expect(result.age).toBe(30);
    });

    it("parses JSON array", () => {
      const jsonString = '[1, 2, 3, "test"]';

      const result = parseJson<Array<string | number>>(jsonString);

      expect(result).toEqual([1, 2, 3, "test"]);
      expect(result).toHaveLength(4);
    });

    it("parses JSON primitives", () => {
      expect(parseJson<string>('"hello"')).toBe("hello");
      expect(parseJson<number>("42")).toBe(42);
      expect(parseJson<boolean>("true")).toBe(true);
      expect(parseJson<boolean>("false")).toBe(false);

      expect(parseJson<null>("null")).toBeNull();
    });

    it("parses nested JSON objects", () => {
      const jsonString = '{"user": {"name": "Jane", "settings": {"theme": "dark"}}}';

      const result = parseJson<{
        user: { name: string; settings: { theme: string } };
      }>(jsonString);

      expect(result.user.name).toBe("Jane");
      expect(result.user.settings.theme).toBe("dark");
    });

    it("returns unknown type when no generic provided", () => {
      const jsonString = '{"key": "value"}';

      const result = parseJson(jsonString);

      // TypeScript should infer this as unknown, but runtime behavior is still correct
      expect(result).toEqual({ key: "value" });
    });

    it("throws SyntaxError for malformed JSON", () => {
      const invalidJson = '{"name": "John", "age":}';

      expect(() => {
        parseJson(invalidJson);
      }).toThrow(SyntaxError);
    });

    it("throws SyntaxError for incomplete JSON", () => {
      const incompleteJson = '{"name": "John"';

      expect(() => {
        parseJson(incompleteJson);
      }).toThrow(SyntaxError);
    });

    it("throws SyntaxError for invalid JSON syntax", () => {
      const invalidSyntax = "{name: 'John'}"; // Single quotes are invalid in JSON

      expect(() => {
        parseJson(invalidSyntax);
      }).toThrow(SyntaxError);
    });

    it("handles empty object and array", () => {
      expect(parseJson<Record<string, unknown>>("{}")).toEqual({});
      expect(parseJson<unknown[]>("[]")).toEqual([]);
    });

    it("handles JSON with whitespace", () => {
      const jsonWithWhitespace = `
        {
          "name": "Alice",
          "age": 25
        }
      `;

      const result = parseJson<{ name: string; age: number }>(jsonWithWhitespace);

      expect(result).toEqual({ name: "Alice", age: 25 });
    });

    it("preserves type safety with generic parameter", () => {
      interface User {
        id: number;
        name: string;
        active: boolean;
      }

      const jsonString = '{"id": 123, "name": "Bob", "active": true}';
      const result = parseJson<User>(jsonString);

      // These should have proper TypeScript types
      expect(typeof result.id).toBe("number");
      expect(typeof result.name).toBe("string");
      expect(typeof result.active).toBe("boolean");

      expect(result.id).toBe(123);
      expect(result.name).toBe("Bob");
      expect(result.active).toBe(true);
    });
  });
});
