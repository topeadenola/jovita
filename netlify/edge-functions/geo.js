// Tells the app which country a visitor is in, so someone opening Jovita in Abidjan
// sees French and someone in Madrid sees Spanish. Only the two-letter country code is shared.
export default async (request, context) => {
  const res = await context.next();
  const cc = context.geo?.country?.code;
  const type = res.headers.get("content-type") || "";
  if (cc && type.includes("text/html")) {
    res.headers.append("Set-Cookie", `jv_country=${cc}; Path=/; Max-Age=86400; SameSite=Lax; Secure`);
  }
  return res;
};

export const config = { path: "/*", excludedPath: ["/assets/*", "/*.svg", "/*.png", "/*.ico"] };
