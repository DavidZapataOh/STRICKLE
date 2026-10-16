export function sortedStringify(value: unknown): string;
export function createJwt(request: unknown, privateKey: `0x${string}`): Promise<string>;
export function triggerWorkflow(args: { url: string; workflowId: string; input: unknown; privateKey: `0x${string}` }): Promise<{ result?: { status?: string }; error?: { code?: number; message?: string } }>;
