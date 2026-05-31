export default defineAppConfig({
  ui: {
    alert: {
      slots: {
        root: "w-full rounded-xl border p-4",
        title: "text-sm font-semibold uppercase tracking-wide",
        description: "text-sm leading-6",
      },
      compoundVariants: [
        {
          color: "primary",
          variant: "subtle",
          class: {
            root: "border-primary-200 bg-primary-50/70",
            title: "text-primary-900",
            description: "text-toned",
          },
        },
        {
          color: "warning",
          variant: "subtle",
          class: {
            root: "border-amber-200 bg-amber-50/80",
            title: "text-amber-950",
            description: "text-amber-950",
          },
        },
        {
          color: "error",
          variant: "subtle",
          class: {
            root: "border-red-200 bg-red-50/85",
            title: "text-red-900",
            description: "text-red-900",
          },
        },
      ],
      defaultVariants: {
        variant: "subtle",
      },
    },
    card: {
      slots: {
        root: "border border-default",
        body: "p-4",
      },
      variants: {
        variant: {
          outline: {
            root: "rounded-xl bg-muted shadow-sm",
          },
          soft: {
            root: "rounded-md bg-elevated",
          },
        },
      },
      defaultVariants: {
        variant: "outline",
      },
    },
    badge: {
      slots: {
        base: "inline-flex items-center font-semibold uppercase tracking-wide rounded-full",
      },
      variants: {
        size: {
          sm: {
            base: "px-2.5 py-1 text-2xs",
          },
          md: {
            base: "px-3 py-1 text-xs",
          },
        },
      },
      defaultVariants: {
        size: "sm",
        variant: "soft",
      },
    },
    button: {
      slots: {
        base: "rounded-lg font-medium",
      },
      compoundVariants: [
        {
          color: "neutral",
          variant: "ghost",
          class: "rounded-lg",
        },
      ],
      defaultVariants: {
        color: "neutral",
        variant: "outline",
      },
    },
    colors: {
      primary: "primary",
      secondary: "secondary",
      success: "primary",
      info: "secondary",
      warning: "amber",
      error: "red",
      neutral: "neutral",
    },
  },
});
