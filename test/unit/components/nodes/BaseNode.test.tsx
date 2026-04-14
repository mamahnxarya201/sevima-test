import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { BaseNode } from '@/components/nodes/BaseNode';
import { nodeExecutionFamily } from '@/store/executionStore';
import { renderWithProviders } from '@/test/utils/renderWithProviders';

describe('BaseNode', () => {
  it('happy path: renders base node content with running spinner', () => {
    renderWithProviders(
      <BaseNode nodeId="node-1" title="My Node" description="Runs task" hasSpinner />,
      {
        atomSeeds: [[nodeExecutionFamily('node-1'), { nodeId: 'node-1', status: 'running' }]],
      }
    );
    expect(screen.getByText('My Node')).toBeInTheDocument();
    expect(screen.getByText('Runs task')).toBeInTheDocument();
  });

  it('malformed input: falls back to default labels when optional props are absent', () => {
    renderWithProviders(<BaseNode nodeId="node-2" />, {
      atomSeeds: [[nodeExecutionFamily('node-2'), { nodeId: 'node-2', status: 'idle' }]],
    });
    expect(screen.getByText('Unknown Task')).toBeInTheDocument();
  });

  it('chaotic path: failed execution state surfaces explicit error message', () => {
    renderWithProviders(<BaseNode nodeId="node-3" defaultError="Default failure" />, {
      atomSeeds: [
        [nodeExecutionFamily('node-3'), { nodeId: 'node-3', status: 'failed', error: 'Boom' }],
      ],
    });
    expect(screen.getByText('Error:')).toBeInTheDocument();
    expect(screen.getByText('Boom')).toBeInTheDocument();
  });
});
