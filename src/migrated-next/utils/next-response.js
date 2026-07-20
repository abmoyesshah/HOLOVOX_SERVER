export class NextResponse {
  constructor(body = null, init = {}) {
    this.body = body;
    this.status = init.status || 200;
    this.headers = init.headers || {};
  }

  static json(body, init = {}) {
    return new NextResponse(body, {
      ...init,
      headers: {
        "content-type": "application/json",
        ...(init.headers || {}),
      },
    });
  }
}
