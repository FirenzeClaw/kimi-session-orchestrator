import { add, multiply, divide, sum } from "../utils/math.js";

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
  } catch (e) {
    failed++;
    console.error(`FAIL: ${name} — ${e.message}`);
  }
}

// add
test("add(1, 2) === 3", () => console.assert(add(1, 2) === 3));
test("add(-1, 1) === 0", () => console.assert(add(-1, 1) === 0));
test("add(0, 0) === 0", () => console.assert(add(0, 0) === 0));

// multiply
test("multiply(2, 3) === 6", () => console.assert(multiply(2, 3) === 6));
test("multiply(0, 5) === 0", () => console.assert(multiply(0, 5) === 0));
test("multiply(-2, 3) === -6", () => console.assert(multiply(-2, 3) === -6));

// divide
test("divide(6, 2) === 3", () => console.assert(divide(6, 2) === 3));
test("divide(5, 2) === 2.5", () => console.assert(divide(5, 2) === 2.5));
test("divide(-6, 2) === -3", () => console.assert(divide(-6, 2) === -3));
test("divide(0, 5) === 0", () => console.assert(divide(0, 5) === 0));
test("divide(1, 0) throws", () => {
  let threw = false;
  try {
    divide(1, 0);
  } catch (e) {
    threw = true;
  }
  console.assert(threw, "Expected divide by zero to throw");
});

// sum
test("sum([1, 2, 3]) === 6", () => console.assert(sum([1, 2, 3]) === 6));
test("sum([]) === 0", () => console.assert(sum([]) === 0));
test("sum([42]) === 42", () => console.assert(sum([42]) === 42));
test("sum([-1, 1]) === 0", () => console.assert(sum([-1, 1]) === 0));

console.log(`\n${passed} passed, ${failed} failed (${passed + failed} total)`);
