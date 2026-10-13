export async function readJsonResponse(response, context) {
  const body = await response.text();

  try {
    return JSON.parse(body);
  } catch {
    const contentType = response.headers?.get?.("content-type") || "unknown";
    const preview = body.trim().replace(/\s+/g, " ").slice(0, 160);
    throw new Error(
      `${context} returned a non-JSON response (HTTP ${response.status}, ${contentType}).${
        preview ? ` Response: ${preview}` : ""
      }`,
    );
  }
}
