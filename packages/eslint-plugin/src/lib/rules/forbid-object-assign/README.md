## forbid-object-assign

This ESLint rule is designed to disallow the use of `Object.assign` where the return value is used.

An example of how this could be confusing:

```ts
const original = { name: "User", age: 20 };
const copy = Object.assign(original, { name: "User2" });

console.log(copy); // prints { name: 'User2', age: 20 }
console.log(original); // prints { name: 'User2', age: 20 }
console.log(copy === original); // prints true. copy and original both have the same reference.
```

It may be confusing or unclear that `original` has been modified. Another point of confusion is that `copy` is not a
copy of the values of `original`, it's the same reference. So, even if you meant to mutate the original object, any
further mutations to `copy` will continue to mutate `original.` This can lead to confusing behavior. To prevent all of
that, this rule disallows `Object.assign` where its return is used.

Specifically, this rule forbids usages of `Object.assign` such as:

1. Direct return such as `return Object.assign(x, {a:2});`
2. Variable declaration such as `const y = Object.assign(x, {a:2});`
3. Variable assignment such as `let y; y = Object.assign(x, {a:2});`
4. Member usage such as `Object.assign(x, {a:2}).b;` '
5. Usage in template literals such as ```${Object.assign(x, {a:2})}` ``
6. Usage in arrays literals such as `[Object.assign(x, {a:2})]`

The recommendation for the above code example would be to use the spread operator instead:

```ts
const original = { name: "User", age: 20 };
const copy = { ...original, name: "User2" };

console.log(copy); // prints { name: 'User2', age: 20 }
console.log(original); // prints { name: 'User', age: 20 } It is unmodified
console.log(copy === original); // prints false, of course the references are different
```

You can still use `Object.assign` as a pure assignment operation. For now:

```ts
const original = { name: "User", age: 20 };
Object.assign(original, { addThisProperty: "fun" }); // allowed by this rule, for now
```
