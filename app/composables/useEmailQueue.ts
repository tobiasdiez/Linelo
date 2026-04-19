import type { EmailMessage, AISuggestion, QueuePhase, EmailAction } from '~/types/email'

// Mock data for demonstration
const mockMessages: EmailMessage[] = [
  {
    id: '1',
    sender: {
      name: 'Sarah Chen',
      email: 'sarah@company.com',
    },
    subject: 'Q3 Planning — Need Your Input',
    body: `Hi there,

I hope this finds you well. I wanted to reach out about our Q3 planning session scheduled for next week.

We're looking at several key initiatives that will need input from your team:

1. The customer feedback integration project
2. Dashboard redesign timeline
3. API performance improvements

Could you take a look at the attached document and let me know your thoughts by Friday? I'd especially appreciate your perspective on the timeline estimates.

Looking forward to your input.

Best,
Sarah`,
    timestamp: new Date(),
    explanation: 'From a frequent contact, contains deadline language',
    attachments: [
      { name: 'Q3-Planning-Draft.pdf', type: 'application/pdf', size: '2.4 MB' },
    ],
  },
  {
    id: '2',
    sender: {
      name: 'Alex Rodriguez',
      email: 'alex.r@startup.io',
    },
    subject: 'Quick sync on the design system',
    body: `Hey!

Just wanted to follow up on our conversation from last week about the design system updates.

The team has made some good progress on the component library, and I think we're ready for a review. Would tomorrow afternoon work for a quick 15-minute call?

Let me know what works best for you.

Cheers,
Alex`,
    timestamp: new Date(Date.now() - 3600000),
    explanation: 'Recent thread, awaiting your response',
  },
  {
    id: '3',
    sender: {
      name: 'Newsletter',
      email: 'weekly@techdigest.com',
    },
    subject: 'This Week in Tech: AI Updates & More',
    body: `Your weekly tech roundup is here!

This week's highlights:
- New developments in AI assistants
- The future of remote work tools
- Security best practices for 2024

Read more in the full newsletter...`,
    timestamp: new Date(Date.now() - 7200000),
    explanation: 'Newsletter, low engagement history',
  },
]

const mockSuggestions: Record<string, AISuggestion[]> = {
  '1': [
    { id: 's1', action: 'reply', description: 'Reply — confirm availability for Q3 planning', confidence: 0.85 },
    { id: 's2', action: 'reply', description: 'Reply — request more details first', confidence: 0.68 },
    { id: 's3', action: 'task', description: 'Add task — review document by Friday', confidence: 0.72 },
    { id: 's4', action: 'handled', description: 'Mark handled — no response needed', confidence: 0.25 },
  ],
  '2': [
    { id: 's5', action: 'reply', description: 'Reply — suggest tomorrow 3pm', confidence: 0.91 },
    { id: 's6', action: 'reply', description: 'Reply — propose next week instead', confidence: 0.65 },
    { id: 's7', action: 'handled', description: 'Mark handled — already scheduled', confidence: 0.45 },
    { id: 's8', action: 'delegate', description: 'Delegate — forward to design team', confidence: 0.38 },
  ],
  '3': [
    { id: 's9', action: 'handled', description: 'Mark handled — no action needed', confidence: 0.88 },
    { id: 's10', action: 'task', description: 'Add task — read later this weekend', confidence: 0.42 },
    { id: 's11', action: 'handled', description: 'Mark handled — unsubscribe from list', confidence: 0.35 },
  ],
}

export function useEmailQueue() {
  const currentIndex = ref(0)
  const messages = ref<EmailMessage[]>(mockMessages)
  const isTransitioning = ref(false)
  const transitionDirection = ref<'enter' | 'exit'>('enter')

  const currentMessage = computed(() => {
    if (currentIndex.value >= messages.value.length) return null
    return messages.value[currentIndex.value]
  })

  const suggestions = computed<AISuggestion[]>(() => {
    if (!currentMessage.value) return []
    return mockSuggestions[currentMessage.value.id] || []
  })

  const phase = computed<QueuePhase>(() => {
    if (currentIndex.value >= messages.value.length) return 'complete'
    if (currentIndex.value === 0) return 'high-priority'
    if (currentIndex.value < messages.value.length - 1) return 'processing'
    return 'low-priority'
  })

  const phaseText = computed(() => {
    switch (phase.value) {
      case 'high-priority':
        return 'High-priority messages'
      case 'processing':
        return 'Working through your inbox'
      case 'low-priority':
        return 'Low-priority tail'
      case 'complete':
        return ''
      default:
        return ''
    }
  })

  const isComplete = computed(() => phase.value === 'complete')

  async function handleAction(action: EmailAction) {
    if (isTransitioning.value || !currentMessage.value) return

    isTransitioning.value = true
    transitionDirection.value = 'exit'

    // Wait for exit animation
    await new Promise(resolve => setTimeout(resolve, 200))

    // Move to next message
    currentIndex.value++
    transitionDirection.value = 'enter'

    // Wait for enter animation
    await new Promise(resolve => setTimeout(resolve, 250))

    isTransitioning.value = false
  }

  function handleSuggestion(suggestion: AISuggestion) {
    handleAction(suggestion.action)
  }

  return {
    currentMessage,
    suggestions,
    phase,
    phaseText,
    isComplete,
    isTransitioning,
    transitionDirection,
    handleAction,
    handleSuggestion,
  }
}
