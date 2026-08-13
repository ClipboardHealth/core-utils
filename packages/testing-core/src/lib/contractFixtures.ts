import type { z } from "zod";

interface BuildContractFixtureRequest<Input, Output> {
  fixture: Input;
  schema: z.ZodType<Output, z.ZodTypeDef, Input>;
}

interface CreateContractFixtureBuilderRequest<Input extends object, Output> {
  defaults: Input;
  schema: z.ZodType<Output, z.ZodTypeDef, Input>;
}

export function buildContractFixture<Input, Output>({
  fixture,
  schema,
}: BuildContractFixtureRequest<Input, Output>): Output {
  return schema.parse(fixture);
}

export function createContractFixtureBuilder<Input extends object, Output>({
  defaults,
  schema,
}: CreateContractFixtureBuilderRequest<Input, Output>): (overrides?: Partial<Input>) => Output {
  return (overrides = {}): Output =>
    buildContractFixture({ fixture: { ...defaults, ...overrides }, schema });
}
