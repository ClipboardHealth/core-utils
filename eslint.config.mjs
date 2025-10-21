import nx from "@nx/eslint-plugin";
import globals from "globals";
import parser from "jsonc-eslint-parser";
import baseConfig from "./packages/eslint-config/src/index.js";

export default [
{
    ignores: [
        "**/coverage/",
        "**/dist/",
        "**/node_modules/",
    ],
},
{
    plugins: {
        "@nx": nx,
    },

    rules: {
        "@nx/enforce-module-boundaries": ["error", {
            allow: [],
            allowCircularSelfDependency: true,
            banTransitiveDependencies: true,

            depConstraints: [{
                sourceTag: "*",
                onlyDependOnLibsWithTags: ["*"],
            }],

            enforceBuildableLibDependency: true,
        }],
    },
}, ...baseConfig, {
    files: ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx"],

    rules: {
        "unicorn/filename-case": ["error", {
            case: "camelCase",
        }],
    },
}, {
    files: ["**/*.spec.ts", "**/*.spec.tsx", "**/*.spec.js", "**/*.spec.jsx"],

    languageOptions: {
        globals: {
            ...globals.jest,
        },
    },

    rules: {},
}, {
    files: ["./examples/**/*.ts"],

    rules: {
        "no-console": "off",
    },
}, {
    files: ["**/package.json"],

    languageOptions: {
        parser: parser,
    },

    rules: {
        "@nx/dependency-checks": "error",
    },
}];