export default {
  async fetch(request) {
    const url = new URL(request.url);
    return new Response(
      JSON.stringify({ error: { code: "NOT_FOUND", message: `No existe ${request.method} ${url.pathname}` } }),
      { status: 404, headers: { "Content-Type": "application/json" } }
    );
  },
};
