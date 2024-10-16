import { initClient } from "@ts-rest/core";

import { contract } from "../src/contract";

export const client = initClient(contract, {
  baseUrl: "http://localhost:3000",
});

async function main() {
  const query = {
    page: {
      cursor: "1",
      size: 10,
    },
    fields: {
      user: "age,dateOfBirth",
    },
    filter: {
      age: {
        gt: [2],
      },
      dateOfBirth: {
        gte: [new Date("2016-01-01")],
      },
      isActive: {
        eq: ["true"],
      },
    },
  } as const;

  try {
    const { status, body } = await client.tests({ query });
    console.debug(status, JSON.stringify(body, undefined, 2));
  } catch (error) {
    console.error("Error occurred:", error);
  }
}

// eslint-disable-next-line unicorn/prefer-top-level-await
void main();
