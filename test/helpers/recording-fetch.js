/** Queue real Response objects, errors or async handlers. No network access. */
export function recordingFetch(t, ...steps) {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const call = { url, ...options, headers: { ...options.headers } };
    calls.push(call);
    if (!steps.length) {
      throw new Error(`Unexpected extra HTTP attempt: ${url}`);
    }
    const step = steps.shift();
    if (step instanceof Error) throw step;
    return typeof step === 'function' ? step(call) : step;
  });
  return calls;
}

export function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
