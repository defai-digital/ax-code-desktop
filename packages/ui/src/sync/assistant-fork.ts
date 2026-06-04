export type AssistantForkSourceChoice = {
  agent?: string;
  providerID?: string;
  modelID?: string;
  variant?: string;
} | null;

export type AssistantForkCurrentChoice = {
  providerID?: string | null;
  modelID?: string | null;
  agent?: string | null;
  lastUsedProvider?: {
    providerID?: string;
    modelID?: string;
  } | null;
};

export type AssistantForkSendChoice = {
  providerID: string;
  modelID: string;
  agent?: string;
  variant?: string;
};

const nonEmpty = (value: string | null | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

export const resolveAssistantForkSendChoice = (
  sourceChoice: AssistantForkSourceChoice,
  currentChoice: AssistantForkCurrentChoice,
): AssistantForkSendChoice | null => {
  const providerID = nonEmpty(sourceChoice?.providerID)
    ?? nonEmpty(currentChoice.providerID)
    ?? nonEmpty(currentChoice.lastUsedProvider?.providerID);
  const modelID = nonEmpty(sourceChoice?.modelID)
    ?? nonEmpty(currentChoice.modelID)
    ?? nonEmpty(currentChoice.lastUsedProvider?.modelID);

  if (!providerID || !modelID) {
    return null;
  }

  return {
    providerID,
    modelID,
    agent: nonEmpty(sourceChoice?.agent) ?? nonEmpty(currentChoice.agent),
    variant: nonEmpty(sourceChoice?.variant),
  };
};
