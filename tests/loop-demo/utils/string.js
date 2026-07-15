export function capitalize(s) {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function reverse(s) {
  return s.split("").reverse().join("");
}

export function truncate(s, n) {
  if (s.length <= n) return s;
  return s.slice(0, n) + "...";
}
