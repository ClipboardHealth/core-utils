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

ruleTester.run("no-cross-module-repository-usage", rule, {
  valid: [
    {
      name: "Module file exporting service instead of repository",
      filename: "/src/modules/user/user.module.ts",
      code: `
        import { Module } from "@nestjs/common";
        import { UserService } from "./logic/user.service";
        import { UserRepository } from "./data/user.repository";
        
        @Module({
          providers: [UserService, UserRepository],
          exports: [UserService],
        })
        export class UserModule {}
      `,
    },
    {
      name: "Same-module repository usage in service",
      filename: "/src/modules/user/logic/user.service.ts",
      code: `
        import { Injectable } from "@nestjs/common";
        import { UserRepository } from "../data/user.repository";
        
        @Injectable()
        export class UserService {
          constructor(private readonly userRepository: UserRepository) {}
        }
      `,
    },
    {
      name: "Same-directory repository import",
      filename: "/src/modules/user/logic/user.service.ts",
      code: `
        import { Injectable } from "@nestjs/common";
        import { UserRepository } from "./user.repository";
        
        @Injectable()
        export class UserService {
          constructor(private readonly userRepository: UserRepository) {}
        }
      `,
    },
    {
      name: "Non-repository class with Repo in name",
      filename: "/src/modules/user/logic/user.service.ts",
      code: `
        import { Injectable } from "@nestjs/common";
        import { ReportService } from "../other/report.service";
        
        @Injectable()
        export class UserService {
          constructor(private readonly reportService: ReportService) {}
        }
      `,
    },
    {
      name: "Repository import without cross-module usage",
      filename: "/src/modules/user/logic/user.service.ts",
      code: `
        import { Injectable } from "@nestjs/common";
        import { UserRepository } from "../data/user.repository";
        
        @Injectable()
        export class UserService {
          private someMethod() {
          }
        }
      `,
    },
    {
      name: "Module without exports property",
      filename: "/src/modules/user/user.module.ts",
      code: `
        import { Module } from "@nestjs/common";
        import { UserRepository } from "./data/user.repository";
        
        @Module({
          providers: [UserRepository],
        })
        export class UserModule {}
      `,
    },
  ],
  invalid: [
    {
      name: "Module exporting repository",
      filename: "/src/modules/user/user.module.ts",
      code: `
        import { Module } from "@nestjs/common";
        import { UserRepository } from "./data/user.repository";
        
        @Module({
          providers: [UserRepository],
          exports: [UserRepository],
        })
        export class UserModule {}
      `,
      errors: [
        {
          messageId: "moduleExportsRepository",
          line: 7,
          column: 21,
        },
      ],
    },
    {
      name: "Cross-module repository import",
      filename: "/src/modules/order/logic/order.service.ts",
      code: `
        import { Injectable } from "@nestjs/common";
        import { UserRepository } from "../../user/data/user.repository";
        
        @Injectable()
        export class OrderService {
          constructor(private readonly userRepository: UserRepository) {}
        }
      `,
      errors: [
        {
          messageId: "crossModuleRepositoryImport",
          line: 3,
          column: 18,
        },
        {
          messageId: "crossModuleRepositoryInjection",
          line: 7,
          column: 40,
        },
      ],
    },
    {
      name: "Cross-module repository injection with @Inject",
      filename: "/src/modules/order/logic/order.service.ts",
      code: `
        import { Injectable, Inject } from "@nestjs/common";
        import { UserRepository } from "../../user/data/user.repository";
        
        @Injectable()
        export class OrderService {
          constructor(
            @Inject(UserRepository) private readonly userRepo: UserRepository,
          ) {}
        }
      `,
      errors: [
        {
          messageId: "crossModuleRepositoryImport",
          line: 3,
          column: 18,
        },
        {
          messageId: "crossModuleRepositoryInjection",
          line: 8,
          column: 21,
        },
        {
          messageId: "crossModuleRepositoryInjection",
          line: 8,
          column: 54,
        },
      ],
    },
    {
      name: "Regular parameter with @Inject decorator",
      filename: "/src/modules/order/logic/order.service.ts",
      code: `
        import { Injectable, Inject } from "@nestjs/common";
        import { UserRepository } from "../../user/data/user.repository";
        
        @Injectable()
        export class OrderService {
          constructor(
            @Inject(UserRepository) userRepo: UserRepository,
          ) {}
        }
      `,
      errors: [
        {
          messageId: "crossModuleRepositoryImport",
          line: 3,
          column: 18,
        },
        {
          messageId: "crossModuleRepositoryInjection",
          line: 8,
          column: 21,
        },
        {
          messageId: "crossModuleRepositoryInjection",
          line: 8,
          column: 21,
        },
      ],
    },
    {
      name: "Multiple repository exports",
      filename: "/src/modules/user/user.module.ts",
      code: `
        import { Module } from "@nestjs/common";
        import { UserRepository } from "./data/user.repository";
        import { ProfileRepo } from "./data/profile.repo";
        
        @Module({
          providers: [UserRepository, ProfileRepo],
          exports: [UserRepository, ProfileRepo],
        })
        export class UserModule {}
      `,
      errors: [
        {
          messageId: "moduleExportsRepository",
          line: 8,
          column: 21,
        },
        {
          messageId: "moduleExportsRepository",
          line: 8,
          column: 37,
        },
      ],
    },
    {
      name: "Repository file import pattern",
      filename: "/src/modules/order/logic/order.service.ts",
      code: `
        import { Injectable } from "@nestjs/common";
        import { UserRepo } from "../../user/repository/user.repo";
        
        @Injectable()
        export class OrderService {
          constructor(private readonly userRepo: UserRepo) {}
        }
      `,
      errors: [
        {
          messageId: "crossModuleRepositoryImport",
          line: 3,
          column: 18,
        },
        {
          messageId: "crossModuleRepositoryInjection",
          line: 7,
          column: 40,
        },
      ],
    },
  ],
});
