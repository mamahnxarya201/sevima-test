import React, { type ReactElement, type PropsWithChildren } from 'react';
import { render, type RenderOptions } from '@testing-library/react';
import { Provider, createStore, type WritableAtom } from 'jotai';
import { ReactFlowProvider } from '@xyflow/react';

type AtomSeed = readonly [WritableAtom<unknown, [unknown], void>, unknown];

type Options = Omit<RenderOptions, 'wrapper'> & {
  atomSeeds?: AtomSeed[];
  withReactFlow?: boolean;
};

export function renderWithProviders(ui: ReactElement, options: Options = {}) {
  const { atomSeeds = [], withReactFlow = false, ...rest } = options;
  const store = createStore();
  for (const [atom, value] of atomSeeds) {
    store.set(atom, value);
  }

  function Wrapper({ children }: PropsWithChildren) {
    const content = withReactFlow ? <ReactFlowProvider>{children}</ReactFlowProvider> : children;
    return <Provider store={store}>{content}</Provider>;
  }

  return {
    ...render(ui, { wrapper: Wrapper, ...rest }),
    store,
  };
}
