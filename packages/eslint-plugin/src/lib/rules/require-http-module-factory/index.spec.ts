import { TSESLint } from "@typescript-eslint/utils";

import rule from "./index";

// eslint-disable-next-line n/no-unpublished-require
const parser = require.resolve("@typescript-eslint/parser");

const ruleTester = new TSESLint.RuleTester({
  parser,
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: "module",
  },
});

ruleTester.run("require-http-module-factory", rule, {
  valid: [
    {
      name: "HttpModule with registerAsync factory",
      code: `
        import { HttpModule } from "@nestjs/axios";
        import { Module } from "@nestjs/common";
        
        @Module({
          imports: [
            HttpModule.registerAsync({
              useFactory: () => ({ baseURL: "https://api.example.com" }),
            }),
          ],
        })
        export class TestModule {}
      `,
    },
    {
      name: "HttpModule with registerAsync and inject",
      code: `
        import { HttpModule } from "@nestjs/axios";
        import { Module } from "@nestjs/common";
        import { ConfigService } from "@nestjs/config";
        
        @Module({
          imports: [
            HttpModule.registerAsync({
              inject: [ConfigService],
              useFactory: (configService: ConfigService) => ({
                baseURL: configService.get("API_BASE_URL"),
              }),
            }),
          ],
        })
        export class TestModule {}
      `,
    },
    {
      name: "HttpModule in providers array (allowed)",
      code: `
        import { HttpModule } from "@nestjs/axios";
        import { Module } from "@nestjs/common";
        
        @Module({
          imports: [],
          providers: [HttpModule],
        })
        export class TestModule {}
      `,
    },
    {
      name: "Module without HttpModule import",
      code: `
        import { Module } from "@nestjs/common";
        
        @Module({
          imports: [],
        })
        export class TestModule {}
      `,
    },
    {
      name: "HttpModule imported but not used",
      code: `
        import { HttpModule } from "@nestjs/axios";
        import { Module } from "@nestjs/common";
        
        @Module({
          imports: [],
        })
        export class TestModule {}
      `,
    },
    {
      name: "Different module with same name",
      code: `
        import { HttpModule } from "some-other-package";
        import { Module } from "@nestjs/common";
        
        @Module({
          imports: [HttpModule],
        })
        export class TestModule {}
      `,
    },
    {
      name: "HttpModule with alias using registerAsync",
      code: `
        import { HttpModule as NestHttpModule } from "@nestjs/axios";
        import { Module } from "@nestjs/common";
        
        @Module({
          imports: [
            NestHttpModule.registerAsync({
              useFactory: () => ({}),
            }),
          ],
        })
        export class TestModule {}
      `,
    },
  ],
  invalid: [
    {
      name: "Direct HttpModule import",
      code: `
        import { HttpModule } from "@nestjs/axios";
        import { Module } from "@nestjs/common";
        
        @Module({
          imports: [HttpModule],
        })
        export class TestModule {}
      `,
      errors: [
        {
          messageId: "requireFactory",
          line: 6,
          column: 21,
        },
      ],
    },
    {
      name: "HttpModule with alias used directly",
      code: `
        import { HttpModule as NestHttpModule } from "@nestjs/axios";
        import { Module } from "@nestjs/common";
        
        @Module({
          imports: [NestHttpModule],
        })
        export class TestModule {}
      `,
      errors: [
        {
          messageId: "requireFactory",
          line: 6,
          column: 21,
        },
      ],
    },
    {
      name: "Multiple imports with HttpModule direct usage",
      code: `
        import { HttpModule } from "@nestjs/axios";
        import { Module } from "@nestjs/common";
        import { ConfigModule } from "@nestjs/config";
        
        @Module({
          imports: [
            ConfigModule.forRoot(),
            HttpModule,
          ],
        })
        export class TestModule {}
      `,
      errors: [
        {
          messageId: "requireFactory",
          line: 9,
          column: 13,
        },
      ],
    },
    {
      name: "HttpModule direct usage with other valid modules",
      code: `
        import { HttpModule } from "@nestjs/axios";
        import { Module } from "@nestjs/common";
        import { TypeOrmModule } from "@nestjs/typeorm";
        
        @Module({
          imports: [
            TypeOrmModule.forFeature([]),
            HttpModule,
            TypeOrmModule.forRoot(),
          ],
        })
        export class TestModule {}
      `,
      errors: [
        {
          messageId: "requireFactory",
          line: 9,
          column: 13,
        },
      ],
    },
  ],
});
