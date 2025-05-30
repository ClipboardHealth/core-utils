## enforce-ts-rest-in-controllers

This ESLint rule is designed to enforce use of ts-rest in NestJS controllers.

Controller methods must follow these criteria:

1. The `TsRestHandler` decorator should be used with controller methods.
2. Controller methods should only return the result of the `tsRestHandler` method.
3. The decorator and method mentioned above should be imported from `@ts-rest/nest`.

See [BP: REST API](https://www.notion.so/BP-REST-API-f769b7fe745c4cf38f6eca2e9ad8a843) for more information.
