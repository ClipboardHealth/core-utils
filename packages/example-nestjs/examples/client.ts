import { initClient, type ServerInferRequest } from "@ts-rest/core";

import { contract } from "../src/contract";

type ListUsersRequest = ServerInferRequest<typeof contract.list>;

const port = process.env["PORT"] ?? 3000;
export const client = initClient(contract, {
  baseUrl: `http://localhost:${port}`,
});

async function main() {
  const query: ListUsersRequest["query"] = {
    page: {
      cursor: "eyJpZCI6IjQ2MDJCNjI5LTg3N0QtNEVCNC1CQzhELTREM0NGNzkzQkM2NSJ9",
      size: 10,
    },
    fields: {
      user: ["age", "dateOfBirth"],
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
  };

  try {
    const { status, body } = await client.list({ query });
    console.debug(status, JSON.stringify(body, undefined, 2));
  } catch (error) {
    console.error("Error occurred:", error);
  }
}

// eslint-disable-next-line unicorn/prefer-top-level-await
void main();
