/**
 * An `h1` that can receive focus, as the title slot of `UEmpty`, so the page can
 * move focus to it when it replaces the message being decided.
 */
const FocusableTitle = defineComponent({
  setup:
    (_, { slots }) =>
    () =>
      h('h1', { tabindex: -1 }, slots.default?.()),
})

export default FocusableTitle
