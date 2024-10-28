import { z } from "zod";

import { createConfig } from "./config";

describe("Config", () => {
  const environment = {
    allowed: ["development", "production"] as const,
    current: "development",
  } as const;

  const schema = z.object({
    age: z.number(),
    name: z.string(),
  });

  describe("construction", () => {
    it("validates values during construction", () => {
      const config = createConfig({
        config: {
          age: {
            defaultValue: 30,
            description: "An age.",
          },
          name: {
            defaultValue: "Alice",
            description: "A name.",
          },
        },
        environment,
        schema,
      });

      const { age, name } = config;

      expect(name).toBe("Alice");
      expect(age).toBe(30);
    });

    it("throws when values don't match schema", () => {
      expect(() =>
        createConfig({
          config: {
            age: {
              defaultValue: 30,
              description: "An age.",
            },
            name: {
              // @ts-expect-error: Should be string
              defaultValue: 123,
              description: "A name.",
            },
          },
          environment,
          schema,
        }),
      ).toThrow("Expected string, received number");
    });
  });

  describe("environment variables", () => {
    const OLD_ENV = process.env;

    beforeEach(() => {
      jest.resetModules();
      process.env = { ...OLD_ENV };
    });

    afterEach(() => {
      process.env = OLD_ENV;
    });

    it("uses environment variables when available", () => {
      process.env["NAME"] = "Bob";

      const config = createConfig({
        config: {
          age: {
            defaultValue: 30,
            description: "An age.",
          },
          name: {
            defaultValue: "Alice",
            description: "A name.",
          },
        },
        environment,
        schema,
      });

      const { name } = config;
      expect(name).toBe("Bob");
    });
  });

  describe("nested objects", () => {
    const nestedSchema = z.object({
      user: z.object({
        age: z.number(),
        name: z.string(),
      }),
    });

    it("handles nested objects", () => {
      const config = createConfig({
        config: {
          user: {
            age: {
              defaultValue: 30,
              description: "An age.",
            },
            name: {
              defaultValue: "Alice",
              description: "A name.",
            },
          },
        },
        environment,
        schema: nestedSchema,
      });

      const { user } = config;
      expect(user.name).toBe("Alice");
      expect(user.age).toBe(30);
    });
  });

  describe("immutability", () => {
    it("prevents modification of config values", () => {
      const config = createConfig({
        config: {
          age: {
            defaultValue: 30,
            description: "An age.",
          },
          name: {
            defaultValue: "Alice",
            description: "A name.",
          },
        },
        environment,
        schema,
      });

      expect(() => {
        // @ts-expect-error: Cannot assign to 'name' because it is a read-only property
        config.name = "Bob";
      }).toThrow("Cannot assign to read only property 'name'");

      expect(config.name).toBe("Alice");
    });

    it("prevents modification of nested config values", () => {
      const nestedSchema = z.object({
        database: z.object({
          connection: z.object({
            host: z.string(),
            port: z.number(),
          }),
        }),
      });

      const config = createConfig({
        config: {
          database: {
            connection: {
              host: {
                defaultValue: "localhost",
                description: "Database host",
              },
              port: {
                defaultValue: 5432,
                description: "Database port",
              },
            },
          },
        },
        environment,
        schema: nestedSchema,
      });

      expect(() => {
        config.database.connection.port = 3306;
      }).toThrow("Cannot assign to read only property 'port'");

      expect(() => {
        config.database.connection.host = "host";
      }).toThrow("Cannot assign to read only property 'host'");

      expect(config.database.connection.port).toBe(5432);
      expect(config.database.connection.host).toBe("localhost");
    });

    it("prevents modification of array elements", () => {
      const arraySchema = z.object({
        hosts: z.array(z.string()),
      });

      const config = createConfig({
        config: {
          hosts: {
            defaultValue: ["host1", "host2"],
            description: "List of hosts",
          },
        },
        environment,
        schema: arraySchema,
      });

      expect(() => {
        config.hosts[0] = "host";
      }).toThrow("Cannot assign to read only property '0'");

      expect(() => {
        config.hosts.push("host");
      }).toThrow("Cannot add property 2, object is not extensible");

      expect(config.hosts).toEqual(["host1", "host2"]);
    });
  });
});
