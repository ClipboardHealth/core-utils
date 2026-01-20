/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * TDD Cycle Example: Building a UserValidator
 *
 * This file demonstrates the Red-Green-Refactor cycle through
 * progressive test additions and implementations.
 *
 * NOTE: This is an educational example showing TDD evolution.
 * Intermediate functions are intentionally "unused" to show progression.
 */

// =============================================================
// CYCLE 1: Basic Validation
// =============================================================

// RED: Write failing test
// describe("UserValidator", () => {
//   it("returns valid for correct email format", () => {
//     const input = { email: "user@example.com" };
//
//     const actual = validateUser(input);
//
//     expect(actual.isValid).toBe(true);
//   });
// });
// ERROR: validateUser is not defined

// GREEN: Minimal implementation
interface UserInput {
  email: string;
  name?: string;
  age?: number;
}

interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

function validateUser(input: UserInput): ValidationResult {
  return { isValid: true, errors: [] };
}

// REFACTOR: Nothing to refactor yet
// COMMIT: "feat: add basic user validation"

// =============================================================
// CYCLE 2: Invalid Email
// =============================================================

// RED: Write failing test
// it("returns invalid for missing @ in email", () => {
//   const input = { email: "invalid-email" };
//
//   const actual = validateUser(input);
//
//   expect(actual.isValid).toBe(false);
//   expect(actual.errors).toContain("Invalid email format");
// });
// FAIL: Expected false, got true

// GREEN: Add email validation
function validateUserV2(input: UserInput): ValidationResult {
  const errors: string[] = [];

  if (!input.email.includes("@")) {
    errors.push("Invalid email format");
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

// REFACTOR: Extract email validation
function isValidEmail(email: string): boolean {
  return email.includes("@");
}

function validateUserV3(input: UserInput): ValidationResult {
  const errors: string[] = [];

  if (!isValidEmail(input.email)) {
    errors.push("Invalid email format");
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

// COMMIT: "feat: add email format validation"

// =============================================================
// CYCLE 3: Name Validation
// =============================================================

// RED: Write failing test
// it("returns invalid when name is empty string", () => {
//   const input = { email: "user@example.com", name: "" };
//
//   const actual = validateUser(input);
//
//   expect(actual.isValid).toBe(false);
//   expect(actual.errors).toContain("Name cannot be empty");
// });
// FAIL: Expected false, got true

// GREEN: Add name validation
function validateUserV4(input: UserInput): ValidationResult {
  const errors: string[] = [];

  if (!isValidEmail(input.email)) {
    errors.push("Invalid email format");
  }

  if (input.name !== undefined && input.name.trim() === "") {
    errors.push("Name cannot be empty");
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

// REFACTOR: Extract validation rules
interface ValidationRule {
  check(input: UserInput): boolean;
  message: string;
}

function checkEmailValid(input: UserInput): boolean {
  return isValidEmail(input.email);
}

function checkNameValid(input: UserInput): boolean {
  return input.name === undefined || input.name.trim() !== "";
}

const validationRules: ValidationRule[] = [
  { check: checkEmailValid, message: "Invalid email format" },
  { check: checkNameValid, message: "Name cannot be empty" },
];

function validateUserV5(input: UserInput): ValidationResult {
  const errors = validationRules.filter((rule) => !rule.check(input)).map((rule) => rule.message);

  return {
    isValid: errors.length === 0,
    errors,
  };
}

// COMMIT: "feat: add name validation with rule-based system"

// =============================================================
// CYCLE 4: Age Validation (Parameterized)
// =============================================================

// RED: Write failing parameterized tests
// it.each([
//   [17, false, "Age must be 18 or older"],
//   [18, true, null],
//   [0, false, "Age must be 18 or older"],
//   [-1, false, "Age must be positive"],
// ])("age %i returns valid=%s", (age, expectedValid, expectedError) => {
//   const input = { email: "user@example.com", age };
//
//   const actual = validateUser(input);
//
//   expect(actual.isValid).toBe(expectedValid);
//   if (expectedError) {
//     expect(actual.errors).toContain(expectedError);
//   }
// });

// GREEN: Add age validation rules
function checkAgePositive(input: UserInput): boolean {
  return input.age === undefined || input.age > 0;
}

function checkAgeMinimum(input: UserInput): boolean {
  // Skip check if age is undefined or already invalid (non-positive)
  return input.age === undefined || input.age <= 0 || input.age >= 18;
}

// REFACTOR: Order rules by specificity (more specific first)
// and ensure proper short-circuiting for age checks
const orderedValidationRules: ValidationRule[] = [
  { check: checkEmailValid, message: "Invalid email format" },
  { check: checkNameValid, message: "Name cannot be empty" },
  { check: checkAgePositive, message: "Age must be positive" },
  { check: checkAgeMinimum, message: "Age must be 18 or older" },
];

// COMMIT: "feat: add age validation with boundary checks"

// =============================================================
// FINAL IMPLEMENTATION
// =============================================================

function isValidEmailFinal(email: string): boolean {
  return email.includes("@") && email.includes(".");
}

function checkEmailValidFinal(input: UserInput): boolean {
  return isValidEmailFinal(input.email);
}

/**
 * Validates user input according to business rules.
 *
 * Rules:
 * - Email must contain @ and .
 * - Name (if provided) cannot be empty
 * - Age (if provided) must be positive and >= 18
 */
export function validateUserFinal(input: UserInput): ValidationResult {
  const rules: ValidationRule[] = [
    { check: checkEmailValidFinal, message: "Invalid email format" },
    { check: checkNameValid, message: "Name cannot be empty" },
    { check: checkAgePositive, message: "Age must be positive" },
    { check: checkAgeMinimum, message: "Age must be 18 or older" },
  ];

  const errors = rules.filter((rule) => !rule.check(input)).map((rule) => rule.message);

  return {
    isValid: errors.length === 0,
    errors,
  };
}

// =============================================================
// COMPLETE TEST SUITE (what we built through TDD)
// =============================================================

/*
describe("validateUser", () => {
  describe("email validation", () => {
    it("returns valid for correct email format", () => {
      const input = { email: "user@example.com" };
      const actual = validateUserFinal(input);
      expect(actual.isValid).toBe(true);
    });

    it("returns invalid for missing @ in email", () => {
      const input = { email: "invalid-email" };
      const actual = validateUserFinal(input);
      expect(actual.isValid).toBe(false);
      expect(actual.errors).toContain("Invalid email format");
    });

    it("returns invalid for missing . in email", () => {
      const input = { email: "user@domain" };
      const actual = validateUserFinal(input);
      expect(actual.isValid).toBe(false);
      expect(actual.errors).toContain("Invalid email format");
    });
  });

  describe("name validation", () => {
    it("returns valid when name is not provided", () => {
      const input = { email: "user@example.com" };
      const actual = validateUserFinal(input);
      expect(actual.isValid).toBe(true);
    });

    it("returns invalid when name is empty string", () => {
      const input = { email: "user@example.com", name: "" };
      const actual = validateUserFinal(input);
      expect(actual.isValid).toBe(false);
      expect(actual.errors).toContain("Name cannot be empty");
    });
  });

  describe("age validation", () => {
    it.each([
      [17, false, "Age must be 18 or older"],
      [18, true, undefined],
      [0, false, "Age must be positive"],
      [-1, false, "Age must be positive"],
      [undefined, true, undefined],
    ])("age %s returns valid=%s", (age, expectedValid, expectedError) => {
      const input = { email: "user@example.com", age };
      const actual = validateUserFinal(input);
      expect(actual.isValid).toBe(expectedValid);
      if (expectedError) {
        expect(actual.errors).toContain(expectedError);
      }
    });
  });
});
*/
