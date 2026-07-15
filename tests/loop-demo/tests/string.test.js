import { capitalize, reverse, truncate } from "../utils/string.js";

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

// capitalize
test("capitalize('hello') === 'Hello'", () => console.assert(capitalize("hello") === "Hello"));
test("capitalize('Hello') === 'Hello'", () => console.assert(capitalize("Hello") === "Hello"));
test("capitalize('') === ''", () => console.assert(capitalize("") === ""));
test("capitalize('a') === 'A'", () => console.assert(capitalize("a") === "A"));

// reverse
test("reverse('abc') === 'cba'", () => console.assert(reverse("abc") === "cba"));
test("reverse('') === ''", () => console.assert(reverse("") === ""));
test("reverse('a') === 'a'", () => console.assert(reverse("a") === "a"));
test("reverse('hello') === 'olleh'", () => console.assert(reverse("hello") === "olleh"));

// truncate
test("truncate('hello', 10) === 'hello'", () => console.assert(truncate("hello", 10) === "hello"));
test("truncate('hello', 5) === 'hello'", () => console.assert(truncate("hello", 5) === "hello"));
test("truncate('hello', 3) === 'hel...'", () => console.assert(truncate("hello", 3) === "hel..."));
test("truncate('hello world', 8) === 'hello wo...'", () => console.assert(truncate("hello world", 8) === "hello wo..."));

console.log(`\n${passed} passed, ${failed} failed (${passed + failed} total)`);
