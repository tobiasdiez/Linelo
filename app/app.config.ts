export default defineAppConfig({
  ui: {
    alert: {
      slots: {
        root: 'w-full rounded-xl border p-4',
        title: 'text-sm font-semibold uppercase tracking-wide',
        description: 'text-sm leading-6',
      },
      compoundVariants: [
        {
          color: 'primary',
          variant: 'subtle',
          class: {
            root: 'border-primary-200 bg-primary-50/70',
            title: 'text-primary-900',
            description: 'text-toned',
          },
        },
        {
          color: 'warning',
          variant: 'subtle',
          class: {
            root: 'border-amber-200 bg-amber-50/80',
            title: 'text-amber-950',
            description: 'text-amber-950',
          },
        },
        {
          color: 'error',
          variant: 'subtle',
          class: {
            root: 'border-red-200 bg-red-50/85',
            title: 'text-red-900',
            description: 'text-red-900',
          },
        },
      ],
      defaultVariants: {
        variant: 'subtle',
      },
    },
    card: {
      slots: {
        root: 'border border-default',
        // Replace the theme's responsive padding (`p-4 sm:p-6`) so variants can override it
        header: () => 'p-4',
        body: () => 'p-4',
        footer: () => 'p-4',
      },
      variants: {
        variant: {
          outline: {
            root: 'rounded-xl bg-muted shadow-sm',
          },
          soft: {
            root: 'rounded-md bg-elevated',
          },
          // A card whose content brings its own padding, such as message lists and the composer
          flush: {
            root: 'divide-y divide-default rounded-xl bg-muted shadow-sm',
            header: 'px-4 py-2.5',
            body: 'p-0',
            footer: 'bg-elevated px-4 py-2.5',
          },
        },
      },
      defaultVariants: {
        variant: 'outline',
      },
    },
    badge: {
      slots: {
        base: 'inline-flex items-center font-semibold uppercase tracking-wide rounded-full',
      },
      variants: {
        size: {
          sm: {
            base: 'px-2.5 py-1 text-2xs',
          },
          md: {
            base: 'px-3 py-1 text-xs',
          },
        },
      },
      compoundVariants: [
        {
          // Keeps gold labels readable on light surfaces
          color: 'secondary',
          variant: 'soft',
          class: 'bg-secondary-100 text-secondary-900',
        },
      ],
      defaultVariants: {
        size: 'sm',
        variant: 'soft',
      },
    },
    button: {
      slots: {
        base: 'rounded-lg font-medium',
      },
      variants: {
        // Small buttons would read as pills with the large radius
        size: {
          xs: { base: 'rounded-md' },
          sm: { base: 'rounded-md' },
        },
      },
      compoundVariants: [
        {
          color: 'neutral',
          variant: 'ghost',
          class: 'rounded-lg',
        },
        {
          // Lift outline buttons off the warm page background
          color: 'neutral',
          variant: 'outline',
          class: 'bg-muted disabled:bg-muted aria-disabled:bg-muted',
        },
        {
          // The design system's focus indicator: an offset green ring, for every button
          variant: ['solid', 'outline', 'soft', 'subtle', 'ghost', 'link'],
          class:
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600',
        },
      ],
      defaultVariants: {
        color: 'neutral',
        variant: 'outline',
      },
    },
    avatar: {
      slots: {
        fallback: 'font-semibold tracking-wide',
      },
      variants: {
        color: {
          primary: {
            root: 'bg-primary-100',
            fallback: 'text-primary-900',
            icon: 'text-primary-800',
          },
          neutral: {
            root: 'bg-accented',
            fallback: 'text-toned',
            icon: 'text-toned',
          },
        },
        // Smaller initials than the defaults, so avatars stay quiet next to names
        size: {
          'xs': { root: 'text-2xs' },
          'md': { root: 'text-xs' },
          '2xl': { root: 'text-sm' },
        },
      },
    },
    kbd: {
      // Values are passed in display case (`R`, not `r`), so `Esc` keeps its casing
      base: 'font-mono normal-case',
      compoundVariants: [
        {
          color: 'neutral',
          variant: 'outline',
          class: 'bg-elevated text-muted ring-default',
        },
        {
          // Shortcut hints inside solid primary buttons
          color: 'primary',
          variant: 'solid',
          class: 'bg-white/15 text-white/90',
        },
      ],
    },
    textarea: {
      variants: {
        size: {
          lg: {
            base: 'text-sm/6',
          },
        },
      },
      compoundVariants: [
        {
          // Borderless textareas sit inside a card and line up with its header
          variant: 'none',
          size: 'lg',
          class: { base: 'px-4 py-3.5' },
        },
      ],
    },
    checkbox: {
      slots: {
        base: 'rounded-xs ring-neutral-400',
        label: 'font-normal text-toned',
      },
      compoundVariants: [
        {
          color: 'primary',
          class: {
            base: 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600',
          },
        },
      ],
    },
    collapsible: {
      slots: {
        content: 'motion-reduce:animate-none',
      },
    },
    tooltip: {
      slots: {
        // Allow short sentences: wrap instead of truncating to a single line
        content: 'h-auto max-w-72 py-1.5',
        text: 'text-clip whitespace-normal',
      },
    },
    toaster: {
      slots: {
        // Below `lg`, stay clear of the action bar fixed to the bottom of the screen
        viewport: 'max-lg:bottom-36',
      },
      defaultVariants: {
        // Over the reading column, never over the rail and its actions on laptop screens
        position: 'bottom-left',
        // Room for an Undo toast next to a short notice
        max: 2,
        progress: false,
        duration: 4000,
      },
    },
    toast: {
      defaultVariants: {
        color: 'neutral',
        // Polite announcements: confirmations should not interrupt screen readers
        type: 'background',
      },
    },
    empty: {
      slots: {
        // `outline-none`: the title only receives focus programmatically, to announce it
        title: 'font-semibold tracking-tight outline-none',
      },
      variants: {
        size: {
          xl: {
            title: 'text-3xl',
            description: 'text-base',
          },
        },
      },
    },
    colors: {
      primary: 'primary',
      secondary: 'secondary',
      success: 'primary',
      info: 'secondary',
      warning: 'amber',
      error: 'red',
      neutral: 'neutral',
    },
  },
})
