import { toJsonApiQuery } from "@clipboard-health/json-api";

const searchParams = new URLSearchParams(
  "fields%5Bdog%5D=age%2Cname&filter%5Bage%5D=2%2C5&include=vet&page%5Bsize%5D=10&sort=-age",
);

console.log(toJsonApiQuery(searchParams));
// => {
//   fields: { dog: ["age", "name"] },
//   filter: { age: ["2", "5"] },
//   include: ["vet"],
//   page: { size: "10" },
//   sort: ["-age"],
// }
