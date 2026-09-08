import React from 'react';
import {
  render,
  screen,
} from '@testing-library/react';

import userEvent from '@testing-library/user-event';

import {
  describe,
  expect,
  it,
} from 'vitest';

import App from '../../src/App';

describe('Customer pickup workflow', () => {
  async function openCustomerWorkflow() {
    const user = userEvent.setup();

    render(<App />);

    await user.click(
      screen.getByText(/Customer/i),
    );

    return user;
  }

  it('requires locker ID', async () => {
    const user =
      await openCustomerWorkflow();

    const quote =
      screen.getByRole('button', {
        name: /quote|calculate/i,
      });

    await user.click(quote);

    expect(
      screen.getByText(
        /locker.*required/i,
      ),
    ).toBeInTheDocument();
  });

  it('requires pickup code', async () => {
    const user =
      await openCustomerWorkflow();

    const locker =
      screen.getByLabelText(/locker id/i);

    await user.type(
      locker,
      '11111111-1111-4111-8111-111111111111',
    );

    const quote =
      screen.getByRole('button', {
        name: /quote|calculate/i,
      });

    await user.click(quote);

    expect(
      screen.getByText(
        /pickup code.*required/i,
      ),
    ).toBeInTheDocument();
  });

  it('requires a six digit pickup code', async () => {
    const user =
      await openCustomerWorkflow();

    await user.type(
      screen.getByLabelText(/locker id/i),
      '11111111-1111-4111-8111-111111111111',
    );

    await user.type(
      screen.getByLabelText(/pickup code/i),
      '12345',
    );

    await user.click(
      screen.getByRole('button', {
        name: /quote|calculate/i,
      }),
    );

    expect(
      screen.getByText(
        /pickup code.*6/i,
      ),
    ).toBeInTheDocument();
  });
});