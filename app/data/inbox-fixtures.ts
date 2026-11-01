import currentUser from '~/data/current-user'

const MILLISECONDS_PER_MINUTE = 60_000
const MINUTES_PER_HOUR = 60
const HOURS_PER_DAY = 24

interface TimeAgo {
  days?: number
  hours?: number
  minutes?: number
}

const lena: Inbox.Participant = { name: 'Lena Hartmann', email: 'lena.hartmann@northwind.co' }
const priya: Inbox.Participant = { name: 'Priya Nair', email: 'priya.nair@northwind.co' }
const marco: Inbox.Participant = { name: 'Marco Bellini', email: 'marco.bellini@northwind.co' }
const jonas: Inbox.Participant = { name: 'Jonas Weber', email: 'jonas.weber@northwind.co' }
const newsletter: Inbox.Participant = {
  name: 'Operator Weekly',
  email: 'hello@operatorweekly.com',
}

function vendorReview(ago: (offset: TimeAgo) => string): Inbox.QueueItem {
  return {
    thread: {
      id: 'thread-vendor-review',
      subject: 'Vendor review: can we move sign-off to Thursday?',
      messages: [
        {
          id: 'vendor-review-1',
          from: lena,
          to: [currentUser],
          cc: [priya, marco],
          sentAt: ago({ days: 2, hours: 2 }),
          body: 'Hi Mara,\n\nStarting the Q3 vendor review. Attached is the shortlist and the current pricing from all three vendors. Procurement would like a decision before the renewal date.\n\nThanks,\nLena',
          attachments: [
            { id: 'vendor-shortlist', name: 'vendor-shortlist-q3.pdf', sizeBytes: 312_000 },
          ],
        },
        {
          id: 'vendor-review-2',
          from: currentUser,
          to: [lena],
          cc: [priya, marco],
          sentAt: ago({ days: 2 }),
          body: "Thanks Lena. Before I sign off I'd like to see updated numbers for the hosting line, the old ones are from March.\n\nMara",
          attachments: [],
        },
        {
          id: 'vendor-review-3',
          from: lena,
          to: [currentUser],
          cc: [priya, marco],
          sentAt: ago({ minutes: 47 }),
          body: "Hi Mara,\n\nQuick follow-up on the Q3 vendor review. Procurement needs our sign-off by Thursday end of day so they can lock the renewal before the price change on the 1st.\n\nTwo things from your side:\n1. Does Thursday 14:00 work for the review call instead of Friday?\n2. Could you send the updated cost comparison before then? Last week's draft is attached, but the hosting numbers have changed.\n\nIf Thursday doesn't work, tell me today and I'll ask procurement for a short extension.\n\nThanks,\nLena",
          attachments: [
            { id: 'cost-comparison', name: 'cost-comparison-draft-v3.xlsx', sizeBytes: 49_152 },
          ],
        },
      ],
    },
    whyShown: 'A direct ask with a Thursday deadline, from a colleague you work with often.',
    suggestions: [
      {
        kind: 'reply',
        id: 'vendor-review-confirm',
        label: 'Confirm Thursday 14:00 and send the sheet by Wednesday',
        draft:
          "Hi Lena,\n\nThursday 14:00 works. I'll update the hosting numbers and send you the revised cost comparison by Wednesday, so you have it before the call.\n\nBest,\nMara",
        followUpTask: { title: 'Send revised cost comparison to Lena', due: 'Wednesday' },
      },
      {
        kind: 'reply',
        id: 'vendor-review-keep-friday',
        label: 'Keep Friday and offer a short written update instead',
        draft:
          "Hi Lena,\n\nFriday still suits me better for the call. I'll send a short written update on the hosting numbers by Thursday noon, so procurement isn't blocked.\n\nBest,\nMara",
      },
      {
        kind: 'task',
        id: 'vendor-review-task',
        label: 'Update cost comparison for Lena, due Wednesday',
        task: { title: 'Update cost comparison for Lena', due: 'Wednesday' },
      },
    ],
  }
}

function offsiteVenue(ago: (offset: TimeAgo) => string): Inbox.QueueItem {
  return {
    thread: {
      id: 'thread-offsite-venue',
      subject: 'Offsite: book the Lisbon venue?',
      messages: [
        {
          id: 'offsite-1',
          from: priya,
          to: [currentUser, marco],
          cc: [],
          sentAt: ago({ days: 3, hours: 4 }),
          body: 'Hi both,\n\nCould you confirm whether 14 and 15 November work for the team offsite? I have two venues on hold, one in Lisbon and one in Porto.\n\nPriya',
          attachments: [],
        },
        {
          id: 'offsite-2',
          from: currentUser,
          to: [priya],
          cc: [marco],
          sentAt: ago({ days: 3 }),
          body: "14 and 15 work for me. I'd lean towards Lisbon, it's easier for the people flying in.\n\nMara",
          attachments: [],
        },
        {
          id: 'offsite-3',
          from: priya,
          to: [currentUser],
          cc: [marco],
          sentAt: ago({ hours: 3 }),
          body: 'Thanks Mara. The Lisbon venue can hold the dates until Friday, then they release them. The quote is attached and fits the budget we agreed on.\n\nShall I go ahead and book it?\n\nPriya',
          attachments: [{ id: 'lisbon-quote', name: 'lisbon-venue-quote.pdf', sizeBytes: 184_320 }],
        },
      ],
    },
    whyShown: 'Priya needs a yes or no before the hold expires on Friday.',
    suggestions: [
      {
        kind: 'reply',
        id: 'offsite-book',
        label: 'Yes, book the Lisbon venue',
        draft:
          'Hi Priya,\n\nYes, please go ahead and book Lisbon. Thanks for sorting it out.\n\nMara',
      },
      {
        kind: 'reply',
        id: 'offsite-wait',
        label: 'Hold off until the budget is confirmed',
        draft:
          "Hi Priya,\n\nLet's wait until finance confirms the budget on Thursday. I'll get back to you then, still in time for Friday.\n\nMara",
        followUpTask: { title: 'Confirm offsite budget with finance', due: 'Thursday' },
      },
    ],
  }
}

function stagingUpdate(ago: (offset: TimeAgo) => string): Inbox.QueueItem {
  return {
    thread: {
      id: 'thread-staging',
      subject: 'Staging is back up',
      messages: [
        {
          id: 'staging-1',
          from: jonas,
          to: [currentUser, priya, marco],
          cc: [],
          sentAt: ago({ hours: 5 }),
          body: "Hi all,\n\nStaging is back up after this morning's database migration. Nothing changes on your side, deploys work as before.\n\nJonas",
          attachments: [],
        },
      ],
    },
    whyShown: 'A short update from Jonas. Nothing in it asks for an answer.',
    suggestions: [
      { kind: 'handled', id: 'staging-handled', label: 'Nothing to do here' },
      {
        kind: 'reply',
        id: 'staging-thanks',
        label: 'Thank Jonas',
        draft: 'Thanks Jonas, good to know.\n\nMara',
      },
    ],
  }
}

function migrationPlan(ago: (offset: TimeAgo) => string): Inbox.QueueItem {
  return {
    thread: {
      id: 'thread-migration-plan',
      subject: 'Hosting migration plan for review',
      messages: [
        {
          id: 'migration-1',
          from: marco,
          to: [currentUser],
          cc: [jonas],
          sentAt: ago({ days: 6 }),
          body: "Mara, as discussed I'm writing up the plan for moving off the old hosting provider. First draft by the end of the week.\n\nMarco",
          attachments: [],
        },
        {
          id: 'migration-2',
          from: currentUser,
          to: [marco],
          cc: [jonas],
          sentAt: ago({ days: 5, hours: 20 }),
          body: 'Sounds good. Please include the rollback steps and a rough cost estimate.\n\nMara',
          attachments: [],
        },
        {
          id: 'migration-3',
          from: jonas,
          to: [marco],
          cc: [currentUser],
          sentAt: ago({ days: 5 }),
          body: 'Marco, happy to review the database part once you have it. We should avoid the week of the 17th, that is release week.\n\nJonas',
          attachments: [],
        },
        {
          id: 'migration-4',
          from: marco,
          to: [currentUser],
          cc: [jonas],
          sentAt: ago({ days: 1, hours: 6 }),
          body: "Here is the plan. It's long, sorry. The short version: we move in three steps over two weekends, and nothing customer-facing changes until the last step.\n\nContext\nThe current contract ends on 31 January. Renewing would cost about 40% more than today, and the provider has not shipped the managed database version we need. Staying is possible, but it gets more expensive every quarter.\n\nStep 1: storage and backups\nWe copy object storage and nightly backups to the new provider first. Both sides run in parallel for two weeks, so we can compare restore times and costs before anything depends on it. Jonas has already tested a full restore on the new side; it took 38 minutes instead of 70.\n\nStep 2: database\nThe database moves on the first weekend. We put the app in read-only mode for about 40 minutes, replicate the last changes, then switch the connection string. Rollback is switching the connection string back; the old database stays untouched for a week.\n\nStep 3: application servers\nThe app servers move on the second weekend. This is the only step customers could notice, so we schedule it for Sunday morning and keep the old servers warm until Tuesday.\n\nCost\nThe estimate is in the attached sheet. In short: about 18% cheaper than today, and roughly a third cheaper than renewing.\n\nWhat I need from you\nA yes or no on the overall approach by Monday, so I can book the weekends with the provider. Details can still change after that.\n\nMarco",
          attachments: [
            { id: 'migration-plan', name: 'hosting-migration-plan-v2.pdf', sizeBytes: 1_258_291 },
            { id: 'migration-costs', name: 'migration-costs.xlsx', sizeBytes: 36_864 },
          ],
        },
      ],
    },
    whyShown: 'Marco needs your go-ahead by Monday. It is a long read, so a task may fit better.',
    suggestions: [
      {
        kind: 'task',
        id: 'migration-read',
        label: "Read Marco's migration plan, due Monday",
        task: { title: "Read Marco's hosting migration plan", due: 'Monday' },
      },
      {
        kind: 'reply',
        id: 'migration-approve',
        label: 'Approve the approach, details can follow',
        draft:
          "Hi Marco,\n\nThanks, this is clear. The three-step approach works for me, go ahead and book the weekends. Let's go through the details on Friday.\n\nMara",
      },
      {
        kind: 'reply',
        id: 'migration-walkthrough',
        label: 'Ask for a 20-minute walkthrough',
        draft:
          'Hi Marco,\n\nThanks for writing this up. Could you walk me through it in 20 minutes this week? Then I can give you an answer before Monday.\n\nMara',
      },
    ],
  }
}

function newsletterIssue(ago: (offset: TimeAgo) => string): Inbox.QueueItem {
  return {
    thread: {
      id: 'thread-newsletter',
      subject: 'Issue 212: The quiet case for fewer meetings',
      messages: [
        {
          id: 'newsletter-1',
          from: newsletter,
          to: [currentUser],
          cc: [],
          sentAt: ago({ days: 1, hours: 10 }),
          body: "This week: why the best-run teams we spoke to cut their recurring meetings by half, a reader's template for async status updates, and three tools we stopped using.\n\nRead the full issue on our website.\n\nYou are receiving this because you subscribed to Operator Weekly.",
          attachments: [],
        },
      ],
    },
    whyShown: 'A newsletter you subscribed to. Nothing in it needs an answer.',
    suggestions: [{ kind: 'handled', id: 'newsletter-handled', label: 'Nothing to act on' }],
  }
}

/**
 * Example threads for the decision flow, with timestamps relative to `now`.
 * Pass a fixed `now` where output must be stable, for example in stories.
 */
function createInboxFixtures(now: Date = new Date()): Inbox.QueueItem[] {
  function ago({ days = 0, hours = 0, minutes = 0 }: TimeAgo): string {
    const totalMinutes = (days * HOURS_PER_DAY + hours) * MINUTES_PER_HOUR + minutes
    return new Date(now.getTime() - totalMinutes * MILLISECONDS_PER_MINUTE).toISOString()
  }

  return [
    vendorReview(ago),
    offsiteVenue(ago),
    stagingUpdate(ago),
    migrationPlan(ago),
    newsletterIssue(ago),
  ]
}

export default createInboxFixtures
