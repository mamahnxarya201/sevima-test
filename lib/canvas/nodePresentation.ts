/**
 * Shared labels for canvas nodes and execution UI (keep in sync with node components).
 */

/** Upper header strip on BaseNode — matches HttpNode / ScriptNode / ConditionNode. */
export const NODE_HEADER_TITLE: Record<string, string> = {
  http: 'Action',
  script: 'Compute',
  condition: 'Logic Control',
  delay: 'Delay',
  trigger: 'Action',
};

/** Default card title when `data.title` is unset — matches NodeSettings / node components. */
export const NODE_DEFAULT_TITLE: Record<string, string> = {
  http: 'Fetch User Data',
  script: 'Post-Process',
  condition: 'Check Subscription',
  delay: 'Delay Execution',
  trigger: 'Webhook',
};

export function nodeHeaderTitle(nodeType: string): string {
  return NODE_HEADER_TITLE[nodeType] ?? nodeType;
}

export function nodeDisplayTitle(nodeType: string, dataTitle: unknown): string {
  if (typeof dataTitle === 'string' && dataTitle.trim() !== '') return dataTitle.trim();
  return NODE_DEFAULT_TITLE[nodeType] ?? nodeType;
}
