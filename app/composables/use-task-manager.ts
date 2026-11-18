interface TaskRequest extends Inbox.TaskDraft {
  /** The thread the task was created from, so the task can link back to it. */
  threadId: string
}

interface TaskManager {
  createTask: (task: TaskRequest) => Promise<void>
}

/*
 * TODO: Create the task through the Todoist API, with a link to the email, once
 * the Todoist connection exists. Until then creation fails, so a follow-up task
 * is never claimed next to a reply that was really sent. The page does not offer
 * Add to Todoist yet.
 */
function createTask(_task: TaskRequest): Promise<void> {
  return Promise.reject(new Error("Todoist isn't connected yet"))
}

// One shared instance, like the Todoist client it will wrap
const taskManager: TaskManager = { createTask }

/** Task manager integration (Todoist in v1). */
function useTaskManager(): TaskManager {
  return taskManager
}

export default useTaskManager
