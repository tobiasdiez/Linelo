# Guidelines for Agents

## General Guidelines

- Always follow the instructions in this file and ask questions if you are unsure about any aspect of the design, code quality requirements, or brand guidelines.
- When writing or revising user-facing language, refer to `BRAND.md` for tone, terminology, positioning, product promise, and strategic guardrails. When there is a conflict between generic writing preferences and brand guidance, follow `BRAND.md`.
- For implementing features, refer to `PRD.md` for the product requirements and user stories. Use the PRD as the starting point for understanding the feature, then design full feature specs around it and finally implement it. If there are any ambiguities or questions about the requirements, ask for clarification before proceeding. Don't use it for user-facing language guidance.

## Code Quality Requirements

- Follow standard TypeScript conventions and best practices
- Use the Composition API when creating Vue components
- Use clear, descriptive variable and function names
- Accessibility should always be a first-class consideration and should be part of the initial planning and design.
- Add comments only to explain complex logic or non-obvious implementations
- Write unit tests for core functionality using `vitest`
- Write end-to-end tests using Playwright and `@nuxt/test-utils`
- Keep functions focused and manageable (generally under 50 lines)
- Use error handling patterns consistently
- Ensure you write strictly type-safe code, for example by ensuring you always check when accessing an array value by index
- Don't add developer notes/states in the UI (e.g. "Dependency xyz not yet configured"), instead handle these cases by TODO comments or dev-side error logging.
- Reuse predefined Tailwind classes and Nuxt UI components where possible instead of creating new styles (or custom combinations like `rounded-[var(...)]` or `color-mixin`) or components.

## Code Organization

In general, follow the standard Nuxt 4 project structure (Tool: get-documentation-page, path: "/docs/4.x/directory-structure") with the following additional guidelines.

Vue:

- Reusable Vue components belong at the top level of `app/components`.
- Area-specific Vue components belong in a matching subfolder under `app/components` such as `app/components/inbox`.
- Every new Vue component must have a colocated `.stories.vue` file

Types:

- Reusable TypeScript types and utilities belong in `app/types` (for frontend) or `shared/types` (used by both frontend and backend).
- Component-specific types should be colocated in the same file as the component.

<!--VITE PLUS START-->

# Using Vite+, the Unified Toolchain for the Web

This project is using Vite+, a unified toolchain built on top of Vite, Rolldown, Vitest, tsdown, Oxlint, Oxfmt, and Vite Task. Vite+ wraps runtime management, package management, and frontend tooling in a single global CLI called `vp`. Vite+ is distinct from Vite, but it invokes Vite through `vp dev` and `vp build`.

## Vite+ Workflow

`vp` is a global binary that handles the full development lifecycle. Run `vp help` to print a list of commands and `vp <command> --help` for information about a specific command.

### Start

- create - Create a new project from a template
- migrate - Migrate an existing project to Vite+
- config - Configure hooks and agent integration
- staged - Run linters on staged files
- install (`i`) - Install dependencies
- env - Manage Node.js versions

### Develop

- dev - Run the development server
- check - Run format, lint, and TypeScript type checks
- lint - Lint code
- fmt - Format code
- test - Run tests

### Execute

- run - Run monorepo tasks
- exec - Execute a command from local `node_modules/.bin`
- dlx - Execute a package binary without installing it as a dependency
- cache - Manage the task cache

### Build

- build - Build for production
- pack - Build libraries
- preview - Preview production build

### Manage Dependencies

Vite+ automatically detects and wraps the underlying package manager such as pnpm, npm, or Yarn through the `packageManager` field in `package.json` or package manager-specific lockfiles.

- add - Add packages to dependencies
- remove (`rm`, `un`, `uninstall`) - Remove packages from dependencies
- update (`up`) - Update packages to latest versions
- dedupe - Deduplicate dependencies
- outdated - Check for outdated packages
- list (`ls`) - List installed packages
- why (`explain`) - Show why a package is installed
- info (`view`, `show`) - View package information from the registry
- link (`ln`) / unlink - Manage local package links
- pm - Forward a command to the package manager

### Maintain

- upgrade - Update `vp` itself to the latest version

These commands map to their corresponding tools. For example, `vp dev --port 3000` runs Vite's dev server and works the same as Vite. `vp test` runs JavaScript tests through the bundled Vitest. The version of all tools can be checked using `vp --version`. This is useful when researching documentation, features, and bugs.

## Common Pitfalls

- **Using the package manager directly:** Do not use pnpm, npm, or Yarn directly. Vite+ can handle all package manager operations.
- **Always use Vite commands to run tools:** Don't attempt to run `vp vitest` or `vp oxlint`. They do not exist. Use `vp test` and `vp lint` instead.
- **Vue prop defaults:** Prefer reactive prop destructuring with `const { foo = 'default' } = defineProps<{ foo?: string }>()` instead of `withDefaults(...)` for component prop defaults.
- **Running scripts:** Vite+ built-in commands (`vp dev`, `vp build`, `vp test`, etc.) always run the Vite+ built-in tool, not any `package.json` script of the same name. To run a custom script that shares a name with a built-in command, use `vp run <script>`. For example, if you have a custom `dev` script that runs multiple services concurrently, run it with `vp run dev`, not `vp dev` (which always starts Vite's dev server).
- **Do not install Vitest, Oxlint, Oxfmt, or tsdown directly:** Vite+ wraps these tools. They must not be installed directly. You cannot upgrade these tools by installing their latest versions. Always use Vite+ commands.
- **Use Vite+ wrappers for one-off binaries:** Use `vp dlx` instead of package-manager-specific `dlx`/`npx` commands.
- **Import JavaScript modules from `vite-plus`:** Instead of importing from `vite` or `vitest`, all modules should be imported from the project's `vite-plus` dependency. For example, `import { defineConfig } from 'vite-plus';` or `import { expect, test, vi } from 'vite-plus/test';`. You must not install `vitest` to import test utilities.
- **Type-Aware Linting:** There is no need to install `oxlint-tsgolint`, `vp lint --type-aware` works out of the box.

## CI Integration

For GitHub Actions, consider using [`voidzero-dev/setup-vp`](https://github.com/voidzero-dev/setup-vp) to replace separate `actions/setup-node`, package-manager setup, cache, and install steps with a single action.

```yaml
- uses: voidzero-dev/setup-vp@v1
  with:
    cache: true
- run: vp check
- run: vp test
```

<!--VITE PLUS END-->

## Brand Guidance for Agents

- Read [`BRAND.md`](../BRAND.md) before writing or revising product copy, UX text, messaging, onboarding text, release notes, marketing content, or any user-facing AI text.
- Use [`BRAND.md`](../BRAND.md) as the source of truth for tone, terminology, positioning, product promise, and strategic guardrails.
- When there is a conflict between generic writing preferences and brand guidance, follow [`BRAND.md`](../BRAND.md).

## UI and Design Guidance

- Read [`design-system.md`](../design-system.md) before implementing or revising UI, layout, visual hierarchy, component styling, motion, or AI-facing interface language.
- Use [`design-system.md`](../design-system.md) as the source of truth for design decisions, token usage, anti-patterns, and UI tradeoffs.
- When there is a conflict between generic UI preferences and the design system, follow [`design-system.md`](../design-system.md).
- Prefer existing Tailwind tokens, Nuxt UI components, and global theme config over one-off component styling.
- If a design decision changes the primary action, visual emphasis, tone, or motion pattern and the correct choice is not obvious, ask for clarification instead of guessing.

## Review Checklist for Agents

- [ ] Run `vp install` after pulling remote changes and before getting started.
- [ ] If the change affects user-facing language, verify it aligns with [`BRAND.md`](../BRAND.md).
- [ ] If the change affects UI or visual design, verify it aligns with [`design-system.md`](../design-system.md).
- [ ] Run `vp check` and `vp test` to validate changes.

## Component Structure and Stories

- Reusable Vue components belong at the top level of `app/components`.
- Area-specific Vue components belong in a matching subfolder under `app/components` such as `app/components/inbox`.
- Every new Vue component must have a colocated `.stories.vue` file next to it.
- Component stories must use `storybook-vue-addon` SFC syntax with `<Stories>` and `<Story>` blocks rather than CSF `.ts` files.

## Nuxt UI Theme Usage

- Reusable visual overrides for Nuxt UI components must go in `app/app.config.ts` under the global `ui` theme config.
- Before adding local `class` or `:ui` overrides to a Nuxt UI component, reuse or extend the existing global component theme and keep local overrides only for one-off layout concerns.
