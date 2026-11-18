import { page } from 'vite-plus/test/browser'

type Locator = ReturnType<typeof page.getByRole>

/** The composers' fields and buttons, as a user finds them. */
function replyBox(): Locator {
  return page.getByRole('textbox', { name: 'Reply' })
}

function recipientBox(): Locator {
  return page.getByRole('textbox', { name: 'Forward to' })
}

function noteBox(): Locator {
  return page.getByRole('textbox', { name: 'Note' })
}

function forwardButton(): Locator {
  return page.getByRole('button', { name: 'Forward', exact: true })
}

/** Meta+Enter, which sends from either composer: Command on macOS, Control elsewhere. */
const sendKeys = useKbd().macOS.value ? '{Meta>}{Enter}{/Meta}' : '{Control>}{Enter}{/Control}'

const composer = { replyBox, recipientBox, noteBox, forwardButton, sendKeys }

export default composer
