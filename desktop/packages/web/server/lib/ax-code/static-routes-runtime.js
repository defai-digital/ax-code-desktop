/**
 * The directory static files are served from: the staged dist named by
 * AX_CODE_DESKTOP_DIST_DIR, or the dist next to the server. Shared with
 * the CSP document hashes so hashed bytes and served bytes always come
 * from the same directory.
 */
export const resolveServedDistPath = ({ env, __dirname, path }) => {
  const configured = typeof env?.AX_CODE_DESKTOP_DIST_DIR === "string" ? env.AX_CODE_DESKTOP_DIST_DIR.trim() : ""
  if (configured) {
    return path.resolve(configured)
  }
  return path.join(__dirname, "..", "dist")
}

export const createStaticRoutesRuntime = (dependencies) => {
  const { fs, path, process, __dirname, express } = dependencies

  const resolveDistPath = () => resolveServedDistPath({ env: process.env, __dirname, path })

  const registerStaticRoutes = (app) => {
    const distPath = resolveDistPath()

    if (fs.existsSync(distPath)) {
      console.log(`Serving static files from ${distPath}`)
      app.use(
        express.static(distPath, {
          setHeaders(res, filePath) {
            // Service workers should never be long-cached; iOS is especially sensitive.
            if (typeof filePath === "string" && filePath.endsWith(`${path.sep}sw.js`)) {
              res.setHeader("Cache-Control", "no-store")
            }
          },
        }),
      )

      app.get(/^(?!\/api|.*\.(js|css|svg|png|jpg|jpeg|gif|ico|woff|woff2|ttf|eot|map)).*$/, (_req, res) => {
        res.sendFile(path.join(distPath, "index.html"))
      })
      return
    }

    console.warn(`Warning: ${distPath} not found, static files will not be served`)
    app.get(/^(?!\/api|.*\.(js|css|svg|png|jpg|jpeg|gif|ico|woff|woff2|ttf|eot|map)).*$/, (_req, res) => {
      res.status(404).send("Static files not found. Please build the application first.")
    })
  }

  return {
    registerStaticRoutes,
  }
}
