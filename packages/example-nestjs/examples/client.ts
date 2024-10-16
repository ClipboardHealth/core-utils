import { initClient } from "@ts-rest/core";

import { contract } from "../src/contract";

export const client = initClient(contract, {
  baseUrl: "http://localhost:3000",
});

async function main() {
  const { status, body } = await client.tests({
    query: {
      page: {
        cursor: "1",
        size: 10,
      },
      fields: {
        user: "age,name",
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
    },
  });

  console.log(status, body);
}

// eslint-disable-next-line unicorn/prefer-top-level-await
void main();
