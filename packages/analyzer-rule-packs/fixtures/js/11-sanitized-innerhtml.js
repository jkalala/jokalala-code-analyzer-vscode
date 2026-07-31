/**
 * Safe sink / twin-guard fixture — must NOT fire under precision suppressions.
 */
const dirty = userInput;
el.innerHTML = DOMPurify.sanitize(dirty);
