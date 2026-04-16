export const STUDIO_TOOLS = [
  {
    label: "Audio Overview",
    defaultPrompt: "Create an audio overview from this notebook.",
    shortLabel: "Audio",
  },
  {
    label: "Video Overview",
    defaultPrompt: "Create a video overview from this notebook.",
    shortLabel: "Video",
  },
  {
    label: "Mind Map",
    defaultPrompt: "Create a mind map from this notebook.",
    shortLabel: "Mind Map",
  },
  {
    label: "Reports",
    defaultPrompt: "Write a report from this notebook.",
    shortLabel: "Report",
  },
  {
    label: "Flashcards",
    defaultPrompt: "Generate flashcards from this notebook.",
    shortLabel: "Cards",
  },
  {
    label: "Quiz",
    defaultPrompt: "Create a quiz from this notebook.",
    shortLabel: "Quiz",
  },
] as const;

export type StudioToolLabel = (typeof STUDIO_TOOLS)[number]["label"];

export const getStudioToolDefaultPrompt = (label: string | null | undefined) =>
  STUDIO_TOOLS.find((tool) => tool.label === label)?.defaultPrompt ?? "";
