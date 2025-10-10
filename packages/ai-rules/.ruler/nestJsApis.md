# NestJS APIs

- Use a three-tier architecture:
  - Controllers in the entrypoints tier translate from data transfer objects (DTOs) to domain objects (DOs) and call the logic tier.
  - Logic tier services call other services in the logic tier and repos and gateways at the data tier. The logic tier operates only on DOs.
  - Data tier repos translate from DOs to data access objects (DAOs), call the database using either Prisma for Postgres or Mongoose for MongoDB, and then translate from DAOs to DOs before returning to the logic tier.
- Use ts-rest to define contracts using Zod schemas, one contract per resource.
- A controller implements each ts-rest contract.
- Requests and responses follow the JSON:API specification, including pagination for listings.
- Use TypeDoc to document public functions, classes, methods, and complex code blocks.
