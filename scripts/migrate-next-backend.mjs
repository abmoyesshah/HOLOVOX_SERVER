import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(__dirname, "..");
const workspaceRoot = path.resolve(serverRoot, "..");
const sourceRoot = path.join(workspaceRoot, "holovoxNextjsServer");
const targetRoot = path.join(serverRoot, "src", "migrated-next");

const sourceDirs = ["app/api", "app/models", "lib"];
const textExtensions = new Set([".js", ".mjs", ".ts", ".json"]);

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function toPosix(value) {
  return value.split(path.sep).join("/");
}

function relativeImport(fromFile, toFile) {
  let spec = toPosix(path.relative(path.dirname(fromFile), toFile));
  if (!spec.startsWith(".")) spec = `./${spec}`;
  return spec;
}

function hasNodeEsmExtension(specifier) {
  return [".js", ".mjs", ".cjs", ".json"].includes(path.extname(specifier));
}

function transformImports(content, targetFile) {
  const nextResponseImport = relativeImport(
    targetFile,
    path.join(targetRoot, "utils", "next-response.js"),
  );

  let transformed = content
    .replaceAll('"next/server"', `"${nextResponseImport}"`)
    .replaceAll("'next/server'", `'${nextResponseImport}'`)
    .replaceAll('"bcryptjs"', '"bcrypt"')
    .replaceAll("'bcryptjs'", "'bcrypt'")
    .replace(
      /(from\s+["'])(\.{1,2}\/[^"']+?)(["'])/g,
      (match, prefix, specifier, suffix) => {
        if (hasNodeEsmExtension(specifier)) return match;
        return `${prefix}${specifier}.js${suffix}`;
      },
    )
    .replace(
      /(import\s*\(\s*["'])(\.{1,2}\/[^"']+?)(["']\s*\))/g,
      (match, prefix, specifier, suffix) => {
        if (hasNodeEsmExtension(specifier)) return match;
        return `${prefix}${specifier}.js${suffix}`;
      },
    );

  if (toPosix(path.relative(targetRoot, targetFile)) === "lib/gridfs.js") {
    transformed = transformed
      .replace('import { GridFSBucket, ObjectId } from "mongodb";\n', "")
      .replaceAll("new GridFSBucket(", "new mongoose.mongo.GridFSBucket(")
      .replaceAll("ObjectId.isValid(", "mongoose.Types.ObjectId.isValid(")
      .replaceAll("new ObjectId(", "new mongoose.Types.ObjectId(");
  }

  return transformed;
}

function copyTree(relativeDir) {
  const srcDir = path.join(sourceRoot, relativeDir);
  const destDir = path.join(targetRoot, relativeDir);
  if (!fs.existsSync(srcDir)) return;

  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const src = path.join(srcDir, entry.name);
    const dest = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      copyTree(path.join(relativeDir, entry.name));
      continue;
    }

    ensureDir(path.dirname(dest));
    if (entry.name === "db.js" && relativeDir === "lib") {
      fs.writeFileSync(
        dest,
        'export { connectDB as default } from "../../db/DB.js";\n',
      );
      continue;
    }

    const ext = path.extname(entry.name);
    if (textExtensions.has(ext)) {
      const content = fs.readFileSync(src, "utf8");
      fs.writeFileSync(dest, transformImports(content, dest));
    } else {
      fs.copyFileSync(src, dest);
    }
  }
}

function getRoutePath(apiRouteFile) {
  const rel = toPosix(path.relative(path.join(targetRoot, "app", "api"), apiRouteFile));
  const segments = rel.split("/").slice(0, -1);
  const expressSegments = segments.map((segment) => {
    if (segment.startsWith("[") && segment.endsWith("]")) {
      return `:${segment.slice(1, -1)}`;
    }
    return segment;
  });
  return `/api/${expressSegments.join("/")}`;
}

function discoverRoutes(dir) {
  const routes = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      routes.push(...discoverRoutes(fullPath));
      continue;
    }
    if (entry.name !== "route.js") continue;

    const source = fs
      .readFileSync(fullPath, "utf8")
      .split(/\r?\n/)
      .filter((line) => !line.trimStart().startsWith("//"))
      .join("\n");
    const methods = [
      ...new Set(
        [...source.matchAll(/export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE)\b/g)]
          .map((match) => match[1].toLowerCase()),
      ),
    ];
    if (!methods.length) continue;
    routes.push({ file: fullPath, methods, routePath: getRoutePath(fullPath) });
  }
  return routes.sort((a, b) => a.routePath.localeCompare(b.routePath));
}

function emitRouter(routes) {
  const routerFile = path.join(serverRoot, "src", "routes", "migrated-next.routes.js");
  const lines = [
    'import express from "express";',
    'import { registerNextRoute } from "../utils/next-route-adapter.js";',
  ];

  routes.forEach((route, index) => {
    const importPath = relativeImport(routerFile, route.file);
    lines.push(`import * as route${index} from "${importPath}";`);
  });

  lines.push("", "const router = express.Router();", "");

  routes.forEach((route, index) => {
    const methods = route.methods.map((method) => `"${method}"`).join(", ");
    lines.push(`registerNextRoute(router, "${route.routePath}", route${index}, [${methods}]);`);
  });

  lines.push("", "export default router;", "");
  fs.writeFileSync(routerFile, lines.join("\n"));
}

ensureDir(targetRoot);
for (const dir of sourceDirs) copyTree(dir);

const routes = discoverRoutes(path.join(targetRoot, "app", "api"));
emitRouter(routes);

console.log(`Migrated ${routes.length} Next.js API route files into Express.`);
