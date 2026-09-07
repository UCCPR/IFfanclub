import type { Save } from './game.ts';

type Tool = {
  name: string;
  title: string;
  description: string;
  inputSchema: object;
  annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
  execute: (input: unknown) => unknown;
};
export type Context = {
  registerTool: (
    tool: Tool,
    options: { signal: AbortSignal },
  ) => void | Promise<void>;
};
export function registerGameTools(
  context: Context | undefined,
  actions: {
    read: () => Save;
    draw: (count: number, mode: 'normal' | 'box') => Promise<Save>;
    reveal: () => Promise<Save>;
  },
) {
  const lifecycle = new AbortController();
  if (!context?.registerTool) return () => lifecycle.abort();
  const summary = (s: Save) => ({
    balance: s.balance,
    draws: s.draws,
    pity: s.pity,
    uniqueCards: Object.keys(s.collection).length,
    results: s.results.map((r) =>
      r.revealed ? r : { revealed: false, mystery: r.mystery },
    ),
  });
  const empty = (input: unknown) => {
    if (
      !input ||
      typeof input !== 'object' ||
      Array.isArray(input) ||
      Object.keys(input).length
    )
      throw new Error('Expected an empty object');
  };
  const tools: Tool[] = [
    {
      name: 'read_game_status',
      title: '查看试玩状态',
      description:
        'Read the current local demo balance, pity and revealed results.',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute(input) {
        empty(input);
        return summary(actions.read());
      },
    },
    {
      name: 'draw_demo_cards',
      title: '招募试玩角色',
      description:
        'Spend 300 local demo currency per card; recruit 1 or 10 cards and save immediately. Box results remain hidden until revealed.',
      inputSchema: {
        type: 'object',
        properties: {
          count: { type: 'integer', enum: [1, 10] },
          mode: { type: 'string', enum: ['normal', 'box'] },
        },
        required: ['count', 'mode'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      async execute(input) {
        if (!input || typeof input !== 'object' || Array.isArray(input))
          throw new Error('Invalid arguments');
        const args = input as Record<string, unknown>;
        if (
          Object.keys(args).some((k) => !['count', 'mode'].includes(k)) ||
          (args.count !== 1 && args.count !== 10) ||
          (args.mode !== 'normal' && args.mode !== 'box')
        )
          throw new Error('Invalid count or mode');
        return summary(await actions.draw(args.count, args.mode));
      },
    },
    {
      name: 'reveal_all_demo_boxes',
      title: '开启全部盲盒',
      description:
        'Reveal the current batch of already-paid demo boxes. Does not draw or charge again.',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      async execute(input) {
        empty(input);
        return summary(await actions.reveal());
      },
    },
  ];
  for (const tool of tools) {
    try {
      void Promise.resolve(
        context.registerTool(tool, { signal: lifecycle.signal }),
      ).catch(() => {
        /* Optional browser capability. */
      });
    } catch {
      /* Unsupported/disabled registries must not break normal play. */
    }
  }
  return () => lifecycle.abort();
}
