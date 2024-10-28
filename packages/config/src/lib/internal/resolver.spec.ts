import { z } from "zod";

import { resolve } from "./resolver";

describe("resolver", () => {
  const schema = z.object({
    database: z.object({
      host: z.string(),
      port: z.coerce.number(),
    }),
    holidays: z.array(z.coerce.date()),
  });
  const params = {
    environment: "development",
    path: [],
    schema,
  };

  it("resolves defaultValue", () => {
    const config = {
      database: {
        host: {
          defaultValue: "localhost",
          description: "Database host",
        },
        port: {
          defaultValue: 5432,
          description: "Database port",
        },
      },
      holidays: {
        defaultValue: [new Date("2024-01-01")],
        description: "Holidays",
      },
    };

    const actual = resolve({ ...params, config });

    expect(actual).toEqual({
      database: {
        host: "localhost",
        port: 5432,
      },
      holidays: [new Date("2024-01-01")],
    });
  });

  it("resolves environment overrides", () => {
    const config = {
      database: {
        host: {
          defaultValue: "localhost",
          description: "Database host",
          overrides: {
            development: "dev-host",
          },
        },
        port: {
          defaultValue: 5432,
          description: "Database port",
          overrides: {
            development: 5433,
          },
        },
      },
      holidays: {
        defaultValue: [],
        description: "Holidays",
        overrides: {
          development: [new Date("2024-01-01")],
        },
      },
    };

    const actual = resolve({ ...params, config });

    expect(actual).toEqual({
      database: {
        host: "dev-host",
        port: 5433,
      },
      holidays: [new Date("2024-01-01")],
    });
  });

  it("resolves environment variables", () => {
    process.env["HOLIDAYS"] = '["2024-01-01"]';
    process.env["DATABASE_HOST"] = "env-host";
    process.env["DATABASE_PORT"] = "5434";

    const config = {
      database: {
        host: {
          defaultValue: "localhost",
          description: "Database host",
        },
        port: {
          defaultValue: 5432,
          description: "Database port",
        },
      },
      holidays: {
        defaultValue: [],
        description: "Holidays",
      },
    };

    const actual = resolve({ ...params, config });

    expect(actual).toEqual({
      database: {
        host: "env-host",
        port: "5434",
      },
      holidays: ["2024-01-01"],
    });

    delete process.env["HOLIDAYS"];
    delete process.env["DATABASE_HOST"];
    delete process.env["DATABASE_PORT"];
  });

  it("handles non-object schemas", () => {
    const config = {
      items: {
        defaultValue: ["item1", "item2"],
        description: "Array items",
      },
    };

    process.env["ITEMS"] = '["override1", "override2"]';

    const actual = resolve({ ...params, config, schema: z.object({ items: z.array(z.string()) }) });

    expect(actual).toEqual({
      items: ["override1", "override2"],
    });

    delete process.env["ITEMS"];
  });

  describe("array parsing", () => {
    it("parses JSON string arrays from environment", () => {
      process.env["ITEMS"] = '["a", "b", "c"]';

      const config = {
        items: {
          defaultValue: [],
          description: "Array items",
        },
      };

      const actual = resolve({
        ...params,
        config,
        schema: z.object({ items: z.array(z.string()) }),
      });

      expect(actual).toEqual({
        items: ["a", "b", "c"],
      });

      delete process.env["ITEMS"];
    });

    it("returns original string when JSON parsing fails", () => {
      process.env["ITEMS"] = "not-json";

      const config = {
        items: {
          defaultValue: [],
          description: "Array items",
        },
      };

      const actual = resolve({
        ...params,
        config,
        schema: z.object({ items: z.array(z.string()) }),
      });

      expect(actual).toEqual({
        items: "not-json",
      });

      delete process.env["ITEMS"];
    });

    it("returns original value for non-array schemas", () => {
      const config = {
        value: {
          defaultValue: "",
          description: "String value",
        },
      };

      process.env["VALUE"] = "123";

      const actual = resolve({ ...params, config, schema: z.object({ value: z.string() }) });

      expect(actual).toEqual({
        value: "123",
      });

      delete process.env["VALUE"];
    });
  });

  describe("environment variable names", () => {
    it("converts camelCase to UPPER_SNAKE_CASE", () => {
      process.env["DATE_ARRAY"] = '["2024-01-01"]';
      process.env["MAX_RETRY_COUNT"] = "5";
      process.env["DATABASE_HOST_NAME"] = "localhost";
      process.env["DATABASE_MAX_CONNECTIONS"] = "10";

      const config = {
        database: {
          hostName: {
            defaultValue: "default-host",
            description: "Database host",
          },
          maxConnections: {
            defaultValue: 5,
            description: "Max connections",
          },
        },
        dateArray: {
          defaultValue: [],
          description: "Date array",
        },
        maxRetryCount: {
          defaultValue: 3,
          description: "Max retry count",
        },
      };

      const actual = resolve({
        ...params,
        config,
        schema: z.object({
          database: z.object({
            hostName: z.string(),
            maxConnections: z.number(),
          }),
          dateArray: z.array(z.string()),
          maxRetryCount: z.number(),
        }),
      });

      expect(actual).toEqual({
        database: {
          hostName: "localhost",
          maxConnections: "10",
        },
        dateArray: ["2024-01-01"],
        maxRetryCount: "5",
      });

      delete process.env["DATE_ARRAY"];
      delete process.env["MAX_RETRY_COUNT"];
      delete process.env["DATABASE_HOST_NAME"];
      delete process.env["DATABASE_MAX_CONNECTIONS"];
    });

    it("handles environment variables without prefix", () => {
      process.env["DATE_ARRAY"] = '["2024-01-01"]';
      const config = {
        dateArray: {
          defaultValue: [],
          description: "Date array",
        },
      };

      const actual = resolve({
        ...params,
        config,
        schema: z.object({ dateArray: z.array(z.string()) }),
      });

      expect(actual).toEqual({
        dateArray: ["2024-01-01"],
      });

      delete process.env["DATE_ARRAY"];
    });
  });
});
