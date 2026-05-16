import { addDevServerHandler, defineNuxtModule, resolveAlias } from 'nuxt/kit'
import { existsSync, readFileSync } from 'node:fs'
import type { Nuxt } from '@nuxt/schema'
import { __unstable__loadDesignSystem } from 'tailwindcss'
// TODO: temporary import from package until nuxt/devtools-kit is exposed, then remove also the @nuxt/devtools-kit dep
import { addCustomTab } from '@nuxt/devtools-kit'
import { defineEventHandler } from 'h3'
import { dirname } from 'node:path'
// TODO: temporary import from exsolve until we can use nuxt/kit for it
import { resolveModulePath } from 'exsolve'

interface ColorShade {
  shade: string
  token: string
  value: string
}

interface ColorFamily {
  name: string
  shades: ColorShade[]
}

interface DesignSystem {
  colors: ColorFamily[]
}

const DEVTOOLS_ROUTE = '/__tailwind/'

export default defineNuxtModule({
  meta: {
    name: 'tailwind-devtools',
    compatibility: {
      nuxt: '>=4.0.0',
    },
  },
  setup(_, nuxt) {
    addDevServerHandler({
      route: DEVTOOLS_ROUTE,
      handler: defineEventHandler(async () => {
        const cssFiles = resolveCssFiles(nuxt)
        const designSystem = await loadDesignSystem(cssFiles)
        const html = renderHtml(designSystem)
        return html
      }),
    })

    addCustomTab(
      {
        name: 'tailwind',
        title: 'Tailwind Config',
        icon: 'i-ph-palette',
        category: 'app',
        view: {
          type: 'iframe',
          src: DEVTOOLS_ROUTE,
        },
      },
      nuxt,
    )
  },
})

function resolveCssFiles(nuxt: Nuxt): string[] {
  const files = new Set<string>()

  for (const entry of nuxt.options.css) {
    if (typeof entry !== 'string') {
      continue
    }

    const resolved = resolveAlias(entry)
    if (resolved) {
      files.add(resolved)
    }
  }

  return [...files]
}

async function loadDesignSystem(cssFiles: string[]): Promise<DesignSystem> {
  const families = new Map<string, Map<string, ColorShade>>()
  const existingCssFiles = cssFiles.filter(file => existsSync(file))
  const designSystems = await Promise.all(
    existingCssFiles.map(async file => {
      const source = readFileSync(file, 'utf8')
      return __unstable__loadDesignSystem(source, {
        from: file,
        base: dirname(file),
        loadStylesheet: async (id, base) => {
          // TODO: Use resolvePath from nuxt/kit as soon as https://github.com/nuxt/nuxt/pull/34846 is merged and released
          const resolvedPath = resolveModulePath(id, { from: base, conditions: ['style'] })
          return {
            path: resolvedPath,
            base: dirname(resolvedPath),
            content: readFileSync(resolvedPath, 'utf8'),
          }
        },
      })
    }),
  )

  for (const designSystem of designSystems) {
    for (const [cssVar, entry] of designSystem.theme.entries()) {
      if (!cssVar.startsWith('--color-')) {
        continue
      }

      const token = cssVar.slice('--color-'.length)
      const value = entry.value.trim()
      if (token === '*' || !value) {
        continue
      }

      const { family, shade } = splitColorToken(token)
      const shades = families.get(family) ?? new Map<string, ColorShade>()
      shades.set(shade, {
        token,
        shade,
        value,
      })

      families.set(family, shades)
    }
  }

  const colors = [...families.entries()]
    .map(([name, shades]) => ({
      name,
      shades: [...shades.values()].toSorted(compareShades),
    }))
    .toSorted((left, right) => left.name.localeCompare(right.name))

  return {
    colors,
  }
}

function splitColorToken(token: string) {
  const parts = token.split('-')
  const maybeShade = parts.at(-1) ?? 'DEFAULT'

  if (/^\d+$/.test(maybeShade) && parts.length > 1) {
    return {
      family: parts.slice(0, -1).join('-'),
      shade: maybeShade,
    }
  }

  return {
    family: token,
    shade: 'DEFAULT',
  }
}

function compareShades(left: ColorShade, right: ColorShade) {
  if (left.shade === 'DEFAULT') {
    return -1
  }

  if (right.shade === 'DEFAULT') {
    return 1
  }

  return Number(left.shade) - Number(right.shade)
}

function renderHtml(designSystem: DesignSystem) {
  const sections = designSystem.colors.length
    ? designSystem.colors.map(color => renderColorSection(color)).join('\n')
    : '<div class="empty">No Tailwind theme colors were found in the configured CSS files.</div>'

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Colors</title>
    <style>
      :root {
        color-scheme: dark;
        --bg: #0b1020;
        --bg-elevated: rgba(15, 23, 42, 0.86);
        --bg-muted: rgba(148, 163, 184, 0.08);
        --border: rgba(148, 163, 184, 0.18);
        --text: #e2e8f0;
        --text-muted: #94a3b8;
      }
      * {
        box-sizing: border-box;
      }
      body {
        margin: 0;
        min-height: 100vh;
        background:
          radial-gradient(circle at top left, rgba(34, 197, 94, 0.18), transparent 30%),
          radial-gradient(circle at top right, rgba(245, 158, 11, 0.14), transparent 28%),
          linear-gradient(180deg, #020617 0%, #0f172a 100%);
        color: var(--text);
        font-family: Manrope, "Segoe UI", sans-serif;
      }
      .page {
        width: min(1400px, 100%);
        margin: 0 auto;
        padding: 24px;
      }
      .hero {
        padding: 28px;
        border: 1px solid var(--border);
        border-radius: 24px;
        background: linear-gradient(180deg, rgba(15, 23, 42, 0.92), rgba(15, 23, 42, 0.74));
        box-shadow: 0 24px 80px rgba(2, 6, 23, 0.45);
      }
      .eyebrow {
        margin: 0 0 10px;
        color: #86efac;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.14em;
        text-transform: uppercase;
      }
      h1 {
        margin: 0;
        font-size: clamp(28px, 5vw, 44px);
        line-height: 1;
      }
      .summary {
        margin: 14px 0 0;
        color: var(--text-muted);
        font-size: 15px;
        line-height: 1.6;
      }
      .meta {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-top: 18px;
      }
      .meta code,
      .stat {
        display: inline-flex;
        align-items: center;
        min-height: 34px;
        padding: 0 12px;
        border: 1px solid var(--border);
        border-radius: 999px;
        background: var(--bg-muted);
        color: var(--text);
        font-size: 13px;
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
        gap: 18px;
        margin-top: 24px;
      }
      .family {
        overflow: hidden;
        border: 1px solid var(--border);
        border-radius: 22px;
        background: var(--bg-elevated);
        backdrop-filter: blur(18px);
      }
      .family-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 18px 18px 14px;
      }
      .family-title {
        margin: 0;
        font-size: 19px;
        font-weight: 700;
      }
      .family-count {
        color: var(--text-muted);
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }
      .swatches {
        display: grid;
        gap: 1px;
        padding: 0 1px 1px;
        background: rgba(148, 163, 184, 0.08);
      }
      .swatch {
        display: grid;
        grid-template-columns: 92px 1fr;
        min-height: 92px;
        background: rgba(15, 23, 42, 0.92);
      }
      .chip {
        border-right: 1px solid rgba(15, 23, 42, 0.16);
      }
      .swatch-copy {
        padding: 14px 16px;
      }
      .swatch-top {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 12px;
      }
      .shade {
        font-size: 20px;
        font-weight: 700;
      }
      .token {
        color: var(--text-muted);
        font-size: 12px;
      }
      .value,
      .var-name {
        margin-top: 8px;
        color: var(--text);
        font-family: "SF Mono", "Fira Code", monospace;
        font-size: 12px;
        line-height: 1.5;
        word-break: break-word;
      }
      .var-name {
        color: var(--text-muted);
      }
      .empty {
        margin-top: 24px;
        padding: 28px;
        border: 1px dashed var(--border);
        border-radius: 22px;
        background: var(--bg-elevated);
        color: var(--text-muted);
      }
      @media (max-width: 700px) {
        .page {
          padding: 16px;
        }
        .hero {
          padding: 20px;
          border-radius: 18px;
        }
        .swatch {
          grid-template-columns: 72px 1fr;
        }
      }
    </style>
  </head>
  <body>
    <main class="page">
      <h1>Colors</h1>
      <section class="grid">
        ${sections}
      </section>
    </main>
  </body>
</html>`
}

function renderColorSection(color: ColorFamily) {
  const swatches = color.shades
    .map(
      shade => `<article class="swatch">
  <div class="chip" style="background:${escapeHtml(shade.value)};"></div>
  <div class="swatch-copy">
    <div class="swatch-top">
      <span class="shade">${escapeHtml(shade.shade)}</span>
      <span class="token">${escapeHtml(shade.token)}</span>
    </div>
    <div class="value">${escapeHtml(shade.value)}</div>
  </div>
</article>`,
    )
    .join('\n')

  return `<section class="family">
  <header class="family-header">
    <h2 class="family-title">${escapeHtml(color.name)}</h2>
  </header>
  <div class="swatches">
    ${swatches}
  </div>
</section>`
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
