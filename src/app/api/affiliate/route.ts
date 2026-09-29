function comingSoon() {
  return Response.json(
    { message: "Coming soon. This feature is not available yet." },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}
export const GET = comingSoon;
export const POST = comingSoon;
