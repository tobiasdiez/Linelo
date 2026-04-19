export default defineAppConfig({
  ui: {
    colors: {
      primary: 'linelo',
      neutral: 'warm',
    },
    button: {
      slots: {
        base: 'transition-all duration-150 ease-out',
      },
      defaultVariants: {
        color: 'neutral',
        variant: 'outline',
      },
    },
    card: {
      slots: {
        root: 'shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)] transition-shadow duration-200',
      },
    },
  },
})
