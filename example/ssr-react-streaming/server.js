import fs from 'node:fs/promises'
import express from 'express'
import {
  discoverProjectStyles,
  loadStyleDefinitions,
  createCriticalStyleStream,
} from 'used-styles'

// Constants
const isProduction = process.env.NODE_ENV === 'production'
const port = process.env.PORT || 5173
const base = process.env.BASE || '/'
const ABORT_DELAY = 10000

// generate lookup table on server start
const stylesLookup = isProduction
  ? discoverProjectStyles('./dist/client')
  // in dev mode vite injects all styles to <head/> element
  : loadStyleDefinitions(async () => [])

// Cached production assets
const templateHtml = isProduction
  ? await fs.readFile('./dist/client/index.html', 'utf-8')
  : ''
const ssrManifest = isProduction
  ? await fs.readFile('./dist/client/.vite/ssr-manifest.json', 'utf-8')
  : undefined

// Create http server
const app = express()

// Add Vite or respective production middlewares
let vite
if (!isProduction) {
  const { createServer } = await import('vite')
  vite = await createServer({
    server: { middlewareMode: true },
    appType: 'custom',
    base
  })
  app.use(vite.middlewares)
} else {
  const compression = (await import('compression')).default
  const sirv = (await import('sirv')).default
  app.use(compression())
  app.use(base, sirv('./dist/client', { extensions: [] }))
}

// Serve HTML
app.use('*', async (req, res) => {
  try {
    await stylesLookup

    const url = req.originalUrl.replace(base, '')

    let template
    let render
    if (!isProduction) {
      // Always read fresh template in development
      template = await fs.readFile('./index.html', 'utf-8')
      template = await vite.transformIndexHtml(url, template)
      render = (await vite.ssrLoadModule('/src/entry-server.jsx')).render
    } else {
      template = templateHtml
      render = (await import('./dist/server/entry-server.js')).render
    }

    const styledStream = createCriticalStyleStream(stylesLookup)

    let didError = false

    const { pipe, abort } = render(url, ssrManifest, {
      onShellError() {
        res.status(500)
        res.set({ 'Content-Type': 'text/html' })
        res.send('<h1>Something went wrong</h1>')
      },
      // Can use also `onAllReady` callback
      onShellReady() {
        res.status(didError ? 500 : 200)
        res.set({ 'Content-Type': 'text/html' })

        let [htmlStart, htmlEnd] = template.split(`<!--app-html-->`)

        // React 19 supports document metadata out of box, 
        // but for react 18 we can use `react-helmet-async` here:
        // htmlStart = htmlStart.replace(`<!--app-head-->`, helmet.title.toString())
        
        res.write(htmlStart)

        styledStream.pipe(res, { end: false })

        pipe(styledStream)

        styledStream.on('end', () => {
          res.end(htmlEnd)
        })
      },
      onError(error) {
        didError = true
        console.error(error)
        // You can log crash reports here:
        // logServerCrashReport(error)
      }
    })

    setTimeout(() => {
      abort()
    }, ABORT_DELAY)
  } catch (e) {
    vite?.ssrFixStacktrace(e)
    console.log(e.stack)
    res.status(500).end(e.stack)
  }
})

// Start http server
app.listen(port, () => {
  console.log(`Server started at http://localhost:${port}`)
})
