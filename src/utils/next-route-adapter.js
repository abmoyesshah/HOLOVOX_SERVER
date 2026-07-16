import multer from "multer";

const upload = multer({ storage: multer.memoryStorage() });

function createHeaders(headers) {
  return {
    get(name) {
      const value = headers[name.toLowerCase()];
      if (Array.isArray(value)) return value.join(", ");
      return value || "";
    },
  };
}

function createFile(file) {
  return {
    name: file.originalname,
    type: file.mimetype,
    size: file.size,
    async arrayBuffer() {
      return file.buffer.buffer.slice(
        file.buffer.byteOffset,
        file.buffer.byteOffset + file.buffer.byteLength,
      );
    },
  };
}

function createFormData(req) {
  const values = new Map();

  for (const [key, value] of Object.entries(req.body || {})) {
    values.set(key, value);
  }

  for (const file of req.files || []) {
    values.set(file.fieldname, createFile(file));
  }

  return {
    get(name) {
      return values.get(name) ?? null;
    },
  };
}

function createNextRequest(req) {
  const absoluteUrl = `${req.protocol}://${req.get("host")}${req.originalUrl}`;

  return {
    url: absoluteUrl,
    nextUrl: new URL(absoluteUrl),
    headers: createHeaders(req.headers),
    params: req.params,
    async json() {
      return req.body || {};
    },
    async formData() {
      return createFormData(req);
    },
  };
}

async function sendNextResult(res, result) {
  if (!result) {
    if (!res.headersSent) res.status(204).end();
    return;
  }

  if (typeof Response !== "undefined" && result instanceof Response) {
    result.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });
    const body = Buffer.from(await result.arrayBuffer());
    res.status(result.status || 200).send(body);
    return;
  }

  if (result.headers) {
    for (const [key, value] of Object.entries(result.headers)) {
      res.setHeader(key, value);
    }
  }

  if (result.body instanceof ArrayBuffer) {
    res.status(result.status || 200).send(Buffer.from(result.body));
    return;
  }

  if (ArrayBuffer.isView(result.body)) {
    res.status(result.status || 200).send(Buffer.from(result.body));
    return;
  }

  res.status(result.status || 200).send(result.body);
}

export function registerNextRoute(router, routePath, routeModule, methods) {
  const middleware = [upload.any()];

  for (const method of methods) {
    router[method](routePath, ...middleware, async (req, res, next) => {
      try {
        const handler = routeModule[method.toUpperCase()];
        const nextReq = createNextRequest(req);
        const result = await handler(nextReq, { params: req.params });
        await sendNextResult(res, result);
      } catch (error) {
        next(error);
      }
    });
  }
}
